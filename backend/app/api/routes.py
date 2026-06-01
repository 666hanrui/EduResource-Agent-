"""
HTTP API 路由。

端点：
- POST /api/profile/extract           调用 ProfileAgent，返回 task_id
- POST /api/plan                      调用 PlannerAgent，返回 task_id 与计划
- GET  /api/tasks/{task_id}/events    订阅 SSE 事件流（杀手锏一的后端入口）
- GET  /api/health                    健康检查
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from ..agents.base import new_task_id
from ..agents.generate_flow import GenerateOutputs, GenerateRequest
from ..agents.planner_agent import PlannerAgentInput
from ..agents.profile_agent import ProfileAgentInput
from ..core.context import AppContext
from ..schemas.exploration import (
    CoachRequest,
    CoachResponse,
    ExplorationPlan,
    ExplorationRequest,
    ExplorationWorkspace,
    FavoriteDirection,
    FavoriteDirectionRequest,
    GrowthReport,
    GrowthReportUpdateRequest,
    ProfileUpdateRequest,
    ReportExportFormat,
    ResourceStatusUpdateRequest,
    ReviewCreateRequest,
    TaskUpdateRequest,
    WorkspaceCreateRequest,
)
from ..services.major_exploration import (
    add_workspace_review,
    build_exploration_coach_response,
    build_growth_report,
    build_major_exploration_plan,
    create_exploration_workspace,
    create_favorite_direction,
    get_exploration_workspace,
    list_favorite_directions,
    export_growth_report,
    update_growth_report_draft,
    update_workspace_profile,
    update_workspace_resource,
    update_workspace_task,
)
from ..services.digital_human_actions import DigitalHumanAction, list_digital_human_actions

logger = logging.getLogger(__name__)

# 演示态：内存里缓存最近一次 generate 的结构化产出，给 ResultsPanel 用
_GENERATE_OUTPUTS: dict[str, dict] = {}


def _serialize_outputs(outputs: GenerateOutputs) -> dict:
    """把 GenerateOutputs 里的 pydantic 对象转 dict，方便前端 JSON 消费。"""
    return {
        "profile": outputs.profile.model_dump() if outputs.profile else None,
        "plan": outputs.plan.model_dump() if outputs.plan else None,
        "document": outputs.document.model_dump() if outputs.document else None,
        "exercise": outputs.exercise.model_dump() if outputs.exercise else None,
        "visual": outputs.visual.model_dump() if outputs.visual else None,
        "code": outputs.code.model_dump() if outputs.code else None,
        "evaluation": outputs.evaluation.model_dump() if outputs.evaluation else None,
        "errors": outputs.errors,
    }


class ChatRequest(BaseModel):
    messages: list[dict[str, str]]


def build_router(ctx: AppContext) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/health")
    async def health() -> dict:
        return {"status": "ok", "agents": ctx.registry.all_names()}

    @router.get("/digital-human/actions", response_model=list[DigitalHumanAction])
    async def digital_human_actions() -> list[DigitalHumanAction]:
        """Return the action contract a digital human may use to operate the app."""

        return list_digital_human_actions()

    # ──────────────────────── 专业探索模块 ────────────────────────

    @router.post("/exploration/plan", response_model=ExplorationPlan)
    async def build_exploration_plan(payload: ExplorationRequest) -> ExplorationPlan:
        """从专业/年级/兴趣出发生成探索型 12 维画像与学习路径。

        这是 career-planning-agent 的“简历→12维画像→岗位匹配→学习路径”
        链路在 EduResource-Agent 中的改造入口：先探索专业广度，再逐步收敛方向。
        """
        return build_major_exploration_plan(payload)

    @router.get("/exploration/favorites", response_model=list[FavoriteDirection])
    async def get_exploration_favorites(student_id: str = "stu_001") -> list[FavoriteDirection]:
        return list_favorite_directions(student_id)

    @router.post("/exploration/favorites", response_model=FavoriteDirection)
    async def favorite_exploration_direction(payload: FavoriteDirectionRequest) -> FavoriteDirection:
        try:
            return create_favorite_direction(
                student_id=payload.student_id,
                plan=payload.plan,
                direction_id=payload.direction_id,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/exploration/workspaces", response_model=ExplorationWorkspace)
    async def create_workspace(payload: WorkspaceCreateRequest) -> ExplorationWorkspace:
        try:
            return create_exploration_workspace(
                student_id=payload.student_id,
                plan=payload.plan,
                direction_id=payload.direction_id,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.get("/exploration/workspaces/{workspace_id}", response_model=ExplorationWorkspace)
    async def get_workspace(workspace_id: str) -> ExplorationWorkspace:
        workspace = get_exploration_workspace(workspace_id)
        if workspace is None:
            raise HTTPException(status_code=404, detail="workspace not found")
        return workspace

    @router.patch(
        "/exploration/workspaces/{workspace_id}/tasks/{task_id}",
        response_model=ExplorationWorkspace,
    )
    async def update_workspace_task_status(
        workspace_id: str,
        task_id: str,
        payload: TaskUpdateRequest,
    ) -> ExplorationWorkspace:
        try:
            return update_workspace_task(
                workspace_id=workspace_id,
                task_id=task_id,
                status=payload.status,
                note=payload.note,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post(
        "/exploration/workspaces/{workspace_id}/reviews",
        response_model=ExplorationWorkspace,
    )
    async def create_workspace_review(
        workspace_id: str,
        payload: ReviewCreateRequest,
    ) -> ExplorationWorkspace:
        try:
            return add_workspace_review(
                workspace_id=workspace_id,
                review_type=payload.review_type,
                phase=payload.phase,
                summary=payload.summary,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.patch(
        "/exploration/workspaces/{workspace_id}/profile",
        response_model=ExplorationWorkspace,
    )
    async def update_workspace_profile_endpoint(
        workspace_id: str,
        payload: ProfileUpdateRequest,
    ) -> ExplorationWorkspace:
        try:
            return update_workspace_profile(
                workspace_id=workspace_id,
                dimension_key=payload.dimension_key,
                values=payload.values,
                note=payload.note,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.patch(
        "/exploration/workspaces/{workspace_id}/resources/{resource_id}",
        response_model=ExplorationWorkspace,
    )
    async def update_workspace_resource_status(
        workspace_id: str,
        resource_id: str,
        payload: ResourceStatusUpdateRequest,
    ) -> ExplorationWorkspace:
        try:
            return update_workspace_resource(
                workspace_id=workspace_id,
                resource_id=resource_id,
                status=payload.status,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/exploration/workspaces/{workspace_id}/coach", response_model=CoachResponse)
    async def coach_workspace(
        workspace_id: str,
        payload: CoachRequest,
    ) -> CoachResponse:
        try:
            return build_exploration_coach_response(
                workspace_id=workspace_id,
                question=payload.question,
                tone=payload.tone,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.get("/exploration/workspaces/{workspace_id}/growth-report", response_model=GrowthReport)
    async def get_growth_report(workspace_id: str) -> GrowthReport:
        try:
            return build_growth_report(workspace_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.patch("/exploration/workspaces/{workspace_id}/growth-report", response_model=GrowthReport)
    async def update_growth_report(
        workspace_id: str,
        payload: GrowthReportUpdateRequest,
    ) -> GrowthReport:
        try:
            return update_growth_report_draft(
                workspace_id=workspace_id,
                markdown=payload.markdown,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.get("/exploration/workspaces/{workspace_id}/growth-report/export")
    async def export_growth_report_endpoint(
        workspace_id: str,
        format: ReportExportFormat = "markdown",
    ) -> Response:
        try:
            exported = export_growth_report(
                workspace_id=workspace_id,
                export_format=format,
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return Response(
            content=exported.content,
            media_type=exported.media_type,
            headers={"Content-Disposition": f'attachment; filename="{exported.filename}"'},
        )

    # ──────────────────────── ProfileAgent ────────────────────────

    class ProfileExtractResponse(BaseModel):
        task_id: str

    @router.post("/profile/extract", response_model=ProfileExtractResponse)
    async def extract_profile(payload: ProfileAgentInput) -> ProfileExtractResponse:
        """异步触发 ProfileAgent，立刻返回 task_id 让前端订阅事件流。

        前端流程：
        1. POST 拿 task_id
        2. EventSource("/api/tasks/{task_id}/events") 订阅
        3. 收 agent.start / agent.delta / agent.done
        """
        task_id = new_task_id("profile")
        agent = ctx.registry.get("ProfileAgent")

        async def _run() -> None:
            try:
                await agent.run(task_id, payload)
            except Exception:
                logger.exception("ProfileAgent 执行失败 task_id=%s", task_id)
            finally:
                await ctx.event_bus.close_task(task_id)

        asyncio.create_task(_run())
        return ProfileExtractResponse(task_id=task_id)

    # ──────────────────────── PlannerAgent ────────────────────────

    class PlanResponse(BaseModel):
        task_id: str

    @router.post("/plan", response_model=PlanResponse)
    async def plan(payload: PlannerAgentInput) -> PlanResponse:
        task_id = new_task_id("plan")
        agent = ctx.registry.get("PlannerAgent")

        async def _run() -> None:
            try:
                await agent.run(task_id, payload)
            except Exception:
                logger.exception("PlannerAgent 执行失败 task_id=%s", task_id)
            finally:
                await ctx.event_bus.close_task(task_id)

        asyncio.create_task(_run())
        return PlanResponse(task_id=task_id)

    # ──────────────────────── 全 DAG 生成 ────────────────────────

    class GenerateResponse(BaseModel):
        task_id: str

    @router.post("/generate", response_model=GenerateResponse)
    async def generate(payload: GenerateRequest) -> GenerateResponse:
        """触发完整的 7-Agent DAG 演示流。

        前端流程与 /api/plan 一致：
        1. POST 拿 task_id
        2. EventSource("/api/tasks/{task_id}/events") 订阅
        3. AgentTracePanel 一次订阅看到 7 行 Agent 全亮
        4. 任务结束后调 /api/tasks/{task_id}/results 拿最终产物（用于 ResultsPanel）
        """
        task_id = new_task_id("gen")

        async def _run() -> None:
            try:
                outputs = await ctx.generate_flow.run(task_id, payload)
                _GENERATE_OUTPUTS[task_id] = _serialize_outputs(outputs)
            except Exception:
                logger.exception("GenerateFlow 失败 task_id=%s", task_id)
            finally:
                await ctx.event_bus.close_task(task_id)

        asyncio.create_task(_run())
        return GenerateResponse(task_id=task_id)

    @router.get("/tasks/{task_id}/results")
    async def get_results(task_id: str) -> dict:
        """拿一次 GenerateFlow 完整产物 —— 给 ResultsPanel + RationalePanel 用。

        简单内存缓存即可，演示态不考虑过期。
        """
        if task_id not in _GENERATE_OUTPUTS:
            raise HTTPException(status_code=404, detail="task results not ready")
        return _GENERATE_OUTPUTS[task_id]

    # ──────────────────────── 通用 AI 助教对话 ────────────────────────

    @router.post("/chat")
    async def general_chat(payload: ChatRequest) -> dict:
        """通用 AI 助教对话接口，支持大模型调用和本地规则兜底。"""
        try:
            system_prompt = {
                "role": "system",
                "content": (
                    "你是数据结构与算法课程的 AI 智能助教『小灵』。"
                    "你的回答要专业、亲切、通俗易懂，并且在必要时给出清晰的步骤和防坑指南。"
                    "请使用 Markdown 格式来排版代码块或分点列表。"
                )
            }
            full_messages = [system_prompt] + [m for m in payload.messages if m.get("role") != "system"]
            response = await ctx.llm.chat(full_messages)
            return {"content": response.content}
        except Exception as exc:
            logger.warning("通用对话接口调用异常，启用规则兜底: %s", exc)
            user_msg = payload.messages[-1].get("content", "").lower()
            reply = "你好！我是你的 AI 助教。在配置大模型 API Key 之前，我可以为您进行本地规则解答：\n\n"
            if "链表" in user_msg or "link" in user_msg or "insert" in user_msg:
                reply += (
                    "对于**单链表的中间插入**，操作的核心在于指针修改顺序。具体步骤是：\n"
                    "1. 创建新节点 `new_node`；\n"
                    "2. 将新节点的 next 指向当前节点的 next：`new_node->next = curr->next`；\n"
                    "3. 将当前节点的 next 指向新节点：`curr->next = new_node`。\n\n"
                    "⚠️ **防坑指南**：第2步和第3步绝不能颠倒，否则原链表后续部分指针会丢失！"
                )
            elif "二叉树" in user_msg or "tree" in user_msg:
                reply += (
                    "**二叉树的遍历**主要有三种经典顺序：\n"
                    "- **先序遍历**：根节点 -> 左子树 -> 右子树；\n"
                    "- **中序遍历**：左子树 -> 根节点 -> 右子树；\n"
                    "- **后序遍历**：左子树 -> 右子树 -> 根节点。\n\n"
                    "它们在代码中可以通过递归或栈（迭代占位）来实现。"
                )
            elif "画像" in user_msg or "profile" in user_msg:
                reply += (
                    "系统会为您生成**学习画像**（含当前掌握度、学习风格如代码/图解/推导、当前进度），"
                    "以及专业探索模块的 **12维能力画像**，用于精准匹配并生成您此刻所需的定制资源。"
                )
            else:
                reply += (
                    "我是您的 AI 智能助教『小灵』。我可以协助您理解单链表插入指针顺序、二叉树遍历原理，以及帮助您在专业探索或个性化资源生成中解答问题。"
                )
            return {"content": reply}

    # ──────────────────────── SSE 事件流 ────────────────────────

    @router.get("/tasks/{task_id}/events")
    async def stream_events(task_id: str, request: Request) -> StreamingResponse:
        """SSE 事件流。

        前端用法：
            const es = new EventSource(`/api/tasks/${taskId}/events`)
            es.onmessage = e => reducer(JSON.parse(e.data))
        """
        if not task_id:
            raise HTTPException(status_code=400, detail="task_id required")

        async def _gen():
            # 立即发一条 retry 指令，避免浏览器默认 3s 重连
            yield "retry: 2000\n\n"
            try:
                async for line in ctx.event_bus.subscribe(task_id):
                    if await request.is_disconnected():
                        return
                    yield f"data: {line}\n\n"
            except asyncio.CancelledError:
                pass

        return StreamingResponse(
            _gen(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",  # nginx 透传
            },
        )

    return router
