"""Teacher-side tools used by MainAgent."""

from __future__ import annotations

from typing import Any

from ..agents.generate_flow import GenerateOutputs, GenerateRequest
from .ppt_master_service import (
    PPTMasterExportError,
    build_teacher_lesson_markdown,
    build_teacher_pptx,
)
from .teacher_store import SQLiteTeacherStore


class TeacherMainTools:
    """Tool facade for teacher package lifecycle inside MainAgent."""

    def __init__(self, teacher_store: SQLiteTeacherStore | None = None) -> None:
        self.teacher_store = teacher_store or SQLiteTeacherStore()

    async def create_teacher_package(
        self,
        *,
        req: GenerateRequest,
        outputs: GenerateOutputs,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Mark an existing teacher generation job as completed from MainAgent outputs."""

        args = args or {}
        teacher_id = _required(args, "teacher_id")
        class_id = _required(args, "class_id")
        job_id = _required(args, "job_id")
        results = _serialize_outputs(outputs, req)
        job = self.teacher_store.complete_job(
            teacher_id=teacher_id,
            class_id=class_id,
            job_id=job_id,
            results=results,
        )
        _external(outputs)["teacher_package"] = {
            "job_id": job.job_id,
            "teacher_id": job.teacher_id,
            "class_id": job.class_id,
            "teaching_package_id": job.teaching_package_id,
            "generate_task_id": job.generate_task_id,
            "status": job.status,
            "message": job.message,
        }
        return _external(outputs)["teacher_package"]

    async def export_teacher_pptx(
        self,
        *,
        outputs: GenerateOutputs,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Export a teacher package deck or markdown fallback.

        The file download endpoint can still serve the produced path; this tool
        makes the export step visible to MainAgent.
        """

        args = args or {}
        teacher_id = _required(args, "teacher_id")
        class_id = _required(args, "class_id")
        package_id = _required(args, "teaching_package_id")
        package = self.teacher_store.get_package(teacher_id, class_id, package_id)
        try:
            export = build_teacher_pptx(
                package_id=package.id,
                title=package.title,
                target_knowledge_name=package.target_knowledge_name,
                teaching_goal=package.teaching_goal,
                target_student_id=package.target_student_id,
                results=package.results,
            )
            kind = "pptx"
        except PPTMasterExportError:
            export = build_teacher_lesson_markdown(
                package_id=package.id,
                title=package.title,
                target_knowledge_name=package.target_knowledge_name,
                teaching_goal=package.teaching_goal,
                target_student_id=package.target_student_id,
                results=package.results,
            )
            kind = "markdown"
        _external(outputs)["teacher_ppt_export"] = {
            "package_id": package.id,
            "kind": kind,
            "filename": export.filename,
            "path": str(export.path),
        }
        return _external(outputs)["teacher_ppt_export"]


def _serialize_outputs(outputs: GenerateOutputs, req: GenerateRequest) -> dict[str, Any]:
    return {
        "profile": outputs.profile.model_dump() if outputs.profile else None,
        "plan": outputs.plan.model_dump() if outputs.plan else None,
        "document": outputs.document.model_dump() if outputs.document else None,
        "exercise": outputs.exercise.model_dump() if outputs.exercise else None,
        "visual": outputs.visual.model_dump() if outputs.visual else None,
        "code": outputs.code.model_dump() if outputs.code else None,
        "evaluation": outputs.evaluation.model_dump() if outputs.evaluation else None,
        "external": _external(outputs),
        "errors": outputs.errors,
        "request": {
            "student_id": req.student_id,
            "knowledge_id": req.knowledge_id,
            "knowledge_name": req.knowledge_name,
        },
    }


def _external(outputs: GenerateOutputs) -> dict[str, Any]:
    value = getattr(outputs, "external", None)
    if not isinstance(value, dict):
        value = {}
        setattr(outputs, "external", value)
    return value


def _required(args: dict[str, Any], key: str) -> str:
    value = args.get(key)
    if value is None or str(value).strip() == "":
        raise ValueError(f"teacher tool requires args.{key}")
    return str(value)
