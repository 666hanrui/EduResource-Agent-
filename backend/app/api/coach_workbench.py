"""
AI 工作台流式接口。

这个模块用于把 career-planning-agent feature-agentic 中“类 Claude Code / AI Coach”
的交互形态先接入当前 EduResource-Agent：
- 前端可以发起上下文对话；
- 后端按 run_start → step → answer_delta → run_done / run_error 输出；
- 暂不侵入现有 /api/generate 和 AgentTracePanel 链路；
- 后续迁入完整 career-planning-agent UI 时，可以直接复用这个事件契约。
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..core.context import AppContext

logger = logging.getLogger(__name__)


class CoachWorkbenchMessage(BaseModel):
    """前端传入的简化对话消息。"""

    role: str = Field(default="user")
    content: str


class CoachWorkbenchRequest(BaseModel):
    """AI 工作台请求。"""

    messages: list[CoachWorkbenchMessage]
    source_page: str | None = None
    active_task_id: str | None = None


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


def _fallback_answer(text: str, source_page: str | None, active_task_id: str | None) -> str:
    """无 API Key 或上游失败时的本地兜底，保证演示不断流。"""

    lowered = text.lower()
    context = []
    if source_page:
        context.append(f"当前页面：{source_page}")
    if active_task_id:
        context.append(f"当前任务：{active_task_id}")
    context_line = "；".join(context) or "当前没有绑定具体任务"

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


def build_coach_workbench_router(ctx: AppContext) -> APIRouter:
    router = APIRouter(prefix="/api/coach", tags=["coach-workbench"])

    @router.post("/workbench/stream")
    async def stream_workbench(payload: CoachWorkbenchRequest) -> StreamingResponse:
        """类 Claude Code 的 AI 工作台流式入口。

        输出事件类型：
        - run_start：建立一次工作台运行；
        - step：展示路由、上下文、工具、记忆等过程；
        - answer_delta：逐段输出答案；
        - run_done / run_error：结束状态。
        """

        async def _gen():
            run_id = f"coach_{int(time.time() * 1000)}"
            user_text = _last_user_text(payload.messages)
            yield _sse(
                "run_start",
                {
                    "run_id": run_id,
                    "active_agent": "EduResourceCoach",
                    "source_page": payload.source_page,
                    "active_task_id": payload.active_task_id,
                },
            )
            yield _sse("step", {"kind": "route", "label": "识别用户意图", "detail": "进入 EduResourceCoach 工作台"})
            yield _sse(
                "step",
                {
                    "kind": "context",
                    "label": "装载页面上下文",
                    "detail": payload.source_page or "未绑定页面",
                },
            )
            if payload.active_task_id:
                yield _sse(
                    "step",
                    {
                        "kind": "tool",
                        "label": "关联当前任务",
                        "detail": f"task_id={payload.active_task_id}",
                    },
                )
            yield _sse("step", {"kind": "memory", "label": "读取项目记忆", "detail": "保留 career-planning-agent 的 AI Coach 交互契约"})

            system_prompt = {
                "role": "system",
                "content": (
                    "你是 EduResource-Agent 的 AI 工作台助手，交互形态参考 Claude Code。"
                    "你的任务不是闲聊，而是帮助用户操作和解释一个多智能体教育资源生成系统。"
                    "回答必须围绕：学习画像、多 Agent 协同、资源生成、推荐溯源、闭环评估、演示落地。"
                    "如果用户提出生成/启动/打开之类的指令，要说明应调用哪个系统能力；"
                    "如果用户询问为什么推荐，要按画像依据、短板依据、资源参数、生成结果四段解释。"
                ),
            }
            messages = [system_prompt] + [m.model_dump() for m in payload.messages if m.role != "system"]

            try:
                streamed_any = False
                async for delta in ctx.llm.stream(messages, temperature=0.25):
                    streamed_any = True
                    yield _sse("answer_delta", {"text": delta})
                if not streamed_any:
                    fallback = _fallback_answer(user_text, payload.source_page, payload.active_task_id)
                    for chunk in _chunk_text(fallback):
                        yield _sse("answer_delta", {"text": chunk})
                yield _sse("run_done", {"run_id": run_id, "stop_reason": "complete"})
            except Exception as exc:
                logger.warning("coach workbench stream fallback: %s", exc)
                yield _sse("step", {"kind": "fallback", "label": "模型不可用", "detail": "启用本地兜底回答"})
                fallback = _fallback_answer(user_text, payload.source_page, payload.active_task_id)
                for chunk in _chunk_text(fallback):
                    yield _sse("answer_delta", {"text": chunk})
                yield _sse("run_done", {"run_id": run_id, "stop_reason": "fallback"})

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
