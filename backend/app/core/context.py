"""
应用上下文 —— 单例化的 EventBus / LLMService / AgentRegistry / Orchestrator / Stores。

FastAPI 启动时构造一次，依赖注入分发到各路由。
"""

from __future__ import annotations

from dataclasses import dataclass

from ..agents.code_agent import CodeAgent
from ..agents.document_agent import DocumentAgent
from ..agents.evaluation_agent import EvaluationAgent
from ..agents.event_bus import EventBus
from ..agents.exercise_agent import ExerciseAgent
from ..agents.orchestrator import Orchestrator
from ..agents.planner_agent import PlannerAgent
from ..agents.profile_agent import ProfileAgent
from ..agents.registry import AgentRegistry
from ..agents.visual_agent import VisualAgent
from ..services.generate_store import SQLiteGenerateStore
from ..services.llm_service import LLMConfig, LLMService
from ..services.openmaic_client import OpenMAICClient
from ..services.openmaic_main_tools import OpenMAICMainTools
from ..services.resource_package_store import SQLiteResourcePackageStore
from ..services.student_learning_store import SQLiteStudentLearningStore
from ..services.teacher_store import SQLiteTeacherStore
from .config import Settings, get_settings


@dataclass
class AppContext:
    settings: Settings
    event_bus: EventBus
    llm: LLMService
    registry: AgentRegistry
    orchestrator: Orchestrator
    generate_store: SQLiteGenerateStore
    resource_package_store: SQLiteResourcePackageStore
    student_learning_store: SQLiteStudentLearningStore
    teacher_store: SQLiteTeacherStore
    openmaic_client: OpenMAICClient
    openmaic_tools: OpenMAICMainTools

    async def aclose(self) -> None:
        await self.llm.aclose()


def build_context(settings: Settings | None = None) -> AppContext:
    s = settings or get_settings()

    event_bus = EventBus()
    llm = LLMService(
        LLMConfig(
            base_url=s.spark_base_url,
            api_key=s.spark_api_key,
            model=s.spark_model,
        )
    )

    generate_store = SQLiteGenerateStore()
    resource_package_store = SQLiteResourcePackageStore()
    student_learning_store = SQLiteStudentLearningStore()
    teacher_store = SQLiteTeacherStore()
    openmaic_client = OpenMAICClient(s.openmaic_base_url)
    openmaic_tools = OpenMAICMainTools(
        settings=s,
        package_store=resource_package_store,
        learning_store=student_learning_store,
        client=openmaic_client,
    )

    registry = AgentRegistry()
    registry.register(ProfileAgent(event_bus, llm))
    registry.register(PlannerAgent(event_bus, llm))
    registry.register(DocumentAgent(event_bus, llm))
    registry.register(ExerciseAgent(event_bus, llm))
    registry.register(CodeAgent(event_bus, llm))
    registry.register(VisualAgent(event_bus, llm))
    registry.register(EvaluationAgent(event_bus, llm))

    orchestrator = Orchestrator(
        registry,
        event_bus,
        llm_service=llm,
        openmaic_tools=openmaic_tools,
    )

    return AppContext(
        settings=s,
        event_bus=event_bus,
        llm=llm,
        registry=registry,
        orchestrator=orchestrator,
        generate_store=generate_store,
        resource_package_store=resource_package_store,
        student_learning_store=student_learning_store,
        teacher_store=teacher_store,
        openmaic_client=openmaic_client,
        openmaic_tools=openmaic_tools,
    )
