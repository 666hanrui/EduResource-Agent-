"""VisualAgent 单元测试 —— 主要验证规则兜底路径。"""

from __future__ import annotations

import asyncio

try:
    import pytest
except ImportError:
    class _PytestMarkStub:
        def asyncio(self, fn):
            return fn

    class _PytestStub:
        mark = _PytestMarkStub()

    pytest = _PytestStub()  # type: ignore[assignment]

from app.agents.document_agent import ProfileSummary
from app.agents.event_bus import EventBus
from app.agents.visual_agent import (
    VisualAgent,
    VisualAgentInput,
    _rule_based_visual,
)
from app.schemas.resource import KnowledgeBreakdown, ResourceTaskParams
from app.services.llm_service import LLMConfig, LLMService


def _payload() -> VisualAgentInput:
    return VisualAgentInput(
        knowledge_breakdown=KnowledgeBreakdown(
            concept="链表插入",
            key_points=["定位前驱", "改 next 顺序"],
        ),
        params=ResourceTaskParams(),
        profile_summary=ProfileSummary(preference=["animation", "mindmap"]),
    )


def test_rule_based_visual_mindmap_starts_with_concept() -> None:
    result = _rule_based_visual(_payload())
    first_line = result.mindmap_md.splitlines()[0]
    assert first_line.startswith("# 链表插入")


def test_rule_based_visual_mindmap_covers_all_key_points() -> None:
    payload = _payload()
    result = _rule_based_visual(payload)
    md = result.mindmap_md
    for kp in payload.knowledge_breakdown.key_points:
        assert kp in md


def test_rule_based_visual_animation_at_least_three_steps() -> None:
    result = _rule_based_visual(_payload())
    assert len(result.animation.steps) >= 3
    # 强约束：links_to_doc_section 不能为空
    for step in result.animation.steps:
        assert step.links_to_doc_section


@pytest.mark.asyncio
async def test_visual_agent_falls_back_when_llm_unreachable() -> None:
    bus = EventBus()
    llm = LLMService(LLMConfig(base_url="http://127.0.0.1:1", api_key="dummy"))
    agent = VisualAgent(bus, llm)
    try:
        result = await agent.run("task_visual_test", _payload())
        assert result.rationale.model_name == "rule-based-fallback"
        assert result.mindmap_md.startswith("# 链表插入")
    finally:
        await llm.aclose()


def test_run_async_smoke() -> None:
    asyncio.run(test_visual_agent_falls_back_when_llm_unreachable())
