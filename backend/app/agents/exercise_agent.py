"""
ExerciseAgent —— 自适应题目生成 Agent。

输入：KnowledgeBreakdown + ResourceTaskParams + 学生画像摘要 + 题目数量
输出：ExerciseResult（含若干 Question + rationale 溯源）
失败兜底：基于 common_pitfalls 拼最简单选题，保证演示不空白。
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from pydantic import BaseModel, Field

from ..schemas.profile import Rationale
from ..schemas.resource import (
    ExerciseResult,
    KnowledgeBreakdown,
    Question,
    ResourceTaskParams,
)
from ..services.llm_service import LLMService
from .base import AgentRuntime, BaseAgent
from .document_agent import ProfileSummary
from .event_bus import EventBus

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "exercise_agent_v1.md"


class ExerciseAgentInput(BaseModel):
    knowledge_breakdown: KnowledgeBreakdown
    params: ResourceTaskParams
    profile_summary: ProfileSummary = Field(default_factory=ProfileSummary)
    count: int = Field(default=5, ge=1, le=20)


class ExerciseAgent(BaseAgent[ExerciseAgentInput, ExerciseResult]):
    """自适应题目生成 Agent。"""

    name = "ExerciseAgent"
    prompt_version = "v1"

    def __init__(self, event_bus: EventBus, llm_service: LLMService) -> None:
        super().__init__(event_bus)
        self.llm = llm_service
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    async def _run_impl(
        self, runtime: AgentRuntime, payload: ExerciseAgentInput
    ) -> ExerciseResult:
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": payload.model_dump_json(indent=2)},
        ]

        try:
            result, llm_response = await self.llm.generate_structured(
                messages,
                schema=ExerciseResult,
                temperature=0.3,
                max_retries=3,
            )
            runtime.token_used = llm_response.total_tokens
        except Exception as exc:
            logger.warning("ExerciseAgent LLM 三次失败，启用规则兜底：%s", exc)
            runtime.extra["fallback"] = True
            return _rule_based_exercise(payload)

        # 题目去重 + qid 兜底（即使 LLM 漏给 qid 也能补齐）
        result = _ensure_qids(result)

        await self.emit_delta(
            runtime,
            {
                "stage": "exercise_finalized",
                "question_count": len(result.questions),
                "addressed_weakness": result.rationale.addressed_weakness,
            },
        )
        return result


# ─────────────────────────────── qid 兜底 ───────────────────────────────


def _ensure_qids(result: ExerciseResult) -> ExerciseResult:
    """LLM 偶尔会漏 qid 或重复 qid，这里补齐确保唯一。"""
    seen: set[str] = set()
    fixed: list[Question] = []
    for q in result.questions:
        qid = q.qid or _short_uuid()
        while qid in seen:
            qid = _short_uuid()
        seen.add(qid)
        fixed.append(q.model_copy(update={"qid": qid}))
    return result.model_copy(update={"questions": fixed})


# ─────────────────────────────── 规则兜底 ───────────────────────────────


def _rule_based_exercise(payload: ExerciseAgentInput) -> ExerciseResult:
    """无 LLM 时基于 common_pitfalls 拼最简单选题。"""
    kb = payload.knowledge_breakdown
    pitfalls = kb.common_pitfalls or [kb.concept or "知识点"]

    questions: list[Question] = []
    for i, pit in enumerate(pitfalls[: payload.count]):
        qid = _short_uuid()
        questions.append(
            Question(
                qid=qid,
                type="single_choice",
                stem=f"关于「{kb.concept}」，下列哪种说法最准确地刻画了易错点：{pit}？",
                options=[
                    f"A. {pit}（正确）",
                    "B. 与本知识点无关的描述",
                    "C. 表面看似正确但缺关键步骤的说法",
                    "D. 完全相反的说法",
                ],
                answer="A",
                explanation=f"本题考查易错点「{pit}」。"
                f"该问题往往出现在 {kb.concept} 的实操中，需要按 key_points 顺序谨慎处理。",
                tags=[kb.concept, pit],
                difficulty=max(1, min(5, payload.params.difficulty)),
                expected_time_sec=60,
            )
        )

    if not questions:
        # 最低保底
        qid = _short_uuid()
        questions.append(
            Question(
                qid=qid,
                type="fill_blank",
                stem=f"请用一句话说明 {kb.concept} 的核心步骤。",
                answer=" / ".join(kb.key_points) or kb.concept,
                explanation="兜底题，请结合 KnowledgeBreakdown.key_points 作答。",
                tags=[kb.concept],
                difficulty=payload.params.difficulty,
                expected_time_sec=120,
            )
        )

    return ExerciseResult(
        questions=questions,
        rationale=Rationale(
            matched_profile=[
                f"weakness:{w}" for w in payload.profile_summary.weakness
            ]
            or ["fallback"],
            addressed_weakness=payload.profile_summary.weakness,
            difficulty_adjusted_from=payload.params.difficulty,
            difficulty_used=payload.params.difficulty,
            agent_name="ExerciseAgent",
            prompt_version="v1",
            model_name="rule-based-fallback",
        ),
    )


def _short_uuid() -> str:
    return uuid.uuid4().hex[:8]
