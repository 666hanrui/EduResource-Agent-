"""
HTTP API 路由。

端点：
- POST /api/profile/extract             调用 ProfileAgent，返回 task_id
- POST /api/plan                        调用 PlannerAgent，返回 task_id 与计划
- POST /api/generate                    固定 7 步流水线（GenerateFlow）
- POST /api/generate/tool-calling       MainAgent 动态决策模式（ToolCallingFlow）
- GET  /api/tasks/{task_id}/events      订阅 SSE 事件流（NDJSON）
- GET  /api/tasks/{task_id}/results     获取完整生成产物（ResultsPanel 用）
- GET  /api/health                      健康检查
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from ..agents.base import new_task_id
from ..agents.generate_flow import GenerateOutputs, GenerateRequest, GenerateSelectionContext
from ..agents.planner_agent import PlannerAgentInput
from ..agents.profile_agent import ProfileAgentInput
from ..core.config import get_settings
from ..core.context import AppContext
from ..schemas.openmaic import (
    OpenMAICAttemptsHistoryResponse,
    OpenMAICClassroomImportRequest,
    OpenMAICClassroomImportResponse,
    OpenMAICExerciseAttemptsImportRequest,
    OpenMAICExerciseAttemptsImportResponse,
)
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
from ..services.digital_human_actions import DigitalHumanAction, KnowledgeShortcut, list_digital_human_actions, list_knowledge_shortcuts
from ..services.generate_store import SQLiteGenerateStore
from ..services.openmaic_attempts import import_openmaic_attempts, load_openmaic_attempts
from ..services.openmaic_client import OpenMAICClient
from ..services.openmaic_import import import_openmaic_classroom, load_openmaic_import
from ..services.resource_package_store import SQLiteResourcePackageStore
from ..services.supplemental_resources import build_supplemental_resources
from ..services.student_learning_store import SQLiteStudentLearningStore
from ..schemas.student import (
    InteractiveClassroomCreateRequest,
    InteractiveClassroomJob,
    ResourceItem,
    ResourcePackage,
    ResourceRationale,
    StudentDashboard,
)
from ..schemas.teacher import (
    TeacherDashboard,
    TeacherGenerationJob,
    TeacherTeachingPackageCreateRequest,
)
from ..services.teacher_store import (
    ClassNotFoundError,
    SQLiteTeacherStore,
    StudentNotInClassError,
    TeacherJobNotFoundError,
    TeacherNotFoundError,
)

logger = logging.getLogger(__name__)

# SQLite 持久化存储，重启后自动恢复历史生成结果
_GENERATE_STORE = SQLiteGenerateStore()
_GENERATE_OUTPUT_CACHE: dict[str, dict] = _GENERATE_STORE.load_all()
_RESOURCE_PACKAGE_STORE = SQLiteResourcePackageStore()
_STUDENT_LEARNING_STORE = SQLiteStudentLearningStore()
_TEACHER_STORE = SQLiteTeacherStore()


def _serialize_outputs(outputs: GenerateOutputs, request: GenerateRequest | None = None) -> dict:
    """把 GenerateOutputs 里的 pydantic 对象转 dict，方便前端 JSON 消费。"""
    payload = {
        "profile": outputs.profile.model_dump() if outputs.profile else None,
        "plan": outputs.plan.model_dump() if outputs.plan else None,
        "document": outputs.document.model_dump() if outputs.document else None,
        "exercise": outputs.exercise.model_dump() if outputs.exercise else None,
        "visual": outputs.visual.model_dump() if outputs.visual else None,
        "code": outputs.code.model_dump() if outputs.code else None,
        "evaluation": outputs.evaluation.model_dump() if outputs.evaluation else None,
        "errors": outputs.errors,
    }
    if request is not None:
        payload["supplemental"] = build_supplemental_resources(
            knowledge_id=request.knowledge_id,
            knowledge_name=request.knowledge_name,
            student_id=request.student_id,
            weakness=outputs.profile.weakness if outputs.profile else [],
        )
    return payload


def _teacher_store_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, StudentNotInClassError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, (TeacherNotFoundError, ClassNotFoundError, TeacherJobNotFoundError)):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


class ChatRequest(BaseModel):
    messages: list[dict[str, str]]


def build_router(
    ctx: AppContext,
    resource_package_store: SQLiteResourcePackageStore | None = None,
    student_learning_store: SQLiteStudentLearningStore | None = None,
    openmaic_client: OpenMAICClient | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api")
    package_store = resource_package_store or _RESOURCE_PACKAGE_STORE
    learning_store = student_learning_store or _STUDENT_LEARNING_STORE
    settings = getattr(ctx, "settings", None) or get_settings()
    classroom_client = openmaic_client or OpenMAICClient(settings.openmaic_base_url)

    @router.get("/health")
    async def health() -> dict:
        return {"status": "ok", "agents": ctx.registry.all_names()}

    # ──────────────────────── 学生互动课堂主路径 ────────────────────────

    @router.post(
        "/students/{student_id}/interactive-classrooms",
        response_model=InteractiveClassroomJob,
    )
    async def create_student_interactive_classroom(
        student_id: str,
        payload: InteractiveClassroomCreateRequest,
    ) -> InteractiveClassroomJob:
        now = datetime.now(timezone.utc)
        job_id = f"ic_{uuid4().hex[:12]}"
        package_id = f"pkg_ic_{student_id}_{_safe_id(payload.target_knowledge_id)}_{job_id}"
        profile = learning_store.get_profile(student_id)
        learning_path = learning_store.get_learning_path(student_id)
        learning_goal = payload.learning_goal or f"学习 {payload.target_knowledge_name}"
        profile_snapshot = profile.model_dump(mode="json") if profile else {}
        if payload.selection_context:
            profile_snapshot["selection_context"] = payload.selection_context
            if payload.selection_context.get("reason"):
                profile_snapshot["selection_context_reason"] = payload.selection_context.get("reason")
            if payload.selection_context.get("source"):
                profile_snapshot["selection_context_source"] = payload.selection_context.get("source")
        profile_snapshot["learning_goal"] = learning_goal
        if learning_path:
            current_step = next(
                (
                    step
                    for step in learning_path.steps
                    if step.status in {"pending", "in_progress", "adjusted"}
                ),
                learning_path.steps[0] if learning_path.steps else None,
            )
            if current_step is not None:
                profile_snapshot["current_path_step"] = {
                    "step_id": current_step.step_id,
                    "title": current_step.title,
                    "target_knowledge_id": current_step.target_knowledge_id,
                    "status": current_step.status,
                }
        requirement = (
            f"为学生生成互动课堂：{payload.target_knowledge_name}。"
            f"学习目标：{learning_goal}。"
            f"难度：{payload.difficulty}/5。"
        )
        edu_context = {
            "mode": "student",
            "studentId": student_id,
            "resourcePackageId": package_id,
            "targetKnowledge": {
                "id": payload.target_knowledge_id,
                "name": payload.target_knowledge_name,
            },
            "learningGoal": learning_goal,
            "difficulty": payload.difficulty,
            "profileSnapshot": profile_snapshot,
            "resourcePreferences": profile.resource_preference if profile else [],
        }
        package = _draft_interactive_package(
            package_id=package_id,
            student_id=student_id,
            target_knowledge_id=payload.target_knowledge_id,
            target_knowledge_name=payload.target_knowledge_name,
            learning_goal=learning_goal,
            job_id=job_id,
            selection_context=payload.selection_context,
            profile=profile,
            now=now,
        )
        package_store.save(package)
        mastery_before = int((profile.knowledge_mastery if profile else {}).get(payload.target_knowledge_id, 0))
        learning_store.upsert_classroom_step(
            student_id=student_id,
            target_knowledge_id=payload.target_knowledge_id,
            title=f"{payload.target_knowledge_name}互动课堂",
            package_id=package_id,
            mastery_before=mastery_before,
        )

        try:
            openmaic_job = await classroom_client.start_classroom_generation(
                {"requirement": requirement, "eduResourceContext": edu_context}
            )
        except Exception as exc:
            logger.exception("OpenMAIC classroom generation failed to start")
            raise HTTPException(status_code=502, detail=f"OpenMAIC generation failed: {exc}") from exc

        openmaic_job_id = str(openmaic_job.get("jobId") or openmaic_job.get("job_id") or "")
        if not openmaic_job_id:
            raise HTTPException(status_code=502, detail="OpenMAIC did not return a job id")
        job = InteractiveClassroomJob(
            job_id=job_id,
            student_id=student_id,
            resource_package_id=package_id,
            openmaic_job_id=openmaic_job_id,
            status="running",
            classroom_url=None,
            package_url=f"/api/resource-packages/{package_id}",
            message=str(openmaic_job.get("message") or "OpenMAIC classroom generation started."),
            created_at=now,
            updated_at=now,
        )
        learning_store.save_job(job)
        return job

    @router.get(
        "/students/{student_id}/interactive-classrooms/{job_id}",
        response_model=InteractiveClassroomJob,
    )
    async def get_student_interactive_classroom(
        student_id: str,
        job_id: str,
    ) -> InteractiveClassroomJob:
        job = learning_store.get_job(student_id, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="interactive classroom job not found")
        if job.status in {"succeeded", "failed"}:
            return job
        try:
            openmaic_job = await classroom_client.get_classroom_job(job.openmaic_job_id)
        except Exception as exc:
            logger.warning("OpenMAIC job poll failed job_id=%s: %s", job_id, exc)
            return job.model_copy(update={"message": f"OpenMAIC polling failed: {exc}"})

        status, classroom_url = _map_openmaic_job(openmaic_job)
        updated = job.model_copy(
            update={
                "status": status,
                "classroom_url": classroom_url or job.classroom_url,
                "message": str(openmaic_job.get("message") or job.message),
                "updated_at": datetime.now(timezone.utc),
            }
        )
        learning_store.save_job(updated)
        return updated

    @router.get("/students/{student_id}/dashboard", response_model=StudentDashboard)
    async def get_student_dashboard(student_id: str) -> StudentDashboard:
        return learning_store.build_dashboard(student_id, package_store)

    @router.get("/digital-human/actions", response_model=list[DigitalHumanAction])
    async def digital_human_actions() -> list[DigitalHumanAction]:
        """Return the action contract a digital human may use to operate the app."""

        return list_digital_human_actions()

    @router.get("/digital-human/knowledge-shortcuts", response_model=list[KnowledgeShortcut])
    async def digital_human_knowledge_shortcuts() -> list[KnowledgeShortcut]:
        """Return the canonical knowledge shortcut list for digital human voice commands.

        Frontend fetches this list on startup instead of maintaining its own hardcoded copy,
        so adding a new knowledge item only requires a backend change.
        """
        return list_knowledge_shortcuts()

    # ──────────────────────── OpenMAIC 互动课堂导入 ────────────────────────

    @router.post(
        "/integrations/openmaic/resource-package",
        response_model=OpenMAICClassroomImportResponse,
    )
    async def import_openmaic_resource_package(
        payload: OpenMAICClassroomImportRequest,
    ) -> OpenMAICClassroomImportResponse:
        """Import OpenMAIC Stage/Scene output into EduResource resource objects."""

        return import_openmaic_classroom(payload, package_store)

    @router.get(
        "/resource-packages/{package_id}",
        response_model=OpenMAICClassroomImportResponse,
    )
    async def get_resource_package(package_id: str) -> OpenMAICClassroomImportResponse:
        imported = load_openmaic_import(package_id, package_store)
        if imported is None:
            raise HTTPException(status_code=404, detail="resource package not found")
        return imported

    @router.post(
        "/integrations/openmaic/exercise-attempts",
        response_model=OpenMAICExerciseAttemptsImportResponse,
    )
    async def import_openmaic_exercise_attempts(
        payload: OpenMAICExerciseAttemptsImportRequest,
    ) -> OpenMAICExerciseAttemptsImportResponse:
        """Import OpenMAIC quiz answers into ExerciseAttempt and EvaluationRecord."""

        try:
            response = import_openmaic_attempts(payload, package_store)
            package = package_store.get_package(payload.resource_package_id)
            if package is not None:
                learning_store.apply_evaluation(response.evaluation, package)
            return response
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get(
        "/resource-packages/{package_id}/attempts",
        response_model=OpenMAICAttemptsHistoryResponse,
    )
    async def get_resource_package_attempts(
        package_id: str,
        student_id: str,
    ) -> OpenMAICAttemptsHistoryResponse:
        return load_openmaic_attempts(package_id, student_id, package_store)

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

    def _save_outputs(task_id: str, outputs: GenerateOutputs, request: GenerateRequest) -> None:
        """序列化并持久化生成结果（缓存 + SQLite）。"""
        serialized = _serialize_outputs(outputs, request)
        _GENERATE_OUTPUT_CACHE[task_id] = serialized
        _GENERATE_STORE.save(task_id, serialized)

    def _save_serialized_outputs(task_id: str, outputs: dict) -> None:
        _GENERATE_OUTPUT_CACHE[task_id] = outputs
        _GENERATE_STORE.save(task_id, outputs)

    # ──────────────────────── 教师端独立业务边界 ────────────────────────

    @router.get("/teachers/{teacher_id}/dashboard", response_model=TeacherDashboard)
    async def teacher_dashboard(teacher_id: str, class_id: str | None = None) -> TeacherDashboard:
        try:
            return _TEACHER_STORE.get_dashboard(teacher_id, class_id)
        except (TeacherNotFoundError, ClassNotFoundError, StudentNotInClassError, TeacherJobNotFoundError) as exc:
            raise _teacher_store_http_error(exc) from exc

    @router.post(
        "/teachers/{teacher_id}/classes/{class_id}/teaching-packages",
        response_model=TeacherGenerationJob,
    )
    async def create_teacher_teaching_package(
        teacher_id: str,
        class_id: str,
        payload: TeacherTeachingPackageCreateRequest,
    ) -> TeacherGenerationJob:
        job_id = new_task_id("tjob")
        teaching_package_id = new_task_id("tpkg")
        generate_task_id = new_task_id("tgen")

        try:
            prior_profile = _TEACHER_STORE.get_prior_profile(
                teacher_id,
                class_id,
                payload.target_student_id,
                teaching_goal=payload.teaching_goal,
                target_knowledge_id=payload.target_knowledge_id,
            )
            job = _TEACHER_STORE.create_job(
                job_id=job_id,
                teacher_id=teacher_id,
                class_id=class_id,
                payload=payload,
                teaching_package_id=teaching_package_id,
                generate_task_id=generate_task_id,
            )
        except (TeacherNotFoundError, ClassNotFoundError, StudentNotInClassError, TeacherJobNotFoundError) as exc:
            raise _teacher_store_http_error(exc) from exc

        generate_payload = GenerateRequest(
            student_id=payload.target_student_id or f"{class_id}:class",
            knowledge_id=payload.target_knowledge_id,
            knowledge_name=payload.target_knowledge_name,
            conversation=[],
            prior_profile=prior_profile,
            selection_context=GenerateSelectionContext(
                source="teacher_console",
                reason=payload.teaching_goal,
                suggested_difficulty=payload.difficulty,
            ),
            exercise_count=payload.exercise_count,
            languages=payload.languages,
        )

        async def _run() -> None:
            try:
                outputs = await ctx.orchestrator.run_generate(generate_task_id, generate_payload)
                serialized = _serialize_outputs(outputs, generate_payload)
                _save_serialized_outputs(generate_task_id, serialized)
                _TEACHER_STORE.complete_job(
                    teacher_id=teacher_id,
                    class_id=class_id,
                    job_id=job_id,
                    results=serialized,
                )
            except Exception as exc:
                logger.exception("TeacherTeachingPackage 生成失败 job_id=%s", job_id)
                try:
                    _TEACHER_STORE.fail_job(
                        teacher_id=teacher_id,
                        class_id=class_id,
                        job_id=job_id,
                        message=f"教师教学包生成失败：{exc}",
                    )
                except Exception:
                    logger.exception("TeacherTeachingPackage 标记失败也失败 job_id=%s", job_id)
            finally:
                await ctx.event_bus.close_task(generate_task_id)

        asyncio.create_task(_run())
        return job

    @router.get(
        "/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{job_id}",
        response_model=TeacherGenerationJob,
    )
    async def get_teacher_teaching_package_job(
        teacher_id: str,
        class_id: str,
        job_id: str,
    ) -> TeacherGenerationJob:
        try:
            return _TEACHER_STORE.get_job(teacher_id, class_id, job_id)
        except (TeacherNotFoundError, ClassNotFoundError, StudentNotInClassError, TeacherJobNotFoundError) as exc:
            raise _teacher_store_http_error(exc) from exc

    @router.post("/generate", response_model=GenerateResponse)
    async def generate(payload: GenerateRequest) -> GenerateResponse:
        """固定 7 步流水线（GenerateFlow）。

        生成 agent 由 PlannerAgent 输出动态决定（Document/Exercise/Visual/Code 按需调用）。

        前端流程：
        1. POST 拿 task_id
        2. EventSource("/api/tasks/{task_id}/events") 订阅
        3. AgentTracePanel 一次订阅看到全部 Agent 行依次亮起
        4. 任务结束后调 /api/tasks/{task_id}/results 拿最终产物
        """
        task_id = new_task_id("gen")

        async def _run() -> None:
            try:
                outputs = await ctx.orchestrator.run_generate(task_id, payload)
                _save_outputs(task_id, outputs, payload)
            except Exception:
                logger.exception("GenerateFlow 失败 task_id=%s", task_id)
            finally:
                await ctx.event_bus.close_task(task_id)

        asyncio.create_task(_run())
        return GenerateResponse(task_id=task_id)

    @router.post("/generate/tool-calling", response_model=GenerateResponse)
    async def generate_tool_calling(payload: GenerateRequest) -> GenerateResponse:
        """MainAgent Supervisor 动态决策模式（ToolCallingFlow）。

        与 /api/generate 的区别：
        - /api/generate          固定流水线，快且稳定（推荐演示用）
        - /api/generate/tool-calling  LLM 每轮决定调哪些工具，支持并行多工具，
                                      适合展示 Agent 自主规划能力

        SSE 事件流中会额外出现 MainAgent 的 supervisor.start / supervisor.decision /
        supervisor.done 事件，可在前端 AgentTracePanel 展示调度器思考过程。

        前端流程与 /api/generate 完全一致，只需换端点即可。
        """
        task_id = new_task_id("tc")

        async def _run() -> None:
            try:
                outputs = await ctx.orchestrator.run_tool_calling(task_id, payload)
                _save_outputs(task_id, outputs, payload)
            except Exception:
                logger.exception("ToolCallingFlow 失败 task_id=%s", task_id)
            # run_tool_calling 内部已调 event_bus.close_task，此处不再重复

        asyncio.create_task(_run())
        return GenerateResponse(task_id=task_id)

    @router.get("/tasks/{task_id}/results")
    async def get_results(task_id: str) -> dict:
        """拿一次 GenerateFlow 完整产物 —— 给 ResultsPanel + RationalePanel 用。

        优先读启动时恢复/本轮写入的缓存；缓存没有时再查 SQLite。
        """
        if task_id in _GENERATE_OUTPUT_CACHE:
            return _GENERATE_OUTPUT_CACHE[task_id]
        stored = _GENERATE_STORE.get(task_id)
        if stored is None:
            raise HTTPException(status_code=404, detail="task results not ready")
        _GENERATE_OUTPUT_CACHE[task_id] = stored
        return stored

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


def _safe_id(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in value).strip("-") or "knowledge"


def _draft_interactive_package(
    *,
    package_id: str,
    student_id: str,
    target_knowledge_id: str,
    target_knowledge_name: str,
    learning_goal: str,
    job_id: str,
    selection_context: dict | None,
    profile,
    now: datetime,
) -> ResourcePackage:
    matched_profile: list[str] = []
    if selection_context:
        source = str(selection_context.get("source") or "").strip()
        reason = str(selection_context.get("reason") or "").strip()
        difficulty = selection_context.get("suggested_difficulty")
        if source:
            matched_profile.append(f"selection_source: {source}")
        if reason:
            matched_profile.append(f"selection_reason: {reason}")
        if difficulty:
            matched_profile.append(f"selection_suggested_difficulty: {difficulty}")
    if profile:
        if profile.learning_style:
            matched_profile.append(f"learning_style: {profile.learning_style}")
        if profile.learning_goal:
            matched_profile.append(f"profile_goal: {profile.learning_goal}")
    addressed_weakness = list((profile.mistake_points if profile else [])[:3])
    rationale = ResourceRationale(
        package_id=package_id,
        profile_snapshot_id=f"profile_{student_id}",
        target_knowledge_id=target_knowledge_id,
        matched_profile=matched_profile,
        addressed_weakness=addressed_weakness,
        difficulty_reason=(
            f"面向学习目标生成互动课堂：{learning_goal}"
            + (
                f"；推荐理由：{selection_context.get('reason')}"
                if selection_context and selection_context.get("reason")
                else ""
            )
        ),
        source_trace=[
            f"interactive_classroom_job:{job_id}",
            f"student:{student_id}",
            f"knowledge:{target_knowledge_id}",
            "openmaic",
        ],
        created_at=now,
    )
    placeholder = ResourceItem(
        id=f"{package_id}:classroom-placeholder",
        package_id=package_id,
        type="interactive",
        title=f"{target_knowledge_name}互动课堂生成中",
        content_json={"interactive_classroom_job_id": job_id, "status": "generating"},
        content_markdown=f"课堂正在由 OpenMAIC 生成。学习目标：{learning_goal}",
        source_type="agent",
        source_url="",
        created_by_agent="StudentInteractiveClassroomOrchestrator",
        created_at=now,
    )
    supplemental = build_supplemental_resources(
        knowledge_id=target_knowledge_id,
        knowledge_name=target_knowledge_name,
        student_id=student_id,
        weakness=[],
    )
    supplemental_items: list[ResourceItem] = []
    for index, video in enumerate(supplemental.get("videos", [])[:2], start=1):
        if not isinstance(video, dict):
            continue
        supplemental_items.append(
            ResourceItem(
                id=f"{package_id}:bilibili-video-{index}",
                package_id=package_id,
                type="external_video",
                title=str(video.get("title") or f"{target_knowledge_name} B站视频"),
                content_json=video,
                content_markdown=str(video.get("fit_reason") or ""),
                source_type="bilibili",
                source_url=str(video.get("url") or ""),
                created_by_agent="ResourceScoutAgent",
                created_at=now,
            )
        )
    for index, reading in enumerate(supplemental.get("readings", [])[:2], start=1):
        if not isinstance(reading, dict):
            continue
        supplemental_items.append(
            ResourceItem(
                id=f"{package_id}:reading-{index}",
                package_id=package_id,
                type="reading",
                title=str(reading.get("title") or f"{target_knowledge_name} 拓展资源"),
                content_json=reading,
                content_markdown=str(reading.get("fit_reason") or ""),
                source_type="external" if str(reading.get("url") or "").startswith("http") else "manual",
                source_url=str(reading.get("url") or ""),
                created_by_agent="ResourceScoutAgent",
                created_at=now,
            )
        )
    return ResourcePackage(
        id=package_id,
        owner_id=student_id,
        owner_role="student",
        package_type="student_learning",
        title=f"{target_knowledge_name}互动课堂",
        target_knowledge_id=target_knowledge_id,
        profile_snapshot_id=f"profile_{student_id}",
        status="in_progress",
        items=[placeholder, *supplemental_items],
        rationale=rationale,
        created_at=now,
        updated_at=now,
    )


def _map_openmaic_job(openmaic_job: dict) -> tuple[str, str | None]:
    raw_status = str(openmaic_job.get("status") or "running")
    if raw_status == "succeeded":
        result = openmaic_job.get("result") if isinstance(openmaic_job.get("result"), dict) else {}
        classroom_url = result.get("url") if isinstance(result, dict) else None
        return "succeeded", classroom_url
    if raw_status == "failed":
        return "failed", None
    if raw_status == "queued":
        return "queued", None
    return "running", None
