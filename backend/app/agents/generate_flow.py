"""
GenerateFlow —— 演示主链路。

把 7 个 Agent 串成一次完整资源生成调度：

    ProfileAgent
        │
        ▼
    PlannerAgent
        │
        ├──► DocumentAgent ┐
        ├──► ExerciseAgent │  (并行三件套)
        └──► VisualAgent   ┘
              │
              ▼
        CodeAgent           (依赖 Document，便于 step_comments 引用)
              │
              ▼
        EvaluationAgent     (拿 Exercise 题目当模拟答题，给出闭环反馈)

设计要点：
- 共用同一个 task_id：AgentTracePanel 一次订阅全程亮 7 行
- 下游需要上游输出 → 这里直接编排，不走 Orchestrator.run_plan 的静态 TaskPlan
- 任一 Agent 抛错 → 捕获后发 task.summary error，但不让其余阶段被吞
- 失败兜底已在每个 Agent 内部实现，本层只编排
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field

from ..schemas.profile import Profile
from ..schemas.resource import (
    CodeResult,
    DocumentResult,
    EvaluationResult,
    ExerciseResult,
    PlannerOutput,
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


class GenerateRequest(BaseModel):
    """演示态主入口请求。

    student_id 仅作为日志关联，不参与 Agent 计算。
    conversation 给 ProfileAgent 用；为空时走兜底画像。
    """

    student_id: str = Field(default="stu_001")
    knowledge_id: str
    knowledge_name: str
    conversation: list[ConversationTurn] = Field(default_factory=list)
    prior_profile: Profile | None = None
    exercise_count: int = Field(default=5, ge=1, le=10)
    languages: list[str] = Field(default_factory=lambda: ["python", "java"])


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
    """把 7 个 Agent 串起来跑一次完整的资源生成。"""

    def __init__(self, registry: AgentRegistry, event_bus: EventBus) -> None:
        self.registry = registry
        self.event_bus = event_bus

    def _agent(self, name: str) -> Any:
        return self.registry.get(name)

    async def run(self, task_id: str, req: GenerateRequest) -> GenerateOutputs:
        outputs = GenerateOutputs()
        started_at = time.time()

        try:
            # 1) ProfileAgent
            profile_agent: ProfileAgent = self._agent("ProfileAgent")
            profile_input = ProfileAgentInput(
                session_id=task_id,
                conversation=req.conversation,
                prior_profile=req.prior_profile,
            )
            profile_result = await profile_agent.run(task_id, profile_input)
            outputs.profile = profile_result.profile

            # 2) PlannerAgent
            planner_agent: PlannerAgent = self._agent("PlannerAgent")
            planner_input = PlannerAgentInput(
                profile=profile_result.profile,
                target_knowledge=TargetKnowledge(
                    id=req.knowledge_id,
                    name=req.knowledge_name,
                ),
            )
            plan = await planner_agent.run(task_id, planner_input)
            outputs.plan = plan

            kb = plan.knowledge_breakdown
            base_params = _pick_params(plan, fallback_focus=req.knowledge_name)
            profile_summary = ProfileSummary(
                weakness=profile_result.profile.weakness,
                preference=list(profile_result.profile.preference),
            )

            # 3) Document / Exercise / Visual 并行
            doc_agent: DocumentAgent = self._agent("DocumentAgent")
            ex_agent: ExerciseAgent = self._agent("ExerciseAgent")
            vis_agent: VisualAgent = self._agent("VisualAgent")

            doc_task = asyncio.create_task(
                doc_agent.run(
                    task_id,
                    DocumentAgentInput(
                        knowledge_breakdown=kb,
                        params=base_params,
                        profile_summary=profile_summary,
                    ),
                )
            )
            ex_task = asyncio.create_task(
                ex_agent.run(
                    task_id,
                    ExerciseAgentInput(
                        knowledge_breakdown=kb,
                        params=base_params,
                        profile_summary=profile_summary,
                        count=req.exercise_count,
                    ),
                )
            )
            vis_task = asyncio.create_task(
                vis_agent.run(
                    task_id,
                    VisualAgentInput(
                        knowledge_breakdown=kb,
                        params=base_params,
                        profile_summary=profile_summary,
                    ),
                )
            )

            doc_res, ex_res, vis_res = await asyncio.gather(
                doc_task, ex_task, vis_task, return_exceptions=True
            )
            outputs.document = _maybe_assign(outputs.errors, "DocumentAgent", doc_res)
            outputs.exercise = _maybe_assign(outputs.errors, "ExerciseAgent", ex_res)
            outputs.visual = _maybe_assign(outputs.errors, "VisualAgent", vis_res)

            # 4) CodeAgent —— 依赖 Document（已经跑完，可以放心串）
            code_agent: CodeAgent = self._agent("CodeAgent")
            code_langs = [
                lang for lang in req.languages if lang in ("python", "java")
            ] or ["python", "java"]
            try:
                outputs.code = await code_agent.run(
                    task_id,
                    CodeAgentInput(
                        knowledge_breakdown=kb,
                        params=base_params,
                        profile_summary=profile_summary,
                        languages=code_langs,  # type: ignore[arg-type]
                    ),
                )
            except Exception as exc:
                logger.exception("CodeAgent 失败 task_id=%s", task_id)
                outputs.errors["CodeAgent"] = str(exc)

            # 5) EvaluationAgent —— 拿 Exercise 输出当"模拟答题"，闭环反馈画像
            evaluation_agent: EvaluationAgent = self._agent("EvaluationAgent")
            mock_answers = _make_mock_answers(outputs.exercise)
            try:
                outputs.evaluation = await evaluation_agent.run(
                    task_id,
                    EvaluationAgentInput(
                        session_id=task_id,
                        knowledge_id=req.knowledge_id,
                        profile=profile_result.profile,
                        answers=mock_answers,
                    ),
                )
            except Exception as exc:
                logger.exception("EvaluationAgent 失败 task_id=%s", task_id)
                outputs.errors["EvaluationAgent"] = str(exc)

            await self._emit_summary(task_id, started_at, "ok" if not outputs.errors else "partial", outputs.errors)
            return outputs

        except Exception as exc:
            logger.exception("GenerateFlow 顶层失败 task_id=%s", task_id)
            await self._emit_summary(task_id, started_at, "error", {"top": str(exc)})
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


# ─────────────────────────────── 辅助 ───────────────────────────────


def _pick_params(plan: PlannerOutput, fallback_focus: str):
    """从 PlannerOutput.tasks 里挑一份 params 作为下游通用参数。

    优先 DocumentAgent 的，其次第一个；再次给个默认值。
    """
    from ..schemas.resource import ResourceTaskParams

    for t in plan.tasks:
        if t.agent == "DocumentAgent":
            return t.params
    if plan.tasks:
        return plan.tasks[0].params
    return ResourceTaskParams(focus=fallback_focus, reason="planner 未给出 task")


def _maybe_assign(errors: dict[str, str], name: str, value: Any):
    if isinstance(value, Exception):
        logger.exception("%s 失败：%s", name, value)
        errors[name] = str(value)
        return None
    return value


def _make_mock_answers(exercise: ExerciseResult | None) -> list[AnswerRecord]:
    """演示态：把 Exercise 题目转成"假装答题"记录。

    规则：偶数 index 答对、奇数答错，足以触发滑动公式 + tag 统计。
    """
    if exercise is None:
        return []
    answers: list[AnswerRecord] = []
    for i, q in enumerate(exercise.questions):
        is_correct = i % 2 == 0
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
