"""MainAgent-owned business routes.

These routes sit in front of legacy routes and make MainAgent the public
entrypoint for combined flows, while keeping older endpoint shapes compatible.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..agents.base import new_task_id
from ..agents.generate_flow import GenerateOutputs, GenerateRequest, GenerateSelectionContext
from ..core.context import AppContext
from ..schemas.student import InteractiveClassroomCreateRequest, InteractiveClassroomJob
from ..schemas.teacher import TeacherGenerationJob, TeacherTeachingPackageCreateRequest
from ..services.generate_store import SQLiteGenerateStore
from ..services.student_learning_store import SQLiteStudentLearningStore
from ..services.supplemental_resources import build_supplemental_resources
from ..services.teacher_store import (
    ClassNotFoundError,
    SQLiteTeacherStore,
    StudentNotInClassError,
    TeacherJobNotFoundError,
    TeacherNotFoundError,
)

logger = logging.getLogger(__name__)

_GENERATE_STORE = SQLiteGenerateStore()
_RESULT_CACHE: dict[str, dict[str, Any]] = _GENERATE_STORE.load_all()
_LEARNING_STORE = SQLiteStudentLearningStore()
_TEACHER_STORE = SQLiteTeacherStore()
SelectionSource = Literal["manual", "exploration", "coach", "digital_human", "teacher_console"]


class GenerateResponse(BaseModel):
    task_id: str


def build_main_agent_business_router(ctx: AppContext) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.post(
        "/students/{student_id}/interactive-classrooms",
        response_model=InteractiveClassroomJob,
    )
    async def create_student_interactive_classroom_via_main_agent(
        student_id: str,
        payload: InteractiveClassroomCreateRequest,
    ) -> InteractiveClassroomJob:
        """Compatibility endpoint: student classroom creation now enters MainAgent."""

        task_id = new_task_id("mac")
        generate_request = _classroom_payload_to_generate_request(student_id, payload)
        try:
            outputs = await ctx.orchestrator.run_tool_calling(task_id, generate_request, max_tool_calls=6)
            _save_outputs(task_id, outputs, generate_request)
        except Exception as exc:
            logger.exception("MainAgent classroom creation failed task_id=%s", task_id)
            raise HTTPException(status_code=502, detail=f"MainAgent classroom creation failed: {exc}") from exc

        external = _external(outputs)
        classroom = external.get("openmaic_classroom") if isinstance(external.get("openmaic_classroom"), dict) else {}
        job_id = str(classroom.get("job_id") or "")
        if not job_id:
            raise HTTPException(
                status_code=502,
                detail={
                    "message": "MainAgent did not create an OpenMAIC classroom job",
                    "task_id": task_id,
                    "errors": outputs.errors,
                    "external": external,
                },
            )
        job = _LEARNING_STORE.get_job(student_id, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"classroom job not found after MainAgent run: {job_id}")
        return job

    @router.post(
        "/teachers/{teacher_id}/classes/{class_id}/teaching-packages",
        response_model=TeacherGenerationJob,
    )
    async def create_teacher_teaching_package_via_main_agent(
        teacher_id: str,
        class_id: str,
        payload: TeacherTeachingPackageCreateRequest,
    ) -> TeacherGenerationJob:
        """Compatibility endpoint: teacher package generation now enters MainAgent."""

        job_id = new_task_id("tjob")
        teaching_package_id = new_task_id("tpkg")
        generate_task_id = new_task_id("tmag")
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
                outputs = await ctx.orchestrator.run_tool_calling(generate_task_id, generate_payload, max_tool_calls=8)
                serialized = _serialize_outputs(outputs, generate_payload)
                _save_serialized_outputs(generate_task_id, serialized)
                _TEACHER_STORE.complete_job(
                    teacher_id=teacher_id,
                    class_id=class_id,
                    job_id=job_id,
                    results=serialized,
                )
            except Exception as exc:
                logger.exception("MainAgent teacher package failed job_id=%s", job_id)
                try:
                    _TEACHER_STORE.fail_job(
                        teacher_id=teacher_id,
                        class_id=class_id,
                        job_id=job_id,
                        message=f"MainAgent 教师教学包生成失败：{exc}",
                    )
                except Exception:
                    logger.exception("Teacher package fail_job also failed job_id=%s", job_id)

        asyncio.create_task(_run())
        return job

    @router.post("/generate/tool-calling", response_model=GenerateResponse)
    async def generate_tool_calling_external_aware(payload: GenerateRequest) -> GenerateResponse:
        """Compatibility endpoint for /api/generate/tool-calling with external-aware storage."""

        task_id = new_task_id("tc")

        async def _run() -> None:
            try:
                outputs = await ctx.orchestrator.run_tool_calling(task_id, payload)
                _save_outputs(task_id, outputs, payload)
            except Exception:
                logger.exception("MainAgent tool-calling failed task_id=%s", task_id)

        asyncio.create_task(_run())
        return GenerateResponse(task_id=task_id)

    @router.post("/main-agent/generate", response_model=GenerateResponse)
    async def main_agent_generate(payload: GenerateRequest) -> GenerateResponse:
        """Explicit MainAgent generate endpoint with external-aware result storage."""

        task_id = new_task_id("mag")
        try:
            outputs = await ctx.orchestrator.run_tool_calling(task_id, payload)
            _save_outputs(task_id, outputs, payload)
        except Exception as exc:
            logger.exception("MainAgent generate failed task_id=%s", task_id)
            raise HTTPException(status_code=502, detail=f"MainAgent generate failed: {exc}") from exc
        return GenerateResponse(task_id=task_id)

    @router.get("/tasks/{task_id}/results")
    async def get_results_external_aware(task_id: str) -> dict[str, Any]:
        """Compatibility task result endpoint that preserves MainAgent external data."""

        return _load_results(task_id)

    @router.get("/main-agent/tasks/{task_id}/results")
    async def get_main_agent_results(task_id: str) -> dict[str, Any]:
        return _load_results(task_id)

    return router


def _classroom_payload_to_generate_request(student_id: str, payload: InteractiveClassroomCreateRequest) -> GenerateRequest:
    context = payload.selection_context or {}
    source = _normalize_source(str(context.get("source") or "exploration"))
    reason = str(context.get("reason") or payload.learning_goal or "创建 OpenMAIC 互动课堂")
    difficulty = payload.difficulty
    return GenerateRequest(
        student_id=student_id,
        knowledge_id=payload.target_knowledge_id,
        knowledge_name=payload.target_knowledge_name,
        conversation=[],
        prior_profile=None,
        selection_context=GenerateSelectionContext(
            source=source,
            reason=reason,
            suggested_difficulty=difficulty,
        ),
        exercise_count=5,
        languages=["python", "java"],
    )


def _normalize_source(value: str) -> SelectionSource:
    allowed: set[str] = {"manual", "exploration", "coach", "digital_human", "teacher_console"}
    return value if value in allowed else "exploration"  # type: ignore[return-value]


def _teacher_store_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, StudentNotInClassError):
        return HTTPException(status_code=403, detail=str(exc))
    if isinstance(exc, (TeacherNotFoundError, ClassNotFoundError, TeacherJobNotFoundError)):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


def _save_outputs(task_id: str, outputs: GenerateOutputs, request: GenerateRequest) -> None:
    serialized = _serialize_outputs(outputs, request)
    _save_serialized_outputs(task_id, serialized)


def _save_serialized_outputs(task_id: str, outputs: dict[str, Any]) -> None:
    _RESULT_CACHE[task_id] = outputs
    _GENERATE_STORE.save(task_id, outputs)


def _load_results(task_id: str) -> dict[str, Any]:
    if task_id in _RESULT_CACHE:
        return _RESULT_CACHE[task_id]
    stored = _GENERATE_STORE.get(task_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="task results not ready")
    _RESULT_CACHE[task_id] = stored
    return stored


def _serialize_outputs(outputs: GenerateOutputs, request: GenerateRequest | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "profile": outputs.profile.model_dump() if outputs.profile else None,
        "plan": outputs.plan.model_dump() if outputs.plan else None,
        "document": outputs.document.model_dump() if outputs.document else None,
        "exercise": outputs.exercise.model_dump() if outputs.exercise else None,
        "visual": outputs.visual.model_dump() if outputs.visual else None,
        "code": outputs.code.model_dump() if outputs.code else None,
        "evaluation": outputs.evaluation.model_dump() if outputs.evaluation else None,
        "external": _external(outputs),
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


def _external(outputs: GenerateOutputs) -> dict[str, Any]:
    value = getattr(outputs, "external", None)
    return value if isinstance(value, dict) else {}
