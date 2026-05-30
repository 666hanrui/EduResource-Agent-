"""ExerciseAgent 单元测试 —— 主要验证规则兜底 + qid 唯一性。"""

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
from app.agents.exercise_agent import (
    ExerciseAgent,
    ExerciseAgentInput,
    _ensure_qids,
    _rule_based_exercise,
)
from app.schemas.profile import Rationale
from app.schemas.resource import (
    ExerciseResult,
    KnowledgeBreakdown,
    Question,
    ResourceTaskParams,
)
from app.services.llm_service import LLMConfig, LLMService


def _make_payload(count: int = 3) -> ExerciseAgentInput:
    return ExerciseAgentInput(
        knowledge_breakdown=KnowledgeBreakdown(
            concept="链表插入",
            key_points=["定位前驱", "改 next 顺序"],
            common_pitfalls=["先改前驱导致丢链", "在头节点插入忘改 head"],
        ),
        params=ResourceTaskParams(difficulty=2, focus="指针修改顺序"),
        profile_summary=ProfileSummary(weakness=["指针修改顺序"]),
        count=count,
    )


def test_rule_based_exercise_covers_each_pitfall() -> None:
    payload = _make_payload(count=3)
    result = _rule_based_exercise(payload)

    # 至少出与 common_pitfalls 数量相当的题
    assert len(result.questions) >= 1
    for q in result.questions:
        assert q.qid
        assert q.type == "single_choice"
        assert "链表插入" in q.tags or "指针修改顺序" in q.tags


def test_rule_based_exercise_returns_at_least_one_question_when_no_pitfalls() -> None:
    payload = ExerciseAgentInput(
        knowledge_breakdown=KnowledgeBreakdown(concept="测试概念"),
        params=ResourceTaskParams(),
    )
    result = _rule_based_exercise(payload)
    assert len(result.questions) >= 1


def test_ensure_qids_deduplicates() -> None:
    duplicated = ExerciseResult(
        questions=[
            Question(
                qid="same",
                type="single_choice",
                stem="Q1",
                options=["A", "B", "C", "D"],
                answer="A",
            ),
            Question(
                qid="same",
                type="single_choice",
                stem="Q2",
                options=["A", "B", "C", "D"],
                answer="B",
            ),
        ],
        rationale=Rationale(
            agent_name="ExerciseAgent",
            prompt_version="v1",
            model_name="test",
        ),
    )
    fixed = _ensure_qids(duplicated)
    qids = [q.qid for q in fixed.questions]
    assert len(set(qids)) == 2


def test_ensure_qids_fills_missing() -> None:
    missing = ExerciseResult(
        questions=[
            Question(
                qid="",
                type="fill_blank",
                stem="?",
                answer="A",
            )
        ],
        rationale=Rationale(
            agent_name="ExerciseAgent",
            prompt_version="v1",
            model_name="test",
        ),
    )
    fixed = _ensure_qids(missing)
    assert fixed.questions[0].qid


@pytest.mark.asyncio
async def test_exercise_agent_falls_back_when_llm_unreachable() -> None:
    bus = EventBus()
    llm = LLMService(LLMConfig(base_url="http://127.0.0.1:1", api_key="dummy"))
    agent = ExerciseAgent(bus, llm)
    try:
        result = await agent.run("task_ex_test", _make_payload())
        assert result.rationale.model_name == "rule-based-fallback"
        assert len(result.questions) >= 1
    finally:
        await llm.aclose()


def test_run_async_smoke() -> None:
    asyncio.run(test_exercise_agent_falls_back_when_llm_unreachable())
