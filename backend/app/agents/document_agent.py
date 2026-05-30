"""
DocumentAgent —— 讲解文档生成 Agent。

输入：KnowledgeBreakdown + ResourceTaskParams + 学生画像摘要
输出：DocumentResult（含分段讲解 + 图解 + rationale 溯源）
失败兜底：用 KnowledgeBreakdown 的 key_points 拼接最简文档，保证演示不开天窗。
"""

from __future__ import annotations

import logging
from pathlib import Path

from pydantic import BaseModel, Field

from ..schemas.profile import Rationale
from ..schemas.resource import (
    DocumentBody,
    DocumentDiagram,
    DocumentResult,
    DocumentSection,
    KnowledgeBreakdown,
    ResourceTaskParams,
)
from ..services.llm_service import LLMService
from .base import AgentRuntime, BaseAgent
from .event_bus import EventBus

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "document_agent_v1.md"


class ProfileSummary(BaseModel):
    weakness: list[str] = Field(default_factory=list)
    preference: list[str] = Field(default_factory=list)


class DocumentAgentInput(BaseModel):
    knowledge_breakdown: KnowledgeBreakdown
    params: ResourceTaskParams
    profile_summary: ProfileSummary = Field(default_factory=ProfileSummary)


class DocumentAgent(BaseAgent[DocumentAgentInput, DocumentResult]):
    """讲解文档生成 Agent。"""

    name = "DocumentAgent"
    prompt_version = "v1"

    def __init__(self, event_bus: EventBus, llm_service: LLMService) -> None:
        super().__init__(event_bus)
        self.llm = llm_service
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    async def _run_impl(
        self, runtime: AgentRuntime, payload: DocumentAgentInput
    ) -> DocumentResult:
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": payload.model_dump_json(indent=2)},
        ]

        try:
            result, llm_response = await self.llm.generate_structured(
                messages,
                schema=DocumentResult,
                temperature=0.3,
                max_retries=3,
            )
            runtime.token_used = llm_response.total_tokens
        except Exception as exc:
            logger.warning("DocumentAgent LLM 三次失败，启用规则兜底：%s", exc)
            runtime.extra["fallback"] = True
            return _rule_based_document(payload)

        await self.emit_delta(
            runtime,
            {
                "stage": "document_finalized",
                "section_count": len(result.document.sections),
                "diagram_count": len(result.document.key_diagrams),
                "addressed_weakness": result.rationale.addressed_weakness,
            },
        )
        return result


# ─────────────────────────────── 规则兜底 ───────────────────────────────


def _rule_based_document(payload: DocumentAgentInput) -> DocumentResult:
    """无 LLM 时用 KnowledgeBreakdown 的 key_points 拼接最简文档。"""
    kb = payload.knowledge_breakdown
    title = kb.concept or "未命名知识点"

    sections: list[DocumentSection] = [
        DocumentSection(
            heading="是什么",
            body_md=f"**{title}**\n\n本节介绍 {title} 的核心概念。",
        )
    ]
    if kb.key_points:
        body = "\n".join(f"{i + 1}. {kp}" for i, kp in enumerate(kb.key_points))
        sections.append(DocumentSection(heading="怎么做", body_md=body))
    if kb.common_pitfalls:
        body = "\n".join(f"- {p}" for p in kb.common_pitfalls)
        sections.append(DocumentSection(heading="容易错", body_md=body))

    diagram = DocumentDiagram(
        type="step_diagram",
        data=[
            {"step": i + 1, "title": kp[:24], "detail": kp}
            for i, kp in enumerate(kb.key_points or [title])
        ],
    )

    return DocumentResult(
        document=DocumentBody(
            title=title,
            sections=sections,
            key_diagrams=[diagram],
        ),
        rationale=Rationale(
            matched_profile=[
                f"preference:{p}" for p in payload.profile_summary.preference
            ]
            or ["fallback"],
            addressed_weakness=payload.profile_summary.weakness,
            difficulty_adjusted_from=payload.params.difficulty,
            difficulty_used=payload.params.difficulty,
            agent_name="DocumentAgent",
            prompt_version="v1",
            model_name="rule-based-fallback",
        ),
    )
