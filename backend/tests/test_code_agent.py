"""CodeAgent 单元测试 —— 主要验证规则兜底路径。"""

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

from app.agents.code_agent import CodeAgent, CodeAgentInput, _rule_based_code
from app.agents.document_agent import ProfileSummary
from app.agents.event_bus import EventBus
from app.schemas.resource import KnowledgeBreakdown, ResourceTaskParams
from app.services.llm_service import LLMConfig, LLMService


def _payload(languages: list[str] | None = None) -> CodeAgentInput:
    return CodeAgentInput(
        knowledge_breakdown=KnowledgeBreakdown(
            concept="链表插入",
            key_points=["定位前驱", "改 next 顺序", "返回 head"],
        ),
        params=ResourceTaskParams(difficulty=3),
        profile_summary=ProfileSummary(weakness=["指针修改顺序"]),
        languages=languages or ["python", "java"],  # type: ignore[arg-type]
    )


def test_rule_based_code_emits_python_and_java() -> None:
    result = _rule_based_code(_payload())
    langs = [s.lang for s in result.code_samples]
    assert "python" in langs
    assert "java" in langs


def test_rule_based_code_respects_language_filter() -> None:
    result = _rule_based_code(_payload(["python"]))
    assert [s.lang for s in result.code_samples] == ["python"]


def test_rule_based_code_step_comments_in_range() -> None:
    result = _rule_based_code(_payload(["python"]))
    sample = result.code_samples[0]
    line_count = len(sample.code.splitlines())
    for sc in sample.step_comments:
        assert 1 <= sc.line_range[0] <= line_count
        assert sc.line_range[1] <= line_count


def test_rule_based_code_trace_has_at_least_three_steps() -> None:
    result = _rule_based_code(_payload(["python"]))
    assert len(result.code_samples[0].trace) >= 3


@pytest.mark.asyncio
async def test_code_agent_falls_back_when_llm_unreachable() -> None:
    bus = EventBus()
    llm = LLMService(LLMConfig(base_url="http://127.0.0.1:1", api_key="dummy"))
    agent = CodeAgent(bus, llm)
    try:
        result = await agent.run("task_code_test", _payload())
        assert result.rationale.model_name == "rule-based-fallback"
        assert len(result.code_samples) == 2
    finally:
        await llm.aclose()


def test_run_async_smoke() -> None:
    asyncio.run(test_code_agent_falls_back_when_llm_unreachable())
