"""
VisualAgent —— 可视化数据生成 Agent。

输入：KnowledgeBreakdown + ResourceTaskParams + 学生画像摘要
输出：VisualResult（含 mindmap_md + animation + rationale）
失败兜底：用 key_points 拼 markmap 大纲 + 通用 highlight 动画。
"""

from __future__ import annotations

import logging
from pathlib import Path

from pydantic import BaseModel, Field

from ..schemas.profile import Rationale
from ..schemas.resource import (
    Animation,
    AnimationStep,
    KnowledgeBreakdown,
    ResourceTaskParams,
    VisualResult,
)
from ..services.llm_service import LLMService
from .base import AgentRuntime, BaseAgent
from .document_agent import ProfileSummary
from .event_bus import EventBus

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "visual_agent_v1.md"


class VisualAgentInput(BaseModel):
    knowledge_breakdown: KnowledgeBreakdown
    params: ResourceTaskParams
    profile_summary: ProfileSummary = Field(default_factory=ProfileSummary)


class VisualAgent(BaseAgent[VisualAgentInput, VisualResult]):
    """可视化数据生成 Agent。"""

    name = "VisualAgent"
    prompt_version = "v1"

    def __init__(self, event_bus: EventBus, llm_service: LLMService) -> None:
        super().__init__(event_bus)
        self.llm = llm_service
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    async def _run_impl(
        self, runtime: AgentRuntime, payload: VisualAgentInput
    ) -> VisualResult:
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": payload.model_dump_json(indent=2)},
        ]
        try:
            result, llm_response = await self.llm.generate_structured(
                messages,
                schema=VisualResult,
                temperature=0.3,
                max_retries=3,
            )
            runtime.token_used = llm_response.total_tokens
        except Exception as exc:
            logger.warning("VisualAgent LLM 三次失败，启用规则兜底：%s", exc)
            runtime.extra["fallback"] = True
            return _rule_based_visual(payload)

        await self.emit_delta(
            runtime,
            {
                "stage": "visual_finalized",
                "step_count": len(result.animation.steps),
                "scene": result.animation.scene,
            },
        )
        return result


# ─────────────────────────────── 规则兜底 ───────────────────────────────


def _rule_based_visual(payload: VisualAgentInput) -> VisualResult:
    kb = payload.knowledge_breakdown
    concept = kb.concept or "未命名知识点"
    kps = kb.key_points or [concept]

    # mindmap：一级 = concept，二级 = key_points
    lines = [f"# {concept}"]
    for kp in kps:
        lines.append(f"## {kp}")
    mindmap = "\n".join(lines)

    # animation：每个 key_point 对应一步 highlight
    steps: list[AnimationStep] = [
        AnimationStep(
            action="highlight",
            target=f"step_{i + 1}",
            narration=kp[:60],
            duration_ms=800,
            links_to_doc_section="怎么做",
        )
        for i, kp in enumerate(kps)
    ]
    # 强约束：至少 3 步
    while len(steps) < 3:
        steps.append(
            AnimationStep(
                action="annotate",
                target="overview",
                narration=f"补充说明 {concept}",
                duration_ms=600,
                links_to_doc_section="是什么",
            )
        )

    return VisualResult(
        mindmap_md=mindmap,
        animation=Animation(
            scene="generic",
            initial_state={"concept": concept, "key_points": kps},
            steps=steps,
        ),
        rationale=Rationale(
            matched_profile=[
                f"preference:{p}" for p in payload.profile_summary.preference
            ]
            or ["fallback"],
            addressed_weakness=payload.profile_summary.weakness,
            difficulty_adjusted_from=payload.params.difficulty,
            difficulty_used=payload.params.difficulty,
            agent_name="VisualAgent",
            prompt_version="v1",
            model_name="rule-based-fallback",
        ),
    )
