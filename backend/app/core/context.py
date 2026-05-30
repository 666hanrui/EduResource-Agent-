"""
应用上下文 —— 单例化的 EventBus / LLMService / AgentRegistry / Orchestrator。

FastAPI 启动时构造一次，依赖注入分发到各路由。
"""

from __future__ import annotations

from dataclasses import dataclass

from ..agents.code_agent import CodeAgent
from ..agents.document_agent import DocumentAgent
from ..agents.evaluation_agent import EvaluationAgent
from ..agents.event_bus import EventBus
from ..agents.exercise_agent import ExerciseAgent
from ..agents.generate_flow import GenerateFlow
from ..agents.orchestrator import Orchestrator
from ..agents.planner_agent import PlannerAgent
from ..agents.profile_agent import ProfileAgent
from ..agents.registry import AgentRegistry
from ..agents.visual_agent import VisualAgent
from ..services.llm_service import LLMConfig, LLMService
from .config import Settings, get_settings


@dataclass
class AppContext:
    settings: Settings
    event_bus: EventBus
    llm: LLMService
    registry: AgentRegistry
    orchestrator: Orchestrator
    generate_flow: GenerateFlow

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

    registry = AgentRegistry()
    registry.register(ProfileAgent(event_bus, llm))
    registry.register(PlannerAgent(event_bus, llm))
    registry.register(DocumentAgent(event_bus, llm))
    registry.register(ExerciseAgent(event_bus, llm))
    registry.register(CodeAgent(event_bus, llm))
    registry.register(VisualAgent(event_bus, llm))
    registry.register(EvaluationAgent(event_bus, llm))

    orchestrator = Orchestrator(registry, event_bus)
    generate_flow = GenerateFlow(registry, event_bus)

    return AppContext(
        settings=s,
        event_bus=event_bus,
        llm=llm,
        registry=registry,
        orchestrator=orchestrator,
        generate_flow=generate_flow,
    )
