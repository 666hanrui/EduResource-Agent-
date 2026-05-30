"""ProfileAgent 单元测试 —— 重点验证规则兜底与画像合并。"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.agents.event_bus import EventBus
from app.agents.profile_agent import (
    ConversationTurn,
    ProfileAgent,
    ProfileAgentInput,
    _merge_profile,
    _rule_based_fallback,
)
from app.schemas.profile import EvaluationDelta, Profile, Progress


def test_rule_based_fallback_picks_diagram_when_user_mentions_image() -> None:
    payload = ProfileAgentInput(
        session_id="s1",
        conversation=[
            ConversationTurn(role="student", text="我喜欢看动画和图解"),
        ],
    )
    result = _rule_based_fallback(payload)
    assert "diagram" in result.profile.style
    assert "animation" in result.profile.preference
    assert result.rationale.confidence == 0.3


def test_merge_profile_applies_sliding_update_on_delta_knowledge() -> None:
    prior = Profile(
        major="计算机",
        knowledge_levels={"ds_linked_list": 0.6},
        weakness=["旧的薄弱点"],
    )
    new = Profile(knowledge_levels={"ds_tree": 0.4}, weakness=["新薄弱点"])
    delta = EvaluationDelta(
        knowledge_id="ds_linked_list",
        observed_correct_rate=0.2,
        estimated_mastery=0.48,
        new_weakness=["指针修改顺序"],
        resolved_weakness=["旧的薄弱点"],
    )

    merged = _merge_profile(prior=prior, new=new, delta=delta)

    # 滑动更新：0.6 × 0.7 + 0.2 × 0.3 = 0.48
    assert abs(merged.knowledge_levels["ds_linked_list"] - 0.48) < 1e-6
    # 新增的 ds_tree 也保留
    assert merged.knowledge_levels["ds_tree"] == 0.4
    # 旧薄弱点已 resolve，新薄弱点合并
    assert "旧的薄弱点" not in merged.weakness
    assert "指针修改顺序" in merged.weakness
    assert "新薄弱点" in merged.weakness
    # major 在 new 是 unknown 时保留 prior
    assert merged.major == "计算机"


def test_merge_progress_keeps_completed_unique_in_order() -> None:
    prior = Profile(progress=Progress(current_chapter="ch_1", completed=["a", "b"]))
    new = Profile(progress=Progress(current_chapter="ch_2", completed=["b", "c"]))
    merged = _merge_profile(prior=prior, new=new, delta=None)
    assert merged.progress.completed == ["a", "b", "c"]
    assert merged.progress.current_chapter == "ch_2"


class _FakeLLM:
    """伪 LLM：generate_structured 直接抛错以触发兜底。"""

    async def generate_structured(self, *args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("模拟 LLM 三次失败")


def test_profile_agent_falls_back_when_llm_fails() -> None:
    bus = EventBus()
    agent = ProfileAgent(event_bus=bus, llm_service=_FakeLLM())  # type: ignore[arg-type]

    payload = ProfileAgentInput(
        session_id="s2",
        conversation=[ConversationTurn(role="student", text="我想看图解")],
    )

    async def _run() -> None:
        result = await agent.run("task_test", payload)
        assert "diagram" in result.profile.style
        assert result.rationale.confidence == 0.3
        await bus.close_task("task_test")

    asyncio.run(_run())
