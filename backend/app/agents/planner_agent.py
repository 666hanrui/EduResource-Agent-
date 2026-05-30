"""
PlannerAgent —— 学习任务编排 Agent。

输入学生画像 + 目标知识点，输出 KnowledgeBreakdown + 一组生成任务。
任务之间形成 DAG，由 Orchestrator 拓扑分层并行执行。
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from ..schemas.profile import Profile
from ..schemas.resource import (
    KnowledgeBreakdown,
    PlannerOutput,
    ResourceTask,
    ResourceTaskParams,
)
from ..services.llm_service import LLMService
from .base import AgentRuntime, BaseAgent
from .event_bus import EventBus

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "planner_agent_v1.md"


class TargetKnowledge(BaseModel):
    id: str
    name: str
    prerequisites: list[str] = Field(default_factory=list)


class PlannerAgentInput(BaseModel):
    profile: Profile
    target_knowledge: TargetKnowledge
    requested_types: list[
        Literal["DocumentAgent", "ExerciseAgent", "CodeAgent", "VisualAgent"]
    ] | None = None


class PlannerAgent(BaseAgent[PlannerAgentInput, PlannerOutput]):
    """学习任务编排 Agent。"""

    name = "PlannerAgent"
    prompt_version = "v1"

    def __init__(self, event_bus: EventBus, llm_service: LLMService) -> None:
        super().__init__(event_bus)
        self.llm = llm_service
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    async def _run_impl(
        self, runtime: AgentRuntime, payload: PlannerAgentInput
    ) -> PlannerOutput:
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": payload.model_dump_json(indent=2)},
        ]

        try:
            result, llm_response = await self.llm.generate_structured(
                messages,
                schema=PlannerOutput,
                temperature=0.2,
                max_retries=3,
            )
            runtime.token_used = llm_response.total_tokens
        except Exception as exc:
            logger.warning("PlannerAgent LLM 调用三次失败，启用规则兜底：%s", exc)
            runtime.extra["fallback"] = True
            return _rule_based_plan(payload)

        # 验证 DAG 合法性 —— 失败则改用兜底，不让坏计划往下传
        try:
            _validate_dag(result.tasks)
        except ValueError as exc:
            logger.warning("PlannerAgent DAG 校验失败，启用规则兜底：%s", exc)
            runtime.extra["fallback"] = True
            return _rule_based_plan(payload)

        await self.emit_delta(
            runtime,
            {
                "stage": "plan_finalized",
                "task_count": len(result.tasks),
                "agents": [t.agent for t in result.tasks],
            },
        )
        return result


# ─────────────────────────────── DAG 校验 ───────────────────────────────


def _validate_dag(tasks: list[ResourceTask]) -> None:
    """校验 depends_on 无环且引用合法。"""
    ids = {t.task_id for t in tasks}
    for t in tasks:
        for dep in t.depends_on:
            if dep not in ids:
                raise ValueError(f"任务 {t.task_id} 依赖了不存在的 {dep}")

    # 简易拓扑环检测
    in_degree = {t.task_id: len(t.depends_on) for t in tasks}
    task_map = {t.task_id: t for t in tasks}
    remaining = set(ids)
    while remaining:
        ready = [tid for tid in remaining if in_degree[tid] == 0]
        if not ready:
            raise ValueError(f"DAG 存在环，剩余节点：{remaining}")
        for tid in ready:
            remaining.remove(tid)
        for tid in remaining:
            in_degree[tid] = sum(
                1 for d in task_map[tid].depends_on if d in remaining
            )


# ─────────────────────────────── 规则兜底 ───────────────────────────────


def _rule_based_plan(payload: PlannerAgentInput) -> PlannerOutput:
    """LLM 失败时的最小可演示计划。

    规则：
    - 必出 Document + Exercise + Visual（并行），CodeAgent 依赖 Document
    - 难度按 knowledge_levels 推断
    - 若 weakness 非空则把第一条作为所有 task 的 focus
    """
    level = payload.profile.knowledge_levels.get(payload.target_knowledge.id, 0.5)
    if level < 0.4:
        difficulty = 2
    elif level <= 0.7:
        difficulty = 3
    else:
        difficulty = 4

    style_hint = payload.profile.style[0] if payload.profile.style else "step_by_step"
    focus = payload.profile.weakness[0] if payload.profile.weakness else payload.target_knowledge.name

    types = payload.requested_types or [
        "DocumentAgent",
        "ExerciseAgent",
        "VisualAgent",
        "CodeAgent",
    ]

    doc_id = _short_uuid()
    tasks: list[ResourceTask] = []
    base_params = ResourceTaskParams(
        difficulty=difficulty,
        focus=focus,
        style_hint=style_hint,
        reason="规则兜底生成的最小可演示计划",
    )

    if "DocumentAgent" in types:
        tasks.append(ResourceTask(task_id=doc_id, agent="DocumentAgent", params=base_params))
    if "ExerciseAgent" in types:
        tasks.append(
            ResourceTask(
                task_id=_short_uuid(),
                agent="ExerciseAgent",
                params=base_params.model_copy(update={"difficulty": max(1, difficulty - 1)}),
            )
        )
    if "VisualAgent" in types:
        tasks.append(ResourceTask(task_id=_short_uuid(), agent="VisualAgent", params=base_params))
    if "CodeAgent" in types:
        deps = [doc_id] if "DocumentAgent" in types else []
        tasks.append(
            ResourceTask(task_id=_short_uuid(), agent="CodeAgent", depends_on=deps, params=base_params)
        )

    return PlannerOutput(
        knowledge_breakdown=KnowledgeBreakdown(
            concept=payload.target_knowledge.name,
            key_points=[],
            common_pitfalls=payload.profile.weakness,
            references=[],
        ),
        tasks=tasks,
    )


def _short_uuid() -> str:
    return uuid.uuid4().hex[:8]
