"""
ToolCallingFlow —— MainAgent（Supervisor）决策循环。

架构参考 pi-agent 的 Supervisor 模式：
    MainAgent LLM 每轮观察当前 state（已完成哪些工具、哪些输出就绪），
    决定下一步调哪些工具（call_tool / finish）。
    工具函数对应各 sub-agent，执行后把结果写回共享 state。

关键设计：
- 支持并行工具调用：LLM 可在一轮决策中提议多个无依赖工具同时运行
- 失败不阻塞：任一工具失败记入 errors，MainAgent 下轮跳过继续
- 兜底防死循环：超过 max_tool_calls 轮强制 finish
- 与 GenerateFlow 共存：Orchestrator 提供两个入口，互不干扰
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from ..services.llm_service import LLMService
from .code_agent import CodeAgent, CodeAgentInput
from .document_agent import DocumentAgent, DocumentAgentInput, ProfileSummary
from .evaluation_agent import AnswerRecord, EvaluationAgent, EvaluationAgentInput
from .event_bus import AgentEvent, EventBus, EventType
from .exercise_agent import ExerciseAgent, ExerciseAgentInput
from .generate_flow import (
    GenerateOutputs,
    GenerateRequest,
    _apply_selection_context,
    _make_mock_answers,
    _pick_params,
    _selection_context_turns,
)
from .planner_agent import PlannerAgent, PlannerAgentInput, TargetKnowledge
from .profile_agent import ProfileAgent, ProfileAgentInput
from .registry import AgentRegistry
from .tool_calling_types import MainAgentDecision, ToolCallingState, ToolName
from .visual_agent import VisualAgent, VisualAgentInput

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "main_agent_v1.md"


# ─────────────────────────────── 扩展决策模型 ───────────────────────────────


class MainAgentDecisionV2(BaseModel):
    """支持单轮并行多工具的决策结构。"""

    action: str = Field(..., description="call_tool 或 finish")
    tool_names: list[ToolName] = Field(
        default_factory=list,
        description="本轮要调用的工具列表（并行），finish 时为空",
    )
    reason: str = Field(default="", description="决策理由")
    args: dict[str, Any] = Field(default_factory=dict)


# ─────────────────────────────── 状态摘要辅助 ───────────────────────────────


def _build_state_summary(state: ToolCallingState) -> dict[str, Any]:
    """把当前 state 压缩成 LLM 可读的决策摘要。"""
    outputs: GenerateOutputs = state["outputs"]
    completed: list[str] = [r.tool_name for r in state.get("history", []) if r.status == "ok"]  # type: ignore[union-attr]
    failed: list[str] = [r.tool_name for r in state.get("history", []) if r.status == "error"]  # type: ignore[union-attr]

    # plan 中要调哪些 agent
    plan_tasks: list[dict[str, Any]] = []
    if outputs.plan is not None:
        for t in outputs.plan.tasks:
            plan_tasks.append({"agent": t.agent, "depends_on": t.depends_on})

    return {
        "task_id": state["task_id"],
        "iterations": state.get("iterations", 0),
        "max_tool_calls": state.get("max_tool_calls", 12),
        "completed_tools": completed,
        "failed_tools": failed,
        "outputs_ready": {
            "profile": outputs.profile is not None,
            "plan": outputs.plan is not None,
            "document": outputs.document is not None,
            "exercise": outputs.exercise is not None,
            "visual": outputs.visual is not None,
            "code": outputs.code is not None,
            "evaluation": outputs.evaluation is not None,
        },
        "plan_tasks": plan_tasks,
        "errors": outputs.errors,
    }


# ─────────────────────────────── ToolCallingFlow ───────────────────────────────


class ToolCallingFlow:
    """
    MainAgent 驱动的动态工具调用流程。

    与 GenerateFlow 的区别：
    - GenerateFlow：固定 7 步线性流水线，生成 agent 由代码硬编码
    - ToolCallingFlow：LLM 每轮决定调哪些工具，生成 agent 由 Planner 输出动态决定
    """

    MAX_TOOL_CALLS = 12  # 防死循环上限

    def __init__(
        self,
        registry: AgentRegistry,
        event_bus: EventBus,
        llm_service: LLMService,
    ) -> None:
        self.registry = registry
        self.event_bus = event_bus
        self.llm = llm_service
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    def _agent(self, name: str) -> Any:
        return self.registry.get(name)

    async def run(self, task_id: str, req: GenerateRequest) -> GenerateOutputs:
        """主入口：启动 MainAgent 决策循环，直到 finish 或超限。"""
        started_at = time.time()
        state: ToolCallingState = {
            "task_id": task_id,
            "req": req,
            "outputs": GenerateOutputs(),
            "history": [],
            "decision": None,
            "iterations": 0,
            "max_tool_calls": self.MAX_TOOL_CALLS,
            "started_at": started_at,
            "finished": False,
        }

        await self._emit_supervisor_event(task_id, "supervisor.start", {"mode": "tool_calling"})

        try:
            while not state["finished"] and state["iterations"] < self.MAX_TOOL_CALLS:
                state["iterations"] = state.get("iterations", 0) + 1

                # 1. LLM 决策
                decision = await self._decide(state)
                state["decision"] = decision

                logger.info(
                    "[ToolCallingFlow] 第 %d 轮决策: action=%s tools=%s reason=%s",
                    state["iterations"],
                    decision.action,
                    decision.tool_names,
                    decision.reason,
                )

                await self._emit_supervisor_event(
                    task_id,
                    "supervisor.decision",
                    {
                        "iteration": state["iterations"],
                        "action": decision.action,
                        "tool_names": decision.tool_names,
                        "reason": decision.reason,
                    },
                )

                # 2. 执行或结束
                if decision.action == "finish":
                    state["finished"] = True
                    break

                if decision.action == "call_tool" and decision.tool_names:
                    await self._execute_parallel(state, decision.tool_names)

            # 超限兜底
            if not state["finished"] and state["iterations"] >= self.MAX_TOOL_CALLS:
                logger.warning(
                    "[ToolCallingFlow] 超过 max_tool_calls=%d 轮，强制结束", self.MAX_TOOL_CALLS
                )

            status = "ok" if not state["outputs"].errors else "partial"
            await self._emit_supervisor_event(
                task_id,
                "supervisor.done",
                {
                    "status": status,
                    "iterations": state["iterations"],
                    "elapsed_ms": int((time.time() - started_at) * 1000),
                    "errors": state["outputs"].errors,
                },
            )
            return state["outputs"]

        except Exception as exc:
            logger.exception("[ToolCallingFlow] 顶层失败 task_id=%s", task_id)
            await self._emit_supervisor_event(
                task_id,
                "supervisor.error",
                {"error": str(exc), "elapsed_ms": int((time.time() - started_at) * 1000)},
            )
            raise

    # ─────────────────────────────── 决策 ───────────────────────────────

    async def _decide(self, state: ToolCallingState) -> MainAgentDecisionV2:
        """调用 LLM 生成本轮决策，失败时使用规则兜底。"""
        summary = _build_state_summary(state)
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": _dict_to_json(summary)},
        ]
        try:
            result, _ = await self.llm.generate_structured(
                messages,
                schema=MainAgentDecisionV2,
                temperature=0.0,
                max_retries=2,
            )
            return result
        except Exception as exc:
            logger.warning("[ToolCallingFlow] LLM 决策失败，使用规则兜底: %s", exc)
            return _rule_based_decision(state)

    # ─────────────────────────────── 执行 ───────────────────────────────

    async def _execute_parallel(
        self, state: ToolCallingState, tool_names: list[ToolName]
    ) -> None:
        """并行执行本轮所有工具，结果写回 state.outputs。"""
        coros = [self._execute_one(state, name) for name in tool_names]
        await asyncio.gather(*coros, return_exceptions=True)

    async def _execute_one(self, state: ToolCallingState, tool_name: ToolName) -> None:
        """执行单个工具，捕获异常并写入 outputs.errors。"""
        from .tool_calling_types import ToolCallRecord

        task_id = state["task_id"]
        req: GenerateRequest = state["req"]
        outputs: GenerateOutputs = state["outputs"]

        try:
            if tool_name == "extract_profile":
                await self._tool_extract_profile(task_id, req, outputs)
            elif tool_name == "plan_learning":
                await self._tool_plan_learning(task_id, req, outputs)
            elif tool_name == "generate_document":
                await self._tool_generate_document(task_id, req, outputs)
            elif tool_name == "generate_exercise":
                await self._tool_generate_exercise(task_id, req, outputs)
            elif tool_name == "generate_visual":
                await self._tool_generate_visual(task_id, req, outputs)
            elif tool_name == "generate_code":
                await self._tool_generate_code(task_id, req, outputs)
            elif tool_name == "evaluate_learning":
                await self._tool_evaluate_learning(task_id, req, outputs)
            else:
                raise ValueError(f"未知工具: {tool_name!r}")

            state["history"].append(  # type: ignore[union-attr]
                ToolCallRecord(tool_name=tool_name, status="ok", reason="执行成功")
            )

        except Exception as exc:
            logger.exception("[ToolCallingFlow] 工具 %s 执行失败", tool_name)
            outputs.errors[tool_name] = str(exc)
            state["history"].append(  # type: ignore[union-attr]
                ToolCallRecord(
                    tool_name=tool_name, status="error", reason=str(exc), error=str(exc)
                )
            )

    # ─────────────────────────────── 7 个工具函数 ───────────────────────────────

    async def _tool_extract_profile(
        self, task_id: str, req: GenerateRequest, outputs: GenerateOutputs
    ) -> None:
        agent: ProfileAgent = self._agent("ProfileAgent")
        result = await agent.run(
            task_id,
            ProfileAgentInput(
                session_id=task_id,
                conversation=[
                    *req.conversation,
                    *_selection_context_turns(req.selection_context),
                ],
                prior_profile=req.prior_profile,
            ),
        )
        outputs.profile = result.profile

    async def _tool_plan_learning(
        self, task_id: str, req: GenerateRequest, outputs: GenerateOutputs
    ) -> None:
        if outputs.profile is None:
            raise RuntimeError("plan_learning 依赖 extract_profile，但 profile 尚未就绪")
        agent: PlannerAgent = self._agent("PlannerAgent")
        plan = await agent.run(
            task_id,
            PlannerAgentInput(
                profile=outputs.profile,
                target_knowledge=TargetKnowledge(
                    id=req.knowledge_id,
                    name=req.knowledge_name,
                ),
            ),
        )
        outputs.plan = plan

    async def _tool_generate_document(
        self, task_id: str, req: GenerateRequest, outputs: GenerateOutputs
    ) -> None:
        if outputs.plan is None:
            raise RuntimeError("generate_document 依赖 plan_learning，但 plan 尚未就绪")
        agent: DocumentAgent = self._agent("DocumentAgent")
        kb = outputs.plan.knowledge_breakdown
        params = _apply_selection_context(
            _pick_params(outputs.plan, req.knowledge_name), req.selection_context
        )
        profile_summary = _make_profile_summary(outputs)
        outputs.document = await agent.run(
            task_id,
            DocumentAgentInput(
                knowledge_breakdown=kb,
                params=params,
                profile_summary=profile_summary,
            ),
        )

    async def _tool_generate_exercise(
        self, task_id: str, req: GenerateRequest, outputs: GenerateOutputs
    ) -> None:
        if outputs.plan is None:
            raise RuntimeError("generate_exercise 依赖 plan_learning，但 plan 尚未就绪")
        agent: ExerciseAgent = self._agent("ExerciseAgent")
        kb = outputs.plan.knowledge_breakdown
        params = _apply_selection_context(
            _pick_params(outputs.plan, req.knowledge_name), req.selection_context
        )
        profile_summary = _make_profile_summary(outputs)
        outputs.exercise = await agent.run(
            task_id,
            ExerciseAgentInput(
                knowledge_breakdown=kb,
                params=params,
                profile_summary=profile_summary,
                count=req.exercise_count,
            ),
        )

    async def _tool_generate_visual(
        self, task_id: str, req: GenerateRequest, outputs: GenerateOutputs
    ) -> None:
        if outputs.plan is None:
            raise RuntimeError("generate_visual 依赖 plan_learning，但 plan 尚未就绪")
        agent: VisualAgent = self._agent("VisualAgent")
        kb = outputs.plan.knowledge_breakdown
        params = _apply_selection_context(
            _pick_params(outputs.plan, req.knowledge_name), req.selection_context
        )
        profile_summary = _make_profile_summary(outputs)
        outputs.visual = await agent.run(
            task_id,
            VisualAgentInput(
                knowledge_breakdown=kb,
                params=params,
                profile_summary=profile_summary,
            ),
        )

    async def _tool_generate_code(
        self, task_id: str, req: GenerateRequest, outputs: GenerateOutputs
    ) -> None:
        if outputs.plan is None:
            raise RuntimeError("generate_code 依赖 plan_learning，但 plan 尚未就绪")
        if outputs.document is None:
            raise RuntimeError("generate_code 依赖 generate_document，但 document 尚未就绪")
        agent: CodeAgent = self._agent("CodeAgent")
        kb = outputs.plan.knowledge_breakdown
        params = _apply_selection_context(
            _pick_params(outputs.plan, req.knowledge_name), req.selection_context
        )
        profile_summary = _make_profile_summary(outputs)
        code_langs = [lang for lang in req.languages if lang in ("python", "java")] or [
            "python",
            "java",
        ]
        outputs.code = await agent.run(
            task_id,
            CodeAgentInput(
                knowledge_breakdown=kb,
                params=params,
                profile_summary=profile_summary,
                languages=code_langs,  # type: ignore[arg-type]
            ),
        )

    async def _tool_evaluate_learning(
        self, task_id: str, req: GenerateRequest, outputs: GenerateOutputs
    ) -> None:
        if outputs.profile is None:
            raise RuntimeError("evaluate_learning 依赖 profile，但 profile 尚未就绪")
        agent: EvaluationAgent = self._agent("EvaluationAgent")
        mock_answers: list[AnswerRecord] = _make_mock_answers(outputs.exercise)
        outputs.evaluation = await agent.run(
            task_id,
            EvaluationAgentInput(
                session_id=task_id,
                knowledge_id=req.knowledge_id,
                profile=outputs.profile,
                answers=mock_answers,
            ),
        )

    # ─────────────────────────────── 事件 ───────────────────────────────

    async def _emit_supervisor_event(
        self, task_id: str, event_type: str, payload: dict[str, Any]
    ) -> None:
        """发布 MainAgent 自身的调度事件，前端时序面板可展示 Supervisor 行为。"""
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.AGENT_DELTA,
                task_id=task_id,
                agent="MainAgent",
                ts=time.time(),
                payload={"event": event_type, **payload},
            )
        )


# ─────────────────────────────── 规则兜底决策 ───────────────────────────────


def _rule_based_decision(state: ToolCallingState) -> MainAgentDecisionV2:
    """LLM 决策失败时的规则兜底：按固定顺序推进。"""
    outputs: GenerateOutputs = state["outputs"]
    history = state.get("history", []) or []
    completed = {r.tool_name for r in history if r.status == "ok"}  # type: ignore[union-attr]
    failed = {r.tool_name for r in history if r.status == "error"}  # type: ignore[union-attr]

    # 按依赖顺序逐步推进
    if "extract_profile" not in completed and "extract_profile" not in failed:
        return MainAgentDecisionV2(action="call_tool", tool_names=["extract_profile"], reason="规则兜底：第一步")

    if "plan_learning" not in completed and "plan_learning" not in failed:
        return MainAgentDecisionV2(action="call_tool", tool_names=["plan_learning"], reason="规则兜底：画像就绪，开始规划")

    # 确定 plan 中要跑的 agents
    plan_agents: set[str] = set()
    if outputs.plan:
        plan_agents = {t.agent for t in outputs.plan.tasks}
    else:
        plan_agents = {"DocumentAgent", "ExerciseAgent", "VisualAgent", "CodeAgent"}

    # 并行三件套（无依赖的）
    parallel_tools: list[ToolName] = []
    tool_agent_map: dict[ToolName, str] = {
        "generate_document": "DocumentAgent",
        "generate_exercise": "ExerciseAgent",
        "generate_visual": "VisualAgent",
    }
    for tool, agent in tool_agent_map.items():
        if agent in plan_agents and tool not in completed and tool not in failed:
            parallel_tools.append(tool)

    if parallel_tools:
        return MainAgentDecisionV2(
            action="call_tool", tool_names=parallel_tools, reason="规则兜底：并行生成"
        )

    # CodeAgent（依赖 Document）
    if (
        "CodeAgent" in plan_agents
        and "generate_code" not in completed
        and "generate_code" not in failed
        and ("generate_document" in completed or "generate_document" in failed)
    ):
        return MainAgentDecisionV2(
            action="call_tool", tool_names=["generate_code"], reason="规则兜底：Document 完成，生成代码"
        )

    # Evaluation
    if "evaluate_learning" not in completed and "evaluate_learning" not in failed:
        any_gen_done = any(
            t in completed for t in ["generate_document", "generate_exercise", "generate_visual"]
        )
        if any_gen_done:
            return MainAgentDecisionV2(
                action="call_tool",
                tool_names=["evaluate_learning"],
                reason="规则兜底：生成完成，评估学习效果",
            )

    return MainAgentDecisionV2(action="finish", tool_names=[], reason="规则兜底：所有任务完成")


# ─────────────────────────────── 辅助函数 ───────────────────────────────


def _make_profile_summary(outputs: GenerateOutputs) -> ProfileSummary:
    if outputs.profile is None:
        return ProfileSummary(weakness=[], preference=[])
    return ProfileSummary(
        weakness=outputs.profile.weakness,
        preference=list(outputs.profile.preference),
    )


def _dict_to_json(d: dict[str, Any]) -> str:
    import json
    return json.dumps(d, ensure_ascii=False, indent=2)
