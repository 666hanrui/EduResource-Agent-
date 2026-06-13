"""Student business API extensions.

These routes fill the student-side business-loop gaps while keeping the existing
OpenMAIC classroom routes untouched:

- profile read/update/history
- persisted exploration sessions
- learning path read/step update
- student growth reports

The router also exposes a compatibility implementation of POST /api/exploration/plan.
When mounted before the legacy router, the old frontend call keeps returning an
ExplorationPlan but now also writes profile/path/session data to storage.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..core.context import AppContext
from ..schemas.exploration import ExplorationPlan, ExplorationRequest
from ..schemas.student import (
    ExplorationSession,
    LearningPath,
    PathStepStatus,
    Report,
    ReportCreateRequest,
    StudentProfile,
    StudentProfileHistory,
    StudentProfilePatchRequest,
)
from ..services.major_exploration import build_major_exploration_plan
from ..services.resource_package_store import SQLiteResourcePackageStore
from ..services.student_business import (
    SQLiteStudentBusinessStore,
    build_and_save_student_report,
    list_profile_history,
    patch_student_profile,
    persist_exploration_plan,
    update_learning_path_step,
)
from ..services.student_learning_store import SQLiteStudentLearningStore


class StudentExplorationSessionResponse(BaseModel):
    """Return both the persisted session and raw plan for frontend transition."""

    session: ExplorationSession
    plan: ExplorationPlan


class LearningPathStepPatchRequest(BaseModel):
    status: PathStepStatus | None = None
    package_id: str | None = None
    evaluation_id: str | None = None
    evidence: str | None = None
    mastery_after: int | None = Field(default=None, ge=0, le=100)
    updated_reason: str | None = None


class StudentBusinessHealth(BaseModel):
    status: Literal["ok"] = "ok"
    routes: list[str]


def build_student_business_router(
    ctx: AppContext,
    *,
    resource_package_store: SQLiteResourcePackageStore | None = None,
    student_learning_store: SQLiteStudentLearningStore | None = None,
    student_business_store: SQLiteStudentBusinessStore | None = None,
) -> APIRouter:
    """Build extra student business routes under the existing /api namespace."""

    router = APIRouter(prefix="/api")
    learning_store = student_learning_store or SQLiteStudentLearningStore()
    package_store = resource_package_store or SQLiteResourcePackageStore()
    business_store = student_business_store or SQLiteStudentBusinessStore()

    @router.get("/students/business/health", response_model=StudentBusinessHealth)
    async def student_business_health() -> StudentBusinessHealth:
        return StudentBusinessHealth(
            routes=[
                "POST /exploration/plan",
                "GET /students/{student_id}/profile",
                "PATCH /students/{student_id}/profile",
                "GET /students/{student_id}/profile/history",
                "POST /students/{student_id}/exploration-sessions",
                "GET /students/{student_id}/exploration-sessions/{session_id}",
                "GET /students/{student_id}/learning-path",
                "PATCH /students/{student_id}/learning-path/steps/{step_id}",
                "POST /students/{student_id}/reports",
                "GET /students/{student_id}/reports/{report_id}",
            ]
        )

    @router.post("/exploration/plan", response_model=ExplorationPlan)
    async def build_and_persist_legacy_exploration_plan(payload: ExplorationRequest) -> ExplorationPlan:
        """Compatibility endpoint for the existing frontend.

        The old endpoint only returned an ExplorationPlan. This version keeps that
        response shape but also persists the exploration output into student
        profile, profile history, learning path, and ExplorationSession.
        """

        plan = build_major_exploration_plan(payload)
        persist_exploration_plan(
            payload=payload,
            plan=plan,
            learning_store=learning_store,
            business_store=business_store,
        )
        return plan

    @router.get("/students/{student_id}/profile", response_model=StudentProfile)
    async def get_student_profile(student_id: str) -> StudentProfile:
        return learning_store.get_profile(student_id) or learning_store.default_profile(student_id)

    @router.patch("/students/{student_id}/profile", response_model=StudentProfile)
    async def patch_profile(student_id: str, payload: StudentProfilePatchRequest) -> StudentProfile:
        return patch_student_profile(
            learning_store,
            student_id,
            payload.model_dump(exclude_unset=True),
            note=payload.note,
        )

    @router.get("/students/{student_id}/profile/history", response_model=list[StudentProfileHistory])
    async def get_profile_history(student_id: str, limit: int = 50) -> list[StudentProfileHistory]:
        return list_profile_history(learning_store, student_id, limit=max(1, min(limit, 200)))

    @router.post(
        "/students/{student_id}/exploration-sessions",
        response_model=StudentExplorationSessionResponse,
    )
    async def create_student_exploration_session(
        student_id: str,
        payload: ExplorationRequest,
    ) -> StudentExplorationSessionResponse:
        normalized = payload.model_copy(update={"student_id": student_id})
        plan = build_major_exploration_plan(normalized)
        session = persist_exploration_plan(
            payload=normalized,
            plan=plan,
            learning_store=learning_store,
            business_store=business_store,
        )
        return StudentExplorationSessionResponse(session=session, plan=plan)

    @router.get(
        "/students/{student_id}/exploration-sessions/{session_id}",
        response_model=ExplorationSession,
    )
    async def get_student_exploration_session(student_id: str, session_id: str) -> ExplorationSession:
        session = business_store.get_exploration_session(student_id, session_id)
        if session is None:
            raise HTTPException(status_code=404, detail="exploration session not found")
        return session

    @router.get("/students/{student_id}/learning-path", response_model=LearningPath)
    async def get_student_learning_path(student_id: str) -> LearningPath:
        return learning_store.get_or_create_learning_path(student_id)

    @router.patch(
        "/students/{student_id}/learning-path/steps/{step_id}",
        response_model=LearningPath,
    )
    async def patch_learning_path_step(
        student_id: str,
        step_id: str,
        payload: LearningPathStepPatchRequest,
    ) -> LearningPath:
        try:
            return update_learning_path_step(
                learning_store,
                student_id,
                step_id,
                payload.model_dump(exclude_unset=True),
            )
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/students/{student_id}/reports", response_model=Report)
    async def create_student_report(student_id: str, payload: ReportCreateRequest) -> Report:
        return build_and_save_student_report(
            student_id=student_id,
            report_type=payload.report_type,
            learning_store=learning_store,
            package_store=package_store,
            business_store=business_store,
        )

    @router.get("/students/{student_id}/reports/{report_id}", response_model=Report)
    async def get_student_report(student_id: str, report_id: str) -> Report:
        report = business_store.get_report(student_id, report_id)
        if report is None:
            raise HTTPException(status_code=404, detail="report not found")
        return report

    return router
