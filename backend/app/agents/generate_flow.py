"""
GenerateFlow —— 教学资源生成主流程。

职责：
1. 调 ProfileAgent 获取或更新学习画像
2. 调 PlannerAgent 生成知识拆解与任务规划
3. 按 PlannerAgent.tasks 动态并行调用 Document / Exercise / Visual / Code 等 Agent
4. 调 EvaluationAgent 形成一次学习闭环
5. 汇总 outputs，供 API 写入缓存/SQLite 并给前端展示

设计要点：
- 并行生成 Agent 由 PlannerAgent.tasks 动态决定，不再硬编码
- 每个 Agent 读取 Planner 为其定制的 params（difficulty/focus/style_hint）
- 共用同一个 task_id：AgentTracePanel 一次订阅全程亮 7 行
- 失败兜底已在每个 Agent 内部实现，本层只编排

若需 LLM 动态决策调度顺序，请使用 MainAgentFlow。
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..schemas.profile import Profile
from ..schemas.resource import (
    CodeResult,
    DocumentResult,
    EvaluationResult,
    ExerciseResult,
    PlannerOutput,
    ResourceTaskParams,
    VisualResult,
)
from .code_agent import CodeAgent, CodeAgentInput
from .document_agent import DocumentAgent, DocumentAgentInput, ProfileSummary
from .evaluation_agent import (
    AnswerRecord,
    EvaluationAgent,
    EvaluationAgentInput,
)
from .event_bus import AgentEvent, EventBus, EventType
from .exercise_agent import ExerciseAgent, ExerciseAgentInput
from .planner_agent import PlannerAgent, PlannerAgentInput, TargetKnowledge
from .profile_agent import ProfileAgent, ProfileAgentInput, ConversationTurn
from .registry import AgentRegistry
from .visual_agent import VisualAgent, VisualAgentInput

logger = logging.getLogger(__name__)


# ─────────────────────────────── 输入 ───────────────────────────────


class GenerateSelectionContext(BaseModel):
    """从上游模块进入资源生成时携带的选择理由。"""

    source: Literal["manual", "exploration", "coach", "digital_human", "teacher_console"] = "manual"
    reason: str = Field(default="")
    suggested_difficulty: int | None = Field(default=None, ge=1, le=5)


class GenerateRequest(BaseModel):
    """资源生成入口请求。

    main_agent_args 用于 MainAgent 专属工具参数，不参与传统 GenerateFlow 计算。
    """

    student_id: str = Field(default="stu_001")
    knowledge_id: str
    knowledge_name: str
    conversation: list[ConversationTurn] = Field(default_factory=list)
    prior_profile: Profile | None = None
    selection_context: GenerateSelectionContext | None = None
    exercise_count: int = Field(default=5, ge=1, le=10)
    languages: list[str] = Field(default_factory=lambda: ["python", "java"])
    main_agent_args: dict[str, Any] = Field(default_factory=dict)


@dataclass
class GenerateOutputs:
    profile: Profile | None = None
    plan: PlannerOutput | None = None
    document: DocumentResult | None = None
    exercise: ExerciseResult | None = None
    visual: VisualResult | None = None
    code: CodeResult | None = None
    evaluation: EvaluationResult | None = None
    errors: dict[str, str] = field(default_factory=dict)


# ─────────────────────────────── 主调度 ───────────────────────────────


class GenerateFlow:
    """把多个 Agent 串起来跑一次完整的资源生成。"""

    def __init__(self, registry: AgentRegistry, event_bus: EventBus) -> None:
        self.registry = registry
        self.event_bus = event_bus

    def _agent(self, name: str) -> Any:
        return self.registry.get(name)

    async def run(self, task_id: str, req: GenerateRequest) -> GenerateOutputs:
        started_at = time.time()
        outputs = GenerateOutputs()

        try:
            # 1. Profile
            profile_agent: ProfileAgent = self._agent("ProfileAgent")
            profile_input = ProfileAgentInput(
                session_id=task_id,
                conversation=[
                    *req.conversation,
                    *_selection_context_turns(req.selection_context),
                ],
                prior_profile=req.prior_profile,
            )
            profile_result = await profile_agent.run(task_id, profile_input)
            outputs.profile = profile_result.profile

            # 2. Planner
            planner_agent: PlannerAgent = self._agent("PlannerAgent")
            planner_result = await planner_agent.run(
                task_id,
                PlannerAgentInput(
                    profile=outputs.profile,
                    target_knowledge=TargetKnowledge(
                        id=req.knowledge_id,
                        name=req.knowledge_name,
                    ),
                ),
            )
            outputs.plan = planner_result

            planned_agents = {task.agent for task in planner_result.tasks}
            logger.info("GenerateFlow planner selected agents: %s", sorted(planned_agents))

            # 3. Dynamic resource generation from PlannerAgent.tasks.
            resource_coros: list[Any] = []
            resource_names: list[str] = []

            if "DocumentAgent" in planned_agents:
                document_agent: DocumentAgent = self._agent("DocumentAgent")
                resource_names.append("DocumentAgent")
                resource_coros.append(
                    document_agent.run(
                        task_id,
                        DocumentAgentInput(
                            knowledge_breakdown=planner_result.knowledge_breakdown,
                            params=_apply_selection_context(
                                _pick_params_for_agent(planner_result, "DocumentAgent", req.knowledge_name),
                                req.selection_context,
                            ),
                            profile_summary=_make_profile_summary(outputs),
                        ),
                    )
                )

            if "ExerciseAgent" in planned_agents:
                exercise_agent: ExerciseAgent = self._agent("ExerciseAgent")
                resource_names.append("ExerciseAgent")
                resource_coros.append(
                    exercise_agent.run(
                        task_id,
                        ExerciseAgentInput(
                            knowledge_breakdown=planner_result.knowledge_breakdown,
                            params=_apply_selection_context(
                                _pick_params_for_agent(planner_result, "ExerciseAgent", req.knowledge_name),
                                req.selection_context,
                            ),
                            profile_summary=_make_profile_summary(outputs),
                            count=req.exercise_count,
                        ),
                    )
                )

            if "VisualAgent" in planned_agents:
                visual_agent: VisualAgent = self._agent("VisualAgent")
                resource_names.append("VisualAgent")
                resource_coros.append(
                    visual_agent.run(
                        task_id,
                        VisualAgentInput(
                            knowledge_breakdown=planner_result.knowledge_breakdown,
                            params=_apply_selection_context(
                                _pick_params_for_agent(planner_result, "VisualAgent", req.knowledge_name),
                                req.selection_context,
                            ),
                            profile_summary=_make_profile_summary(outputs),
                        ),
                    )
                )

            if resource_coros:
                resource_results = await asyncio.gather(*resource_coros, return_exceptions=True)
                for name, result in zip(resource_names, resource_results):
                    if isinstance(result, Exception):
                        outputs.errors[name] = str(result)
                        continue
                    if name == "DocumentAgent":
                        outputs.document = result
                    elif name == "ExerciseAgent":
                        outputs.exercise = result
                    elif name == "VisualAgent":
                        outputs.visual = result

            # 4. Code depends on document; still optional via Planner.
            if "CodeAgent" in planned_agents:
                code_agent: CodeAgent = self._agent("CodeAgent")
                try:
                    code_langs = [lang for lang in req.languages if lang in ("python", "java")]
                    if not code_langs:
                        code_langs = ["python", "java"]
                    outputs.code = await code_agent.run(
                        task_id,
                        CodeAgentInput(
                            knowledge_breakdown=planner_result.knowledge_breakdown,
                            params=_apply_selection_context(
                                _pick_params_for_agent(planner_result, "CodeAgent", req.knowledge_name),
                                req.selection_context,
                            ),
                            profile_summary=_make_profile_summary(outputs),
                            languages=code_langs,  # type: ignore[arg-type]
                        ),
                    )
                except Exception as exc:
                    outputs.errors["CodeAgent"] = str(exc)

            # 5. Evaluation closes the loop using current exercise if any.
            eval_agent: EvaluationAgent = self._agent("EvaluationAgent")
            try:
                mock_answers = _make_mock_answers(outputs.exercise)
                outputs.evaluation = await eval_agent.run(
                    task_id,
                    EvaluationAgentInput(
                        session_id=task_id,
                        knowledge_id=req.knowledge_id,
                        profile=outputs.profile,
                        answers=mock_answers,
                    ),
                )
            except Exception as exc:
                outputs.errors["EvaluationAgent"] = str(exc)

            await self._emit_summary(task_id, started_at, "ok" if not outputs.errors else "partial", outputs.errors)
            return outputs

        except Exception as exc:
            logger.exception("GenerateFlow failed task_id=%s", task_id)
            outputs.errors["GenerateFlow"] = str(exc)
            await self._emit_summary(task_id, started_at, "error", outputs.errors)
            raise

    async def _emit_summary(
        self,
        task_id: str,
        started_at: float,
        status: str,
        errors: dict[str, str] | None = None,
    ) -> None:
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.TASK_SUMMARY,
                task_id=task_id,
                agent="GenerateFlow",
                ts=time.time(),
                payload={
                    "status": status,
                    "elapsed_ms": int((time.time() - started_at) * 1000),
                    "error": "; ".join(f"{k}:{v}" for k, v in (errors or {}).items()) or None,
                },
            )
        )


# ─────────────────────────────── 辅助函数 ───────────────────────────────


def _make_profile_summary(outputs: GenerateOutputs) -> ProfileSummary:
    if outputs.profile is None:
        return ProfileSummary(weakness=[], preference=[])
    return ProfileSummary(
        weakness=outputs.profile.weakness,
        preference=list(outputs.profile.preference),
    )


def _pick_params(plan: PlannerOutput, fallback_focus: str) -> ResourceTaskParams:
    """Backwards-compatible params picker used by older call sites."""
    return _pick_params_for_agent(plan, "DocumentAgent", fallback_focus)


def _pick_params_for_agent(
    plan: PlannerOutput,
    agent_name: str,
    fallback_focus: str,
) -> ResourceTaskParams:
    for task in plan.tasks:
        if task.agent == agent_name:
            return task.params
    if plan.tasks:
        return plan.tasks[0].params
    return ResourceTaskParams(focus=fallback_focus, reason="planner 未给出 task")


def _apply_selection_context(
    params: ResourceTaskParams,
    context: GenerateSelectionContext | None,
) -> ResourceTaskParams:
    if context is None:
        return params
    updates: dict[str, Any] = {}
    if context.suggested_difficulty is not None:
        updates["difficulty"] = context.suggested_difficulty
    if context.reason.strip():
        updates["reason"] = f"{params.reason}；上游选择理由：{context.reason.strip()}"
    return params.model_copy(update=updates) if updates else params


def _selection_context_turns(
    context: GenerateSelectionContext | None,
) -> list[ConversationTurn]:
    if context is None:
        return []
    parts = [f"本次资源生成来自 {context.source}"]
    if context.reason.strip():
        parts.append(f"选择理由：{context.reason.strip()}")
    if context.suggested_difficulty is not None:
        parts.append(f"建议难度 {context.suggested_difficulty}")
    return [ConversationTurn(role="student", text="；".join(parts))]


def _make_mock_answers(exercise: ExerciseResult | None) -> list[AnswerRecord]:
    if exercise is None:
        return []
    answers: list[AnswerRecord] = []
    for index, q in enumerate(exercise.questions):
        is_correct = index % 2 == 0
        answers.append(
            AnswerRecord(
                qid=q.qid,
                user_answer=q.answer if is_correct else "__wrong__",
                correct_answer=q.answer,
                time_spent_sec=q.expected_time_sec,
                tags=q.tags,
            )
        )
    return answers
