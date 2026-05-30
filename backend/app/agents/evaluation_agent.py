"""
EvaluationAgent —— 答题分析与画像更新建议 Agent。

输入：session_id + knowledge_id + 当前画像 + 答题记录
输出：EvaluationResult（含 evaluation_delta + narrative + rationale）

注意：
- 滑动公式 estimated_mastery = prior × 0.7 + observed × 0.3 是确定性逻辑，
  无论 LLM 返回什么都重新校准，避免数值漂移
- 失败兜底完全用规则计算，演示中即使 LLM 挂掉也能给出合理 delta
"""

from __future__ import annotations

import logging
from collections import Counter
from pathlib import Path

from pydantic import BaseModel, Field

from ..schemas.profile import EvaluationDelta, Profile
from ..schemas.resource import (
    EvaluationEvidence,
    EvaluationRationale,
    EvaluationResult,
)
from ..services.llm_service import LLMService
from .base import AgentRuntime, BaseAgent
from .event_bus import EventBus

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "evaluation_agent_v1.md"


class AnswerRecord(BaseModel):
    qid: str
    user_answer: str
    correct_answer: str
    time_spent_sec: int = Field(default=60, ge=0)
    tags: list[str] = Field(default_factory=list)

    @property
    def is_correct(self) -> bool:
        return self.user_answer.strip() == self.correct_answer.strip()


class EvaluationAgentInput(BaseModel):
    session_id: str
    knowledge_id: str
    profile: Profile = Field(default_factory=Profile)
    answers: list[AnswerRecord] = Field(default_factory=list)


class EvaluationAgent(BaseAgent[EvaluationAgentInput, EvaluationResult]):
    """答题分析 Agent。"""

    name = "EvaluationAgent"
    prompt_version = "v1"

    def __init__(self, event_bus: EventBus, llm_service: LLMService) -> None:
        super().__init__(event_bus)
        self.llm = llm_service
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    async def _run_impl(
        self, runtime: AgentRuntime, payload: EvaluationAgentInput
    ) -> EvaluationResult:
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": payload.model_dump_json(indent=2)},
        ]

        try:
            result, llm_response = await self.llm.generate_structured(
                messages,
                schema=EvaluationResult,
                temperature=0.2,
                max_retries=3,
            )
            runtime.token_used = llm_response.total_tokens
        except Exception as exc:
            logger.warning("EvaluationAgent LLM 三次失败，启用规则兜底：%s", exc)
            runtime.extra["fallback"] = True
            return _rule_based_evaluation(payload)

        # 用确定性逻辑覆写 mastery，防止 LLM 算错
        result = _enforce_sliding_formula(result, payload)

        await self.emit_delta(
            runtime,
            {
                "stage": "evaluation_finalized",
                "observed_correct_rate": result.evaluation_delta.observed_correct_rate,
                "estimated_mastery": result.evaluation_delta.estimated_mastery,
                "new_weakness": result.evaluation_delta.new_weakness,
            },
        )
        return result


# ─────────────────────────────── 滑动公式覆写 ───────────────────────────────


def _enforce_sliding_formula(
    result: EvaluationResult, payload: EvaluationAgentInput
) -> EvaluationResult:
    """无论 LLM 返回什么，重新按公式覆盖 estimated_mastery 与 observed_correct_rate。"""
    if not payload.answers:
        return result

    correct = sum(1 for a in payload.answers if a.is_correct)
    observed = correct / len(payload.answers)
    prior = payload.profile.knowledge_levels.get(payload.knowledge_id, 0.5)
    estimated = prior * 0.7 + observed * 0.3

    new_delta = result.evaluation_delta.model_copy(
        update={
            "knowledge_id": payload.knowledge_id,
            "observed_correct_rate": round(observed, 3),
            "estimated_mastery": round(estimated, 3),
            "next_difficulty_recommendation": _next_difficulty(estimated),
        }
    )
    return result.model_copy(update={"evaluation_delta": new_delta})


# ─────────────────────────────── 规则兜底 ───────────────────────────────


def _rule_based_evaluation(payload: EvaluationAgentInput) -> EvaluationResult:
    """无 LLM 时基于答题记录直接计算 delta。"""
    if not payload.answers:
        # 真没答题 —— 给个最保守的 delta（保持原 mastery）
        prior = payload.profile.knowledge_levels.get(payload.knowledge_id, 0.5)
        return EvaluationResult(
            evaluation_delta=EvaluationDelta(
                knowledge_id=payload.knowledge_id,
                observed_correct_rate=0.0,
                estimated_mastery=prior,
                next_difficulty_recommendation=_next_difficulty(prior),
                next_focus="尚无答题数据，建议先做一组基础题",
            ),
            narrative="还没有答题记录，建议先做一组基础题再来评估。",
            rationale=EvaluationRationale(),
        )

    correct = sum(1 for a in payload.answers if a.is_correct)
    observed = correct / len(payload.answers)
    prior = payload.profile.knowledge_levels.get(payload.knowledge_id, 0.5)
    estimated = prior * 0.7 + observed * 0.3

    # 错题 tag 统计 —— 同类错误在最近答题中累计 ≥ 2 次 → new_weakness
    wrong_tags = Counter[str]()
    for ans in payload.answers:
        if not ans.is_correct:
            for t in ans.tags:
                wrong_tags[t] += 1
    new_weakness = [tag for tag, c in wrong_tags.items() if c >= 2]

    # resolved_weakness：旧 weakness 在最近答题中全部答对（且至少出现 1 次）
    resolved: list[str] = []
    for old in payload.profile.weakness:
        appearances = [a for a in payload.answers if old in a.tags]
        if appearances and all(a.is_correct for a in appearances):
            resolved.append(old)

    next_focus = (
        new_weakness[0]
        if new_weakness
        else next(
            (w for w in payload.profile.weakness if w not in resolved),
            "继续巩固当前知识点",
        )
    )

    delta = EvaluationDelta(
        knowledge_id=payload.knowledge_id,
        observed_correct_rate=round(observed, 3),
        estimated_mastery=round(estimated, 3),
        new_weakness=new_weakness,
        resolved_weakness=resolved,
        next_difficulty_recommendation=_next_difficulty(estimated),
        next_focus=next_focus,
    )

    evidence = [
        EvaluationEvidence(
            qid=a.qid,
            verdict="correct" if a.is_correct else "wrong",
            weight=0.6 if not a.is_correct else 0.3,
        )
        for a in payload.answers
    ]

    narrative = _compose_narrative(observed, new_weakness, resolved)

    return EvaluationResult(
        evaluation_delta=delta,
        narrative=narrative,
        rationale=EvaluationRationale(evidence=evidence),
    )


def _next_difficulty(mastery: float) -> int:
    if mastery < 0.3:
        return 2
    if mastery < 0.5:
        return 3
    if mastery < 0.7:
        return 4
    return 5


def _compose_narrative(
    observed: float, new_weakness: list[str], resolved: list[str]
) -> str:
    pct = int(observed * 100)
    parts = [f"本轮答题正确率约 {pct}%。"]
    if resolved:
        parts.append(f"已掌握：{resolved[0]}。")
    if new_weakness:
        parts.append(f"建议加强：{new_weakness[0]}。")
    elif not resolved:
        parts.append("继续保持当前节奏。")
    return "".join(parts)
