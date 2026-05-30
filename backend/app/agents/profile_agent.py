"""
ProfileAgent —— 学习画像抽取与更新 Agent。

完整实现（v1）：
- 加载 prompts/profile_agent_v1.md 作为 System Prompt
- 将对话 + 历史画像 + 答题增量序列化成 User Prompt
- 调用 LLMService.generate_structured() 获取 ProfileExtractionResult
- 若 prior_profile 不为空，应用滑动更新规则做最终合并
- 失败 3 次后降级为"基于规则的最小画像"，保证演示不翻车
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from ..schemas.profile import (
    EvaluationDelta,
    ExtractionRationale,
    Profile,
    ProfileExtractionResult,
    Progress,
)
from ..services.llm_service import LLMService
from .base import AgentRuntime, BaseAgent
from .event_bus import EventBus

logger = logging.getLogger(__name__)


# ─────────────────────────────── 输入契约 ───────────────────────────────


class ConversationTurn(BaseModel):
    role: Literal["student", "system", "assistant"]
    text: str
    ts: float = 0.0


class ProfileAgentInput(BaseModel):
    """ProfileAgent 的标准输入。"""

    session_id: str
    conversation: list[ConversationTurn] = Field(default_factory=list)
    prior_profile: Profile | None = None
    evaluation_delta: EvaluationDelta | None = None


# ─────────────────────────────── Agent 实现 ───────────────────────────────


_PROMPT_PATH = Path(__file__).parent / "prompts" / "profile_agent_v1.md"


class ProfileAgent(BaseAgent[ProfileAgentInput, ProfileExtractionResult]):
    """学习画像抽取与更新 Agent。"""

    name = "ProfileAgent"
    prompt_version = "v1"

    def __init__(self, event_bus: EventBus, llm_service: LLMService) -> None:
        super().__init__(event_bus)
        self.llm = llm_service
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    async def _run_impl(
        self, runtime: AgentRuntime, payload: ProfileAgentInput
    ) -> ProfileExtractionResult:
        # 1. 构造消息
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": payload.model_dump_json(indent=2)},
        ]

        # 2. 调用 LLM 取得结构化输出
        try:
            result, llm_response = await self.llm.generate_structured(
                messages,
                schema=ProfileExtractionResult,
                temperature=0.1,
                max_retries=3,
            )
            runtime.token_used = llm_response.total_tokens
        except Exception as exc:
            logger.warning("ProfileAgent LLM 调用三次失败，启用规则兜底：%s", exc)
            runtime.extra["fallback"] = True
            return _rule_based_fallback(payload)

        # 3. 应用滑动更新规则（这一段是确定性逻辑，不交给 LLM）
        if payload.prior_profile is not None:
            merged = _merge_profile(
                prior=payload.prior_profile,
                new=result.profile,
                delta=payload.evaluation_delta,
            )
            result = ProfileExtractionResult(profile=merged, rationale=result.rationale)

        # 4. 推一条 delta 让前端时序面板有"渐进感"
        await self.emit_delta(
            runtime,
            {
                "stage": "profile_finalized",
                "knowledge_count": len(result.profile.knowledge_levels),
                "weakness_count": len(result.profile.weakness),
                "confidence": result.rationale.confidence,
            },
        )

        return result


# ─────────────────────────────── 滑动更新规则 ───────────────────────────────


def _merge_profile(
    *, prior: Profile, new: Profile, delta: EvaluationDelta | None
) -> Profile:
    """把 LLM 给出的更新建议与历史画像合并。

    规则：
    - knowledge_levels：对 delta 涉及的 key 应用 new = prior × 0.7 + observed × 0.3；
      其余以 LLM 输出为准（前提是 LLM 没动则保留 prior）
    - weakness：合并 prior + new + delta.new_weakness，剔除 delta.resolved_weakness，
      去重保序，保留最近 5 条
    - 其他字段：LLM 输出非默认值时采纳，否则保留 prior
    """
    merged_levels = dict(prior.knowledge_levels)

    if delta is not None:
        merged_levels[delta.knowledge_id] = (
            prior.knowledge_levels.get(delta.knowledge_id, 0.5) * 0.7
            + delta.observed_correct_rate * 0.3
        )

    # LLM 给出的其他知识点掌握度（只接受比 prior 更新的）
    for k, v in new.knowledge_levels.items():
        if k not in merged_levels:
            merged_levels[k] = v

    # weakness 合并
    weak_set: list[str] = []
    seen: set[str] = set()
    for source in (prior.weakness, new.weakness, (delta.new_weakness if delta else [])):
        for w in source:
            if w and w not in seen:
                seen.add(w)
                weak_set.append(w)
    if delta is not None:
        weak_set = [w for w in weak_set if w not in delta.resolved_weakness]
    weak_set = weak_set[-5:]

    return Profile(
        major=new.major if new.major != "unknown" else prior.major,
        knowledge_levels=merged_levels,
        goal=new.goal if new.goal != "unknown" else prior.goal,
        style=new.style or prior.style,
        weakness=weak_set,
        preference=new.preference or prior.preference,
        pace=new.pace if new.pace != "medium" else prior.pace,
        progress=_merge_progress(prior.progress, new.progress),
    )


def _merge_progress(prior: Progress, new: Progress) -> Progress:
    completed = list(dict.fromkeys(prior.completed + new.completed))  # 去重保序
    return Progress(
        current_chapter=(
            new.current_chapter
            if new.current_chapter != "unknown"
            else prior.current_chapter
        ),
        completed=completed,
    )


# ─────────────────────────────── 规则兜底 ───────────────────────────────


def _rule_based_fallback(payload: ProfileAgentInput) -> ProfileExtractionResult:
    """LLM 三次失败时的兜底画像。

    只读 conversation 文本做关键词命中，保证演示不空白。
    """
    text = " ".join(t.text for t in payload.conversation).lower()

    style: list = []
    if any(w in text for w in ["图", "动画", "可视化"]):
        style.append("diagram")
    if any(w in text for w in ["代码", "实现", "敲", "跑"]):
        style.append("code")
    if any(w in text for w in ["推导", "证明", "原理"]):
        style.append("derivation")
    if not style:
        style = ["step_by_step"]

    preference: list = []
    if "动画" in text:
        preference.append("animation")
    if "导图" in text:
        preference.append("mindmap")
    if not preference:
        preference = ["document"]

    base = payload.prior_profile or Profile()
    return ProfileExtractionResult(
        profile=Profile(
            major=base.major,
            knowledge_levels=base.knowledge_levels,
            goal=base.goal,
            style=style,
            weakness=base.weakness,
            preference=preference,
            pace=base.pace,
            progress=base.progress,
        ),
        rationale=ExtractionRationale(
            extracted_from=["conversation"],
            confidence=0.3,
            notes="LLM 调用失败，使用规则兜底",
        ),
    )
