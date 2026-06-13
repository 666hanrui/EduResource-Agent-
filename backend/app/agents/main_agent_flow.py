"""Unified MainAgent flow.

The supervisor can choose OpenMAIC interactive-classroom tools, teacher package
lifecycle tools, or classic GenerateFlow fallback.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from ..services.llm_service import LLMService
from ..services.openmaic_main_tools import OpenMAICMainTools
from ..services.teacher_main_tools import TeacherMainTools
from .event_bus import AgentEvent, EventBus, EventType
from .generate_flow import GenerateFlow, GenerateOutputs, GenerateRequest
from .registry import AgentRegistry
from .tool_calling_types import ToolCallRecord, ToolCallingState, ToolName

logger = logging.getLogger(__name__)
_PROMPT_PATH = Path(__file__).parent / "prompts" / "main_agent_v1.md"
_LEGACY_AGENT_TOOLS = {
    "extract_profile",
    "plan_learning",
    "generate_document",
    "generate_exercise",
    "generate_visual",
    "generate_code",
    "evaluate_learning",
}


class MainAgentDecision(BaseModel):
    action: str = Field(...)
    tool_names: list[ToolName] = Field(default_factory=list)
    reason: str = ""
    args: dict[str, Any] = Field(default_factory=dict)


class MainAgentFlow:
    """MainAgent as a tool caller over OpenMAIC + Teacher tools + GenerateFlow."""

    MAX_TOOL_CALLS = 8

    def __init__(
        self,
        registry: AgentRegistry,
        event_bus: EventBus,
        llm_service: LLMService,
        openmaic_tools: OpenMAICMainTools | None = None,
        teacher_tools: TeacherMainTools | None = None,
    ) -> None:
        self.registry = registry
        self.event_bus = event_bus
        self.llm = llm_service
        self.generate_flow = GenerateFlow(registry, event_bus)
        self.openmaic = openmaic_tools or OpenMAICMainTools()
        self.teacher = teacher_tools or TeacherMainTools()
        self.system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    async def run(self, task_id: str, req: GenerateRequest) -> GenerateOutputs:
        started_at = time.time()
        state: ToolCallingState = {
            "task_id": task_id,
            "req": req,
            "outputs": GenerateOutputs(),
            "history": [],
            "iterations": 0,
            "max_tool_calls": self.MAX_TOOL_CALLS,
            "started_at": started_at,
            "finished": False,
        }
        await self._event(task_id, "main.start", {"tools": ["openmaic", "teacher", "generate_flow"]})
        try:
            while not state.get("finished") and state.get("iterations", 0) < self.MAX_TOOL_CALLS:
                state["iterations"] = int(state.get("iterations", 0)) + 1
                decision = await self._decide(state)
                decision = self._normalize(state, decision)
                await self._event(task_id, "main.decision", decision.model_dump())
                if decision.action == "finish":
                    state["finished"] = True
                    break
                for tool_name in decision.tool_names:
                    await self._run_tool(state, tool_name, _merged_tool_args(state["req"], decision.args, tool_name))

            status = "ok" if not state["outputs"].errors else "partial"
            await self._event(
                task_id,
                "main.done",
                {
                    "status": status,
                    "iterations": state.get("iterations", 0),
                    "errors": state["outputs"].errors,
                    "external_keys": list(_external(state["outputs"]).keys()),
                    "elapsed_ms": int((time.time() - started_at) * 1000),
                },
            )
            await self._summary(task_id, started_at, status, state["outputs"].errors)
            return state["outputs"]
        except Exception as exc:
            await self._summary(task_id, started_at, "error", {"MainAgent": str(exc)})
            raise

    async def _decide(self, state: ToolCallingState) -> MainAgentDecision:
        try:
            result, _ = await self.llm.generate_structured(
                [
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": _snapshot(state)},
                ],
                schema=MainAgentDecision,
                temperature=0.0,
                max_retries=2,
            )
            return result
        except Exception as exc:
            logger.warning("MainAgent decision fallback: %s", exc)
            return _rule_decision(state)

    def _normalize(self, state: ToolCallingState, decision: MainAgentDecision) -> MainAgentDecision:
        if decision.action == "finish":
            return MainAgentDecision(action="finish", tool_names=[], reason=decision.reason, args=decision.args)
        if decision.action != "call_tool" or not decision.tool_names:
            return _rule_decision(state)
        history = state.get("history", []) or []
        completed = {item.tool_name for item in history if item.status == "ok"}
        failed = {item.tool_name for item in history if item.status == "error"}
        tools: list[ToolName] = []
        for raw_tool_name in decision.tool_names:
            tool_name: ToolName = "run_generate_flow" if raw_tool_name in _LEGACY_AGENT_TOOLS else raw_tool_name
            if tool_name == "finish" or tool_name in completed:
                continue
            if tool_name in failed and tool_name != "run_generate_flow":
                continue
            if tool_name not in tools:
                tools.append(tool_name)
        return MainAgentDecision(
            action="call_tool" if tools else "finish",
            tool_names=tools,
            reason=decision.reason,
            args=decision.args,
        )

    async def _run_tool(self, state: ToolCallingState, tool_name: ToolName, args: dict[str, Any]) -> None:
        task_id = state["task_id"]
        req = state["req"]
        outputs = state["outputs"]
        started = time.time()
        try:
            if tool_name == "create_interactive_classroom":
                result = await self.openmaic.create_interactive_classroom(
                    task_id=task_id,
                    req=req,
                    outputs=outputs,
                    args=args,
                )
            elif tool_name == "poll_interactive_classroom":
                result = await self.openmaic.poll_interactive_classroom(req=req, outputs=outputs, args=args)
            elif tool_name == "import_classroom_package":
                result = await self.openmaic.import_classroom_package(outputs=outputs, args=args)
            elif tool_name == "load_resource_package":
                result = await self.openmaic.load_resource_package(outputs=outputs, args=args)
            elif tool_name == "import_exercise_attempts":
                result = await self.openmaic.import_exercise_attempts(outputs=outputs, args=args)
            elif tool_name == "refresh_student_dashboard":
                result = await self.openmaic.refresh_student_dashboard(req=req, outputs=outputs, args=args)
            elif tool_name == "create_teacher_package":
                await self._run_generate_flow(task_id, req, outputs)
                result = await self.teacher.create_teacher_package(req=req, outputs=outputs, args=args)
            elif tool_name == "export_teacher_pptx":
                result = await self.teacher.export_teacher_pptx(outputs=outputs, args=args)
            elif tool_name == "run_generate_flow" or tool_name in _LEGACY_AGENT_TOOLS:
                result = await self._run_generate_flow(task_id, req, outputs)
            else:
                raise ValueError(f"unsupported MainAgent tool: {tool_name}")
            summary = _brief(result)
            state["history"].append(ToolCallRecord(tool_name=tool_name, status="ok", args=args, summary=summary))
            await self._event(task_id, "tool.done", {"tool_name": tool_name, "summary": summary, "elapsed_ms": int((time.time() - started) * 1000)})
        except Exception as exc:
            outputs.errors[tool_name] = str(exc)
            state["history"].append(ToolCallRecord(tool_name=tool_name, status="error", args=args, error=str(exc)))
            await self._event(task_id, "tool.error", {"tool_name": tool_name, "error": str(exc), "elapsed_ms": int((time.time() - started) * 1000)})

    async def _run_generate_flow(self, task_id: str, req: GenerateRequest, outputs: GenerateOutputs) -> dict[str, Any]:
        generated = await self.generate_flow.run(task_id, req)
        outputs.profile = generated.profile or outputs.profile
        outputs.plan = generated.plan or outputs.plan
        outputs.document = generated.document or outputs.document
        outputs.exercise = generated.exercise or outputs.exercise
        outputs.visual = generated.visual or outputs.visual
        outputs.code = generated.code or outputs.code
        outputs.evaluation = generated.evaluation or outputs.evaluation
        outputs.errors.update(generated.errors)
        _external(outputs).update(_external(generated))
        return {"status": "ok", "filled": _ready(outputs)}

    async def _event(self, task_id: str, name: str, payload: dict[str, Any]) -> None:
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.AGENT_DELTA,
                task_id=task_id,
                agent="MainAgent",
                ts=time.time(),
                payload={"event": name, **payload},
            )
        )

    async def _summary(
        self,
        task_id: str,
        started_at: float,
        status: str,
        errors: dict[str, str] | dict[str, Any] | None = None,
    ) -> None:
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.TASK_SUMMARY,
                task_id=task_id,
                agent="MainAgent",
                ts=time.time(),
                payload={
                    "status": status,
                    "elapsed_ms": int((time.time() - started_at) * 1000),
                    "error": "; ".join(f"{k}:{v}" for k, v in (errors or {}).items()) or None,
                },
            )
        )


def _rule_decision(state: ToolCallingState) -> MainAgentDecision:
    req = state["req"]
    outputs = state["outputs"]
    history = state.get("history", []) or []
    completed = {item.tool_name for item in history if item.status == "ok"}
    failed = {item.tool_name for item in history if item.status == "error"}
    external = _external(outputs)
    if _prefers_teacher(req):
        if "create_teacher_package" not in completed and "create_teacher_package" not in failed:
            return MainAgentDecision(action="call_tool", tool_names=["create_teacher_package"], reason="teacher package requested")
        return MainAgentDecision(action="finish", reason="teacher package path done")
    if _prefers_openmaic(req):
        if "create_interactive_classroom" not in completed and "create_interactive_classroom" not in failed:
            return MainAgentDecision(action="call_tool", tool_names=["create_interactive_classroom"], reason="interactive classroom requested")
        if "create_interactive_classroom" in failed and "run_generate_flow" not in completed and "run_generate_flow" not in failed:
            return MainAgentDecision(action="call_tool", tool_names=["run_generate_flow"], reason="OpenMAIC failed; fallback to GenerateFlow")
        classroom = external.get("openmaic_classroom") if isinstance(external.get("openmaic_classroom"), dict) else {}
        if classroom.get("status") in {"queued", "running"} and "poll_interactive_classroom" not in completed:
            return MainAgentDecision(action="call_tool", tool_names=["poll_interactive_classroom"], reason="poll classroom once")
        if "refresh_student_dashboard" not in completed and ("create_interactive_classroom" in completed or "poll_interactive_classroom" in completed):
            return MainAgentDecision(action="call_tool", tool_names=["refresh_student_dashboard"], reason="refresh student dashboard")
        return MainAgentDecision(action="finish", reason="OpenMAIC path done")
    if "run_generate_flow" not in completed and "run_generate_flow" not in failed:
        return MainAgentDecision(action="call_tool", tool_names=["run_generate_flow"], reason="lightweight resource fallback")
    return MainAgentDecision(action="finish", reason="done")


def _prefers_teacher(req: GenerateRequest) -> bool:
    return bool(req.selection_context and req.selection_context.source == "teacher_console")


def _prefers_openmaic(req: GenerateRequest) -> bool:
    context = req.selection_context
    if context is None:
        return False
    if context.source in {"exploration", "coach", "digital_human"}:
        return True
    text = f"{context.reason} {req.knowledge_name}".lower()
    return any(word in text for word in ["互动", "课堂", "验证", "classroom", "openmaic"])


def _snapshot(state: ToolCallingState) -> str:
    import json

    outputs = state["outputs"]
    history = state.get("history", []) or []
    data = {
        "request": {
            "student_id": state["req"].student_id,
            "knowledge_id": state["req"].knowledge_id,
            "knowledge_name": state["req"].knowledge_name,
            "selection_context": state["req"].selection_context.model_dump(mode="json") if state["req"].selection_context else None,
            "main_agent_args": state["req"].main_agent_args,
        },
        "iterations": state.get("iterations", 0),
        "completed_tools": [item.tool_name for item in history if item.status == "ok"],
        "failed_tools": [item.tool_name for item in history if item.status == "error"],
        "outputs_ready": _ready(outputs),
        "external": _external(outputs),
        "errors": outputs.errors,
    }
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


def _ready(outputs: GenerateOutputs) -> dict[str, bool]:
    return {
        "profile": outputs.profile is not None,
        "plan": outputs.plan is not None,
        "document": outputs.document is not None,
        "exercise": outputs.exercise is not None,
        "visual": outputs.visual is not None,
        "code": outputs.code is not None,
        "evaluation": outputs.evaluation is not None,
        "external": bool(_external(outputs)),
    }


def _external(outputs: GenerateOutputs) -> dict[str, Any]:
    value = getattr(outputs, "external", None)
    if not isinstance(value, dict):
        value = {}
        setattr(outputs, "external", value)
    return value


def _merged_tool_args(req: GenerateRequest, decision_args: dict[str, Any], tool_name: str) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    request_specific = req.main_agent_args.get(tool_name)
    if isinstance(request_specific, dict):
        merged.update(request_specific)
    if isinstance(decision_args, dict):
        decision_specific = decision_args.get(tool_name)
        if isinstance(decision_specific, dict):
            merged.update(decision_specific)
        else:
            merged.update({k: v for k, v in decision_args.items() if k not in req.main_agent_args})
    return merged


def _brief(value: Any) -> str:
    import json

    text = json.dumps(value, ensure_ascii=False, default=str)
    return text if len(text) <= 360 else f"{text[:360]}..."
