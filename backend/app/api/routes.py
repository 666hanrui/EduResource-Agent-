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
from fastapi.responses import FileResponse, Response, StreamingResponse
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
from ..services.openmaic_client import (
    OpenMAICClient,
    build_mock_openmaic_classroom_import,
    openmaic_fallback_enabled,
)
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
from ..services.industry_data import build_teacher_industry_summary
from ..services.ppt_master_service import PPTMasterExportError, build_teacher_pptx

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
            if not openmaic_fallback_enabled():
                raise HTTPException(status_code=502, detail=f"OpenMAIC generation failed: {exc}") from exc

            fallback_classroom_id = f"fallback_{job_id}"
            fallback_payload = build_mock_openmaic_classroom_import(
                source_classroom_id=fallback_classroom_id,
                resource_package_id=package_id,
                student_id=student_id,
                target_knowledge_id=payload.target_knowledge_id,
                target_knowledge_name=payload.target_knowledge_name,
                learning_goal=learning_goal,
                difficulty=payload.difficulty,
                profile_snapshot=profile_snapshot,
            )
            import_openmaic_classroom(fallback_payload, package_store)
            fallback_job = InteractiveClassroomJob(
                job_id=job_id,
                student_id=student_id,
                resource_package_id=package_id,
                openmaic_job_id=fallback_classroom_id,
                status="succeeded",
                classroom_url=f"/api/resource-packages/{package_id}",
                package_url=f"/api/resource-packages/{package_id}",
                message=f"OpenMAIC unavailable; local fallback classroom generated for {payload.target_knowledge_name}.",
                created_at=now,
                updated_at=datetime.now(timezone.utc),
            )
            learning_store.save_job(fallback_job)
            return fallback_job

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
