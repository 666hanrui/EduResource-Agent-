"""PlannerAgent 单元测试 —— 重点验证规则兜底与 DAG 校验。"""

from __future__ import annotations

import asyncio
from typing import Any

from app.agents.event_bus import EventBus
from app.agents.planner_agent import (
    PlannerAgent,
    PlannerAgentInput,
    TargetKnowledge,
    _rule_based_plan,
    _validate_dag,
)
from app.schemas.profile import Profile
from app.schemas.resource import ResourceTask, ResourceTaskParams


def test_rule_plan_picks_difficulty_2_for_low_mastery() -> None:
    payload = PlannerAgentInput(
        profile=Profile(knowledge_levels={"ds_linked_list": 0.3}),
        target_knowledge=TargetKnowledge(id="ds_linked_list", name="链表"),
    )
    plan = _rule_based_plan(payload)
    assert plan.knowledge_breakdown.concept == "链表"
    assert len(plan.tasks) == 4
    doc = next(t for t in plan.tasks if t.agent == "DocumentAgent")
    assert doc.params.difficulty == 2


def test_rule_plan_respects_requested_types() -> None:
    payload = PlannerAgentInput(
        profile=Profile(knowledge_levels={"ds_tree": 0.8}),
        target_knowledge=TargetKnowledge(id="ds_tree", name="二叉树"),
        requested_types=["DocumentAgent", "VisualAgent"],
    )
    plan = _rule_based_plan(payload)
    assert {t.agent for t in plan.tasks} == {"DocumentAgent", "VisualAgent"}
    # 高掌握度走难度 4
    assert all(t.params.difficulty in (3, 4) for t in plan.tasks)


def test_code_agent_depends_on_document_in_fallback() -> None:
    payload = PlannerAgentInput(
        profile=Profile(),
        target_knowledge=TargetKnowledge(id="x", name="x"),
    )
    plan = _rule_based_plan(payload)
    doc = next(t for t in plan.tasks if t.agent == "DocumentAgent")
    code = next(t for t in plan.tasks if t.agent == "CodeAgent")
    assert code.depends_on == [doc.task_id]


def test_validate_dag_detects_cycle() -> None:
    p = ResourceTaskParams()
    tasks = [
        ResourceTask(task_id="a", agent="DocumentAgent", depends_on=["b"], params=p),
        ResourceTask(task_id="b", agent="ExerciseAgent", depends_on=["a"], params=p),
    ]
    try:
        _validate_dag(tasks)
    except ValueError as e:
        assert "环" in str(e)
    else:
        raise AssertionError("应当检测出环")


def test_validate_dag_detects_missing_dep() -> None:
    p = ResourceTaskParams()
    tasks = [
        ResourceTask(task_id="a", agent="DocumentAgent", depends_on=["ghost"], params=p),
    ]
    try:
        _validate_dag(tasks)
    except ValueError as e:
        assert "不存在" in str(e)
    else:
        raise AssertionError("应当检测出非法依赖")


class _FakeLLM:
    async def generate_structured(self, *args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("forced fail")


def test_planner_agent_falls_back_when_llm_fails() -> None:
    bus = EventBus()
    agent = PlannerAgent(event_bus=bus, llm_service=_FakeLLM())  # type: ignore[arg-type]
    payload = PlannerAgentInput(
        profile=Profile(weakness=["指针修改顺序"], style=["diagram"]),
        target_knowledge=TargetKnowledge(id="ds_linked_list", name="链表插入"),
    )

    async def _run() -> None:
        result = await agent.run("task_planner_test", payload)
        assert len(result.tasks) >= 3
        # weakness 必须传到 focus
        assert all("指针" in t.params.focus or "链表" in t.params.focus for t in result.tasks)
        await bus.close_task("task_planner_test")

    asyncio.run(_run())
