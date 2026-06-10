from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.agents.generate_flow import GenerateOutputs, GenerateRequest, GenerateSelectionContext
from app.agents.langgraph_tool_calling_flow import ToolCallingFlow
from app.schemas.profile import Profile, Progress
from app.schemas.resource import (
    KnowledgeBreakdown,
    PlannerOutput,
    ResourceTask,
    ResourceTaskParams,
)


class _FakeEventBus:
    async def publish(self, event: object) -> None:
        return None


class _FakeRegistry:
    def __init__(self, agents: dict[str, object]) -> None:
        self.agents = agents

    def get(self, name: str) -> object:
        return self.agents[name]


class _CaptureAgent:
    def __init__(self, return_value: object | None = None) -> None:
        self.payloads: list[Any] = []
        self.return_value = return_value

    async def run(self, task_id: str, payload: Any) -> object:
        self.payloads.append(payload)
        return self.return_value if self.return_value is not None else object()


def _plan() -> PlannerOutput:
    return PlannerOutput(
        knowledge_breakdown=KnowledgeBreakdown(concept="graph", key_points=["shortest path"]),
        tasks=[
            ResourceTask(
                task_id="doc",
                agent="DocumentAgent",
                params=ResourceTaskParams(focus="doc-focus", difficulty=2),
            ),
            ResourceTask(
                task_id="exercise",
                agent="ExerciseAgent",
                params=ResourceTaskParams(focus="exercise-focus", difficulty=4),
            ),
            ResourceTask(
                task_id="visual",
                agent="VisualAgent",
                params=ResourceTaskParams(focus="visual-focus", difficulty=3),
            ),
            ResourceTask(
                task_id="code",
                agent="CodeAgent",
                depends_on=["DocumentAgent"],
                params=ResourceTaskParams(focus="code-focus", difficulty=5),
            ),
        ],
    )


@pytest.mark.asyncio
async def test_tool_calling_flow_uses_agent_specific_planner_params() -> None:
    exercise_agent = _CaptureAgent()
    visual_agent = _CaptureAgent()
    code_agent = _CaptureAgent()
    flow = ToolCallingFlow(
        registry=_FakeRegistry(
            {
                "ExerciseAgent": exercise_agent,
                "VisualAgent": visual_agent,
                "CodeAgent": code_agent,
            }
        ),  # type: ignore[arg-type]
        event_bus=_FakeEventBus(),  # type: ignore[arg-type]
        llm_service=object(),  # type: ignore[arg-type]
    )
    req = GenerateRequest(
        student_id="stu_001",
        knowledge_id="graph-shortest-path",
        knowledge_name="最短路径",
        languages=["python"],
    )
    outputs = GenerateOutputs(plan=_plan())
    outputs.document = object()  # CodeAgent only needs the dependency marker here.

    await flow._tool_generate_exercise("task_1", req, outputs)
    await flow._tool_generate_visual("task_1", req, outputs)
    await flow._tool_generate_code("task_1", req, outputs)

    assert exercise_agent.payloads[0].params.focus == "exercise-focus"
    assert exercise_agent.payloads[0].params.difficulty == 4
    assert visual_agent.payloads[0].params.focus == "visual-focus"
    assert visual_agent.payloads[0].params.difficulty == 3
    assert code_agent.payloads[0].params.focus == "code-focus"
    assert code_agent.payloads[0].params.difficulty == 5


@pytest.mark.asyncio
async def test_tool_calling_flow_excludes_teacher_console_from_profile_conversation() -> None:
    profile = Profile(
        major="计算机科学与技术",
        knowledge_levels={"tree": 0.5},
        goal="补救递归栈",
        style=["diagram"],
        weakness=["递归栈顺序混乱"],
        preference=["animation"],
        pace="medium",
        progress=Progress(current_chapter="tree", completed=[]),
    )
    profile_agent = _CaptureAgent(return_value=SimpleNamespace(profile=profile))
    flow = ToolCallingFlow(
        registry=_FakeRegistry({"ProfileAgent": profile_agent}),  # type: ignore[arg-type]
        event_bus=_FakeEventBus(),  # type: ignore[arg-type]
        llm_service=object(),  # type: ignore[arg-type]
    )
    req = GenerateRequest(
        student_id="stu_018",
        knowledge_id="tree",
        knowledge_name="二叉树遍历",
        conversation=[],
        selection_context=GenerateSelectionContext(
            source="teacher_console",
            reason="老师想生成补救课",
            suggested_difficulty=2,
        ),
    )
    outputs = GenerateOutputs()

    await flow._tool_extract_profile("task_1", req, outputs)

    assert profile_agent.payloads[0].conversation == []
    assert outputs.profile == profile
