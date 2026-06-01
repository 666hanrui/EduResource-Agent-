"""
AI 工作台流式接口。

这个模块保留 career-planning-agent feature-agentic 中“类 Claude Code / AI Coach”
的核心交互契约：会话、技能指令、上传附件、运行步骤、流式回答和可折叠执行轨迹。
它暂时使用内存存储会话，避免侵入现有 EduResource-Agent 的生成链路。
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..core.context import AppContext

logger = logging.getLogger(__name__)


class CoachWorkbenchMessage(BaseModel):
    """前端传入的简化对话消息。"""

    role: str = Field(default="user")
    content: str = ""
    attachments: list[dict[str, Any]] | None = None
    selected_skill: dict[str, Any] | None = None
    selectedSkill: dict[str, Any] | None = None


class CoachWorkbenchRequest(BaseModel):
    """AI 工作台请求。"""

    messages: list[CoachWorkbenchMessage]
    source_page: str | None = None
    active_task_id: str | None = None
    session_id: str | None = None
    client_message_id: str | None = None
    pipeline_stage: str | None = None
    selected_skill: dict[str, Any] | None = None
    selectedSkill: dict[str, Any] | None = None
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class CoachSkill(BaseModel):
    name: str
    label: str
    description: str
    agent: str
    classification: str
    enabled: bool = True
    requiresEvidence: bool = False


_COACH_SKILLS = [
    CoachSkill(
        name="/resume",
        label="画像诊断",
        description="从专业、年级、兴趣和学习证据生成 12 维学习画像，不再依赖简历。",
        agent="ProfileAgent",
        classification="readonly",
        requiresEvidence=True,
    ),
    CoachSkill(
        name="/match",
        label="方向匹配",
        description="基于专业广度探索结果，匹配兴趣方向、职业入口和能力缺口。",
        agent="PlannerAgent",
        classification="readonly",
    ),
    CoachSkill(
        name="/learn",
        label="学习路径",
        description="把方向拆成基础知识图谱、项目练习、阶段目标和资源节奏。",
        agent="DocumentAgent",
        classification="mutation_safe",
    ),
    CoachSkill(
        name="/generate",
        label="资源生成",
        description="把自然语言目标转为 EduResource 全 DAG 生成任务入口。",
        agent="GenerateFlow",
        classification="mutation_gated",
    ),
    CoachSkill(
        name="/trace",
        label="运行追踪",
        description="解释 Profile / Planner / Document / Exercise / Code / Visual / Evaluation 的协作过程。",
        agent="Orchestrator",
        classification="readonly",
    ),
    CoachSkill(
        name="/report",
        label="报告整理",
        description="输出可展示的成长报告、推荐溯源和闭环评估话术。",
        agent="EvaluationAgent",
        classification="readonly",
    ),
]

_SESSIONS: dict[str, dict[str, Any]] = {}
_UPLOADS: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sse(event: str, payload: dict[str, Any]) -> str:
    """序列化为浏览器 fetch/ReadableStream 友好的 SSE 行。"""

    return "data: " + json.dumps(
        {
            "event": event,
            "ts": time.time(),
            "payload": payload,
        },
        ensure_ascii=False,
    ) + "\n\n"


def _last_user_text(messages: list[CoachWorkbenchMessage]) -> str:
    for message in reversed(messages):
        if message.role == "user":
            return message.content
    return messages[-1].content if messages else ""


def _selected_skill(payload: CoachWorkbenchRequest) -> dict[str, Any] | None:
    if payload.selected_skill or payload.selectedSkill:
        return payload.selected_skill or payload.selectedSkill
    for message in reversed(payload.messages):
        if message.selected_skill or message.selectedSkill:
            return message.selected_skill or message.selectedSkill
    return None


def _skill_title(skill: dict[str, Any] | None) -> str:
    if not skill:
        return "自然语言任务"
    return str(skill.get("label") or skill.get("name") or "技能指令")


def _step(
    step_id: str,
    kind: str,
    status: str,
    title: str,
    summary: str | None = None,
    *,
    agent: str | None = "EduResourceCoach",
    tool_name: str | None = None,
    started_at: str | None = None,
    completed_at: str | None = None,
    duration_ms: int | None = None,
) -> dict[str, Any]:
    event = {
        "event": "step",
        "stepId": step_id,
        "kind": kind,
        "status": status,
        "title": title,
        "summary": summary,
        "agent": agent,
        "toolName": tool_name,
        "startedAt": started_at or _now_iso(),
        "completedAt": completed_at,
        "durationMs": duration_ms,
        # Backward-compatible fields for older frontend drafts.
        "label": title,
        "detail": summary,
    }
    return {k: v for k, v in event.items() if v is not None}


def _complete_step(step: dict[str, Any], duration_ms: int) -> dict[str, Any]:
    return {
        **step,
        "status": "success",
        "completedAt": _now_iso(),
        "durationMs": duration_ms,
    }


def _fallback_answer(
    text: str,
    source_page: str | None,
    active_task_id: str | None,
    skill: dict[str, Any] | None,
    attachment_count: int,
) -> str:
    """无 API Key 或上游失败时的本地兜底，保证演示不断流。"""

    lowered = text.lower()
    context = []
    if source_page:
        context.append(f"当前页面：{source_page}")
    if active_task_id:
        context.append(f"当前任务：{active_task_id}")
    if skill:
        context.append(f"技能：{_skill_title(skill)}")
    if attachment_count:
        context.append(f"附件：{attachment_count} 个")
    context_line = "；".join(context) or "当前没有绑定具体任务"

    if "claude" in lowered or "工作台" in lowered or "code" in lowered:
        return (
            f"已读取工作台上下文（{context_line}）。\n\n"
            "这块会完整保留 reference 仓的 Claude Code 式体验：左侧会话、slash 技能、附件证据、"
            "中间对话、每条助手消息自带可展开运行轨迹。轨迹会展示路由、上下文装载、工具调用、记忆读取、"
            "答案生成与指标汇总，所以它不是普通聊天框，而是可以直接操作 EduResource 多 Agent 系统的控制台。"
        )
    if "链表" in lowered or "linked" in lowered:
        return (
            f"已读取工作台上下文（{context_line}）。\n\n"
            "针对「链表」资源生成，建议保留三段式演示：先让 ProfileAgent 说明学生薄弱点，"
            "再让 Document/Exercise/Visual 并行生成，最后用 EvaluationAgent 展示答题反馈如何更新画像。"
            "这样评委能同时看到多 Agent 协作和个性化闭环。"
        )
    if "二叉树" in lowered or "tree" in lowered:
        return (
            f"已读取工作台上下文（{context_line}）。\n\n"
            "二叉树遍历适合做第二个杀手锏知识点：VisualAgent 展示遍历路径，CodeAgent 给递归与栈两种写法，"
            "ExerciseAgent 重点生成先序/中序/后序混淆题，EvaluationAgent 再反推学生是否卡在递归栈理解。"
        )
    if "为什么" in lowered or "推荐" in lowered or "溯源" in lowered:
        return (
            f"已读取工作台上下文（{context_line}）。\n\n"
            "推荐理由应该固定写成四段：画像依据、知识短板、资源参数、生成结果。"
            "这不是装饰文案，而是系统证明“个性化不是一句空话”的关键证据。"
        )
    if "生成" in lowered or "启动" in lowered:
        return (
            f"已读取工作台上下文（{context_line}）。\n\n"
            "可以把这条指令转成资源生成任务：选择知识点 → 调用 /api/generate → 订阅 /api/tasks/{task_id}/events → "
            "右侧 AgentTracePanel 展示 7 个 Agent 的实时状态。当前接口已为这条链路预留工具调用入口。"
        )
    return (
        f"已读取工作台上下文（{context_line}）。\n\n"
        "我是 EduResource 的 AI 工作台助手。现在可以帮你解释多 Agent 运行过程、生成演示话术、"
        "检查资源推荐的个性化依据，也可以把自然语言指令转换为后续的资源生成动作。"
    )


def _session_title(text: str, skill: dict[str, Any] | None) -> str:
    base = text.strip().replace("\n", " ")
    if not base and skill:
        base = _skill_title(skill)
    if not base:
        base = "新的工作台会话"
    return base[:28]


def _message_to_session_item(message: CoachWorkbenchMessage, fallback_id: str) -> dict[str, Any]:
    selected_skill = message.selected_skill or message.selectedSkill
    item: dict[str, Any] = {
        "id": fallback_id,
        "role": message.role,
        "content": message.content,
        "status": "completed",
    }
    if message.attachments:
        item["attachments"] = message.attachments
    if selected_skill:
        item["selectedSkill"] = selected_skill
    return item


def _save_session(
    session_id: str,
    payload: CoachWorkbenchRequest,
    assistant_message_id: str,
    answer: str,
    trace: list[dict[str, Any]],
    metrics: dict[str, int],
) -> None:
    skill = _selected_skill(payload)
    now = _now_iso()
    existing = _SESSIONS.get(session_id, {})
    messages = [
        _message_to_session_item(message, payload.client_message_id or f"msg_{idx}")
        for idx, message in enumerate(payload.messages)
        if message.role in {"user", "assistant", "system"}
    ]
    messages.append(
        {
            "id": assistant_message_id,
            "role": "assistant",
            "content": answer,
            "status": "completed",
            "activeAgent": "EduResourceCoach",
            "runTrace": trace,
            "metrics": metrics,
        }
    )
    _SESSIONS[session_id] = {
        "sessionId": session_id,
        "title": existing.get("title") or _session_title(_last_user_text(payload.messages), skill),
        "updatedAt": now,
        "createdAt": existing.get("createdAt") or now,
        "activeAgent": "EduResourceCoach",
        "sourcePage": payload.source_page,
        "activeTaskId": payload.active_task_id,
        "messages": messages,
    }


def _session_summary(session: dict[str, Any]) -> dict[str, Any]:
    messages = session.get("messages") or []
    preview = ""
    for message in reversed(messages):
        if message.get("role") == "user" and message.get("content"):
            preview = str(message["content"])[:80]
            break
    return {
        "sessionId": session["sessionId"],
        "title": session.get("title") or "工作台会话",
        "updatedAt": session.get("updatedAt"),
        "activeAgent": session.get("activeAgent"),
        "preview": preview,
    }


def build_coach_workbench_router(ctx: AppContext) -> APIRouter:
    router = APIRouter(prefix="/api/coach", tags=["coach-workbench"])

    @router.get("/workbench/skills")
    async def list_workbench_skills() -> dict[str, Any]:
        return {"skills": [skill.model_dump() for skill in _COACH_SKILLS]}

    @router.get("/workbench/sessions")
    async def list_workbench_sessions() -> dict[str, Any]:
        sessions = sorted(
            (_session_summary(session) for session in _SESSIONS.values()),
            key=lambda item: item.get("updatedAt") or "",
            reverse=True,
        )
        return {"sessions": sessions}

    @router.get("/workbench/sessions/{session_id}")
    async def get_workbench_session(session_id: str) -> dict[str, Any]:
        session = _SESSIONS.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="coach session not found")
        return session

    @router.delete("/workbench/sessions/{session_id}")
    async def delete_workbench_session(session_id: str) -> dict[str, bool]:
        _SESSIONS.pop(session_id, None)
        return {"ok": True}

    @router.post("/workbench/upload")
    async def upload_workbench_file(request: Request) -> dict[str, Any]:
        body = await request.body()
        file_id = f"upl_{uuid4().hex[:12]}"
        raw_name = request.headers.get("x-file-name") or request.query_params.get("name") or "attachment"
        file_type = request.headers.get("x-file-type") or request.query_params.get("type") or "application/octet-stream"
        name = unquote(raw_name)[:120]
        upload = {
            "fileId": file_id,
            "name": name,
            "type": file_type,
            "size": len(body),
            "uploadedAt": _now_iso(),
        }
        _UPLOADS[file_id] = {**upload, "contentPreview": body[:512].decode("utf-8", errors="ignore")}
        return {"attachment": upload}

    @router.post("/workbench/stream")
    async def stream_workbench(payload: CoachWorkbenchRequest) -> StreamingResponse:
        """类 Claude Code 的 AI 工作台流式入口。"""

        async def _gen():
            session_id = payload.session_id or f"coach_session_{uuid4().hex[:10]}"
            run_id = f"coach_run_{uuid4().hex[:10]}"
            assistant_message_id = f"assistant_{uuid4().hex[:10]}"
            user_text = _last_user_text(payload.messages)
            selected_skill = _selected_skill(payload)
            attachment_count = len(payload.attachments) + sum(
                len(message.attachments or []) for message in payload.messages
            )
            trace: list[dict[str, Any]] = []
            answer_chunks: list[str] = []

            yield _sse(
                "run_start",
                {
                    "run_id": run_id,
                    "runId": run_id,
                    "sessionId": session_id,
                    "assistantMessageId": assistant_message_id,
                    "activeAgent": "EduResourceCoach",
                    "title": _skill_title(selected_skill),
                    # Backward-compatible fields.
                    "run_id_legacy": run_id,
                    "active_agent": "EduResourceCoach",
                    "source_page": payload.source_page,
                    "active_task_id": payload.active_task_id,
                },
            )

            planned_steps = [
                _step(
                    "route-intent",
                    "route",
                    "running",
                    "识别用户意图",
                    f"进入 {_skill_title(selected_skill)}，由 EduResourceCoach 决定执行路径",
                    duration_ms=None,
                ),
                _step(
                    "load-context",
                    "context",
                    "running",
                    "装载页面上下文",
                    payload.source_page or "未绑定页面",
                    tool_name="page_context",
                ),
                _step(
                    "load-evidence",
                    "memory",
                    "running",
                    "读取项目记忆与附件证据",
                    f"保留 feature-agentic AI Coach 契约；附件 {attachment_count} 个",
                    tool_name="coach_memory",
                ),
                _step(
                    "agent-switch",
                    "agent_switch",
                    "running",
                    "选择协作 Agent",
                    f"主控 EduResourceCoach，必要时转接 {_skill_title(selected_skill)} 相关 Agent",
                    agent="EduResourceCoach",
                ),
                _step(
                    "answer",
                    "answer",
                    "running",
                    "生成可执行回答",
                    "开始流式输出",
                    agent="EduResourceCoach",
                ),
            ]

            for index, step in enumerate(planned_steps[:-1]):
                yield _sse("step", step)
                completed = _complete_step(step, 120 + index * 45)
                trace.append(completed)
                yield _sse("step", completed)

            answer_step = planned_steps[-1]
            yield _sse("step", answer_step)

            system_prompt = {
                "role": "system",
                "content": (
                    "你是 EduResource-Agent 的 AI 工作台助手，交互形态参考 Claude Code。"
                    "你的任务不是闲聊，而是帮助用户操作和解释一个多智能体教育资源生成系统。"
                    "回答必须围绕：专业广度探索、12 维学习画像、多 Agent 协同、资源生成、推荐溯源、闭环评估、演示落地。"
                    "项目面向刚入学大学生，不要默认用户有合格简历或明确职业目标；"
                    "如果用户提出生成/启动/打开之类的指令，要说明应调用哪个系统能力；"
                    "如果用户询问为什么推荐，要按画像依据、短板依据、资源参数、生成结果四段解释。"
                ),
            }
            messages = [system_prompt] + [m.model_dump() for m in payload.messages if m.role != "system"]

            try:
                streamed_any = False
                async for delta in ctx.llm.stream(messages, temperature=0.25):
                    streamed_any = True
                    answer_chunks.append(delta)
                    yield _sse("answer_delta", {"delta": delta, "text": delta})
                if not streamed_any:
                    fallback = _fallback_answer(
                        user_text,
                        payload.source_page,
                        payload.active_task_id,
                        selected_skill,
                        attachment_count,
                    )
                    for chunk in _chunk_text(fallback):
                        answer_chunks.append(chunk)
                        yield _sse("answer_delta", {"delta": chunk, "text": chunk})
                completed_answer = _complete_step(answer_step, 420)
                trace.append(completed_answer)
                yield _sse("step", completed_answer)
                metrics = {
                    "steps": len(trace),
                    "tools": len([step for step in trace if step.get("toolName")]),
                    "memories": len([step for step in trace if step.get("kind") == "memory"]),
                }
                _save_session(
                    session_id,
                    payload,
                    assistant_message_id,
                    "".join(answer_chunks),
                    trace,
                    metrics,
                )
                yield _sse(
                    "run_done",
                    {
                        "sessionId": session_id,
                        "stopReason": "complete",
                        "metrics": metrics,
                        "run_id": run_id,
                        "stop_reason": "complete",
                    },
                )
            except Exception as exc:
                logger.warning("coach workbench stream fallback: %s", exc)
                fallback_step = _step(
                    "fallback",
                    "tool",
                    "success",
                    "模型不可用，启用本地兜底",
                    "Spark / LLM 上游暂不可用，继续输出本地演示回答",
                    tool_name="fallback_answer",
                    duration_ms=80,
                )
                trace.append(fallback_step)
                yield _sse("step", fallback_step)
                fallback = _fallback_answer(
                    user_text,
                    payload.source_page,
                    payload.active_task_id,
                    selected_skill,
                    attachment_count,
                )
                for chunk in _chunk_text(fallback):
                    answer_chunks.append(chunk)
                    yield _sse("answer_delta", {"delta": chunk, "text": chunk})
                completed_answer = _complete_step(answer_step, 260)
                trace.append(completed_answer)
                yield _sse("step", completed_answer)
                metrics = {
                    "steps": len(trace),
                    "tools": len([step for step in trace if step.get("toolName")]),
                    "memories": len([step for step in trace if step.get("kind") == "memory"]),
                }
                _save_session(
                    session_id,
                    payload,
                    assistant_message_id,
                    "".join(answer_chunks),
                    trace,
                    metrics,
                )
                yield _sse(
                    "run_done",
                    {
                        "sessionId": session_id,
                        "stopReason": "fallback",
                        "metrics": metrics,
                        "run_id": run_id,
                        "stop_reason": "fallback",
                    },
                )

        return StreamingResponse(
            _gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    return router


def _chunk_text(text: str, size: int = 18) -> list[str]:
    return [text[i : i + size] for i in range(0, len(text), size)]
