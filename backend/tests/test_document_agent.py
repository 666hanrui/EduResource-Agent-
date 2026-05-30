"""DocumentAgent 单元测试 —— 主要验证规则兜底路径。"""

from __future__ import annotations

import asyncio

try:
    import pytest
except ImportError:  # 允许无 pytest 时也能直接 import 调用
    class _PytestMarkStub:
        def asyncio(self, fn):
            return fn

    class _PytestStub:
        mark = _PytestMarkStub()

    pytest = _PytestStub()  # type: ignore[assignment]

from app.agents.document_agent import (
    DocumentAgent,
    DocumentAgentInput,
    ProfileSummary,
    _rule_based_document,
)
from app.agents.event_bus import EventBus
from app.schemas.resource import KnowledgeBreakdown, ResourceTaskParams
from app.services.llm_service import LLMConfig, LLMService


def _make_payload() -> DocumentAgentInput:
    return DocumentAgentInput(
        knowledge_breakdown=KnowledgeBreakdown(
            concept="链表插入",
            key_points=["定位前驱", "新节点 next 指向后继", "前驱 next 指向新节点"],
            common_pitfalls=["先改前驱 next 导致丢链"],
            references=["《数据结构 C 语言版》P127-130"],
        ),
        params=ResourceTaskParams(difficulty=3, focus="指针修改顺序", style_hint="diagram"),
        profile_summary=ProfileSummary(
            weakness=["指针修改顺序"], preference=["document"]
        ),
    )


def test_rule_based_document_uses_key_points_as_sections() -> None:
    payload = _make_payload()
    result = _rule_based_document(payload)

    headings = [s.heading for s in result.document.sections]
    assert "是什么" in headings
    assert "怎么做" in headings
    assert "容易错" in headings
    assert result.document.title == "链表插入"


def test_rule_based_document_includes_diagram() -> None:
    payload = _make_payload()
    result = _rule_based_document(payload)

    assert len(result.document.key_diagrams) >= 1
    assert result.document.key_diagrams[0].type == "step_diagram"


def test_rule_based_document_addresses_weakness_in_rationale() -> None:
    payload = _make_payload()
    result = _rule_based_document(payload)

    assert result.rationale.addressed_weakness == ["指针修改顺序"]
    assert result.rationale.agent_name == "DocumentAgent"
    assert result.rationale.prompt_version == "v1"


def test_rule_based_document_handles_empty_breakdown() -> None:
    payload = DocumentAgentInput(
        knowledge_breakdown=KnowledgeBreakdown(),
        params=ResourceTaskParams(),
    )
    result = _rule_based_document(payload)

    # 哪怕全空也要至少给一段"是什么" + 一张图
    assert len(result.document.sections) >= 1
    assert len(result.document.key_diagrams) >= 1


@pytest.mark.asyncio
async def test_document_agent_falls_back_when_llm_unreachable() -> None:
    """LLM base_url 是无效地址时，应触发规则兜底而不是抛错。"""
    bus = EventBus()
    llm = LLMService(LLMConfig(base_url="http://127.0.0.1:1", api_key="dummy"))
    agent = DocumentAgent(bus, llm)
    try:
        result = await agent.run("task_doc_test", _make_payload())
        assert result.document.title == "链表插入"
        assert result.rationale.model_name == "rule-based-fallback"
    finally:
        await llm.aclose()


def test_run_async_smoke() -> None:
    """同步 wrapper 让没装 pytest-asyncio 时也能跑这个用例。"""
    asyncio.run(test_document_agent_falls_back_when_llm_unreachable())
