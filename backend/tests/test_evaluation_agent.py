"""EvaluationAgent 单元测试 —— 验证滑动公式 + 兜底逻辑。"""

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

from app.agents.evaluation_agent import (
    AnswerRecord,
    EvaluationAgent,
    EvaluationAgentInput,
    _next_difficulty,
    _rule_based_evaluation,
)
from app.agents.event_bus import EventBus
from app.schemas.profile import Profile
from app.services.llm_service import LLMConfig, LLMService


def _make_payload(
    correct_count: int = 1, total: int = 3, weakness: list[str] | None = None
) -> EvaluationAgentInput:
    answers: list[AnswerRecord] = []
    for i in range(total):
        is_correct = i < correct_count
        answers.append(
            AnswerRecord(
                qid=f"q{i + 1}",
                user_answer="A" if is_correct else "B",
                correct_answer="A",
                time_spent_sec=60,
                tags=["指针修改顺序"],
            )
        )
    return EvaluationAgentInput(
        session_id="s1",
        knowledge_id="ds_linked_list",
        profile=Profile(
            knowledge_levels={"ds_linked_list": 0.5},
            weakness=weakness or [],
        ),
        answers=answers,
    )


def test_rule_based_evaluation_observed_rate() -> None:
    payload = _make_payload(correct_count=2, total=4)
    result = _rule_based_evaluation(payload)
    assert result.evaluation_delta.observed_correct_rate == 0.5


def test_rule_based_evaluation_sliding_formula() -> None:
    """estimated_mastery = 0.5 × 0.7 + 0.5 × 0.3 = 0.5"""
    payload = _make_payload(correct_count=2, total=4)
    result = _rule_based_evaluation(payload)
    assert abs(result.evaluation_delta.estimated_mastery - 0.5) < 1e-3


def test_rule_based_evaluation_new_weakness_when_two_wrong_with_same_tag() -> None:
    payload = _make_payload(correct_count=1, total=3)  # 2 错都带相同 tag
    result = _rule_based_evaluation(payload)
    assert "指针修改顺序" in result.evaluation_delta.new_weakness


def test_rule_based_evaluation_resolved_weakness_when_all_correct() -> None:
    payload = _make_payload(correct_count=3, total=3, weakness=["指针修改顺序"])
    result = _rule_based_evaluation(payload)
    assert "指针修改顺序" in result.evaluation_delta.resolved_weakness


def test_rule_based_evaluation_no_answers_returns_neutral_delta() -> None:
    payload = EvaluationAgentInput(
        session_id="s2",
        knowledge_id="ds_linked_list",
        profile=Profile(knowledge_levels={"ds_linked_list": 0.6}),
        answers=[],
    )
    result = _rule_based_evaluation(payload)
    assert result.evaluation_delta.estimated_mastery == 0.6
    assert result.evaluation_delta.observed_correct_rate == 0.0


def test_next_difficulty_thresholds() -> None:
    assert _next_difficulty(0.2) == 2
    assert _next_difficulty(0.4) == 3
    assert _next_difficulty(0.6) == 4
    assert _next_difficulty(0.85) == 5


@pytest.mark.asyncio
async def test_evaluation_agent_falls_back_when_llm_unreachable() -> None:
    bus = EventBus()
    llm = LLMService(LLMConfig(base_url="http://127.0.0.1:1", api_key="dummy"))
    agent = EvaluationAgent(bus, llm)
    try:
        result = await agent.run("task_eval_test", _make_payload(2, 4))
        assert result.evaluation_delta.knowledge_id == "ds_linked_list"
        # 兜底路径下 narrative 必须非空
        assert result.narrative
    finally:
        await llm.aclose()


def test_run_async_smoke() -> None:
    asyncio.run(test_evaluation_agent_falls_back_when_llm_unreachable())
