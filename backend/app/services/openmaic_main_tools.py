"""OpenMAIC tool wrappers used by MainAgent.

These helpers let the Supervisor treat the isolated OpenMAIC classroom subsystem
as ordinary tools: create classroom, poll classroom, import classroom payload,
import quiz attempts, and refresh the student dashboard.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from ..agents.generate_flow import GenerateOutputs, GenerateRequest
from ..core.config import Settings, get_settings
from ..schemas.openmaic import OpenMAICClassroomImportRequest, OpenMAICExerciseAttemptsImportRequest
from ..schemas.student import ResourceItem, ResourcePackage, ResourceRationale
from .openmaic_attempts import import_openmaic_attempts
from .openmaic_client import OpenMAICClient
from .openmaic_import import import_openmaic_classroom, load_openmaic_import
from .resource_package_store import SQLiteResourcePackageStore
from .student_learning_store import SQLiteStudentLearningStore
from .supplemental_resources import build_supplemental_resources


class OpenMAICMainTools:
    """Stateful tool facade for MainAgent's OpenMAIC operations."""

    def __init__(
        self,
        *,
        settings: Settings | None = None,
        package_store: SQLiteResourcePackageStore | None = None,
        learning_store: SQLiteStudentLearningStore | None = None,
        client: OpenMAICClient | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.package_store = package_store or SQLiteResourcePackageStore()
        self.learning_store = learning_store or SQLiteStudentLearningStore()
        self.client = client or OpenMAICClient(self.settings.openmaic_base_url)

    async def create_interactive_classroom(
        self,
        *,
        task_id: str,
        req: GenerateRequest,
        outputs: GenerateOutputs,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Create a student-owned OpenMAIC classroom job and local draft package."""

        args = args or {}
        now = datetime.now(timezone.utc)
        student_id = str(args.get("student_id") or req.student_id or "stu_001")
        knowledge_id = str(args.get("knowledge_id") or req.knowledge_id)
        knowledge_name = str(args.get("knowledge_name") or req.knowledge_name)
        difficulty = _safe_int(
            args.get("difficulty") or _selection_difficulty(req) or 3,
            default=3,
            low=1,
            high=5,
        )
        learning_goal = str(
            args.get("learning_goal")
            or _selection_reason(req)
            or f"理解并应用「{knowledge_name}」，完成课堂互动和测验反馈。"
        )
        job_id = f"ic_{uuid4().hex[:12]}"
        package_id = str(
            args.get("resource_package_id")
            or f"pkg_ic_{student_id}_{_safe_id(knowledge_id)}_{job_id}"
        )

        profile = self.learning_store.get_profile(student_id)
        package = _draft_interactive_package(
            package_id=package_id,
            student_id=student_id,
            target_knowledge_id=knowledge_id,
            target_knowledge_name=knowledge_name,
            learning_goal=learning_goal,
            job_id=job_id,
            selection_context=_selection_context_dict(req),
            profile=profile,
            now=now,
        )
        self.package_store.save(package)
        mastery_before = int((profile.knowledge_mastery if profile else {}).get(knowledge_id, 0))
        self.learning_store.upsert_classroom_step(
            student_id=student_id,
            target_knowledge_id=knowledge_id,
            title=f"{knowledge_name}互动课堂",
            package_id=package_id,
            mastery_before=mastery_before,
        )

        payload = {
            "requirement": f"为学生生成互动课堂：{knowledge_name}。学习目标：{learning_goal}。难度：{difficulty}/5。",
            "eduResourceContext": {
                "mode": "student",
                "studentId": student_id,
                "taskId": task_id,
                "resourcePackageId": package_id,
                "targetKnowledge": {"id": knowledge_id, "name": knowledge_name},
                "learningGoal": learning_goal,
                "difficulty": difficulty,
                "profileSnapshot": profile.model_dump(mode="json") if profile else {},
                "selectionContext": _selection_context_dict(req),
            },
        }
        openmaic_job = await self.client.start_classroom_generation(payload)
        openmaic_job_id = str(openmaic_job.get("jobId") or openmaic_job.get("job_id") or "")
        if not openmaic_job_id:
            raise RuntimeError("OpenMAIC did not return a job id")

        from ..schemas.student import InteractiveClassroomJob

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
        self.learning_store.save_job(job)
        _external(outputs)["openmaic_classroom"] = {
            "job_id": job_id,
            "openmaic_job_id": openmaic_job_id,
            "student_id": student_id,
            "resource_package_id": package_id,
            "status": "running",
            "package_url": job.package_url,
        }
        return _external(outputs)["openmaic_classroom"]

    async def poll_interactive_classroom(
        self,
        *,
        req: GenerateRequest,
        outputs: GenerateOutputs,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        args = args or {}
        external = _external(outputs).get("openmaic_classroom", {})
        student_id = str(args.get("student_id") or external.get("student_id") or req.student_id)
        job_id = str(args.get("job_id") or external.get("job_id") or "")
        if not job_id:
            raise ValueError("poll_openmaic_classroom requires job_id or a previous create_openmaic_classroom result")
        job = self.learning_store.get_job(student_id, job_id)
        if job is None:
            raise KeyError(f"interactive classroom job not found: {job_id}")
        if job.status not in {"succeeded", "failed"}:
            raw = await self.client.get_classroom_job(job.openmaic_job_id)
            status, classroom_url = _map_openmaic_job(raw)
            job = job.model_copy(
                update={
                    "status": status,
                    "classroom_url": classroom_url or job.classroom_url,
                    "message": str(raw.get("message") or job.message),
                    "updated_at": datetime.now(timezone.utc),
                }
            )
            self.learning_store.save_job(job)
        result = job.model_dump(mode="json")
        _external(outputs)["openmaic_classroom"] = {**external, **result}
        return result

    async def import_classroom_package(
        self,
        *,
        outputs: GenerateOutputs,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Import an OpenMAIC Stage/Scene payload into EduResource package store."""

        args = args or {}
        payload_data = args.get("payload") or args.get("openmaic_payload") or args
        payload = OpenMAICClassroomImportRequest.model_validate(payload_data)
        response = import_openmaic_classroom(payload, self.package_store)
        _external(outputs)["openmaic_import"] = response.model_dump(mode="json")
        return _external(outputs)["openmaic_import"]

    async def import_exercise_attempts(
        self,
        *,
        outputs: GenerateOutputs,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Import OpenMAIC quiz answers and apply evaluation to student memory."""

        args = args or {}
        payload = OpenMAICExerciseAttemptsImportRequest.model_validate(args)
        response = import_openmaic_attempts(payload, self.package_store)
        package = self.package_store.get_package(payload.resource_package_id)
        if package is not None:
            self.learning_store.apply_evaluation(response.evaluation, package)
        _external(outputs)["openmaic_attempts"] = response.model_dump(mode="json")
        return _external(outputs)["openmaic_attempts"]

    async def refresh_student_dashboard(
        self,
        *,
        req: GenerateRequest,
        outputs: GenerateOutputs,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        args = args or {}
        student_id = str(args.get("student_id") or req.student_id)
        dashboard = self.learning_store.build_dashboard(student_id, self.package_store)
        _external(outputs)["student_dashboard"] = dashboard.model_dump(mode="json")
        return _external(outputs)["student_dashboard"]

    async def load_resource_package(
        self,
        *,
        outputs: GenerateOutputs,
        args: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        args = args or {}
        package_id = str(args.get("resource_package_id") or _external(outputs).get("openmaic_classroom", {}).get("resource_package_id") or "")
        if not package_id:
            raise ValueError("load_openmaic_resource_package requires resource_package_id")
        response = load_openmaic_import(package_id, self.package_store)
        if response is None:
            raise KeyError(f"resource package not found: {package_id}")
        _external(outputs)["resource_package"] = response.model_dump(mode="json")
        return _external(outputs)["resource_package"]


def _external(outputs: GenerateOutputs) -> dict[str, Any]:
    value = getattr(outputs, "external", None)
    if not isinstance(value, dict):
        value = {}
        setattr(outputs, "external", value)
    return value


def _selection_context_dict(req: GenerateRequest) -> dict[str, Any]:
    if req.selection_context is None:
        return {}
    return req.selection_context.model_dump(mode="json")


def _selection_reason(req: GenerateRequest) -> str:
    if req.selection_context is None:
        return ""
    return req.selection_context.reason.strip()


def _selection_difficulty(req: GenerateRequest) -> int | None:
    if req.selection_context is None:
        return None
    return req.selection_context.suggested_difficulty


def _draft_interactive_package(
    *,
    package_id: str,
    student_id: str,
    target_knowledge_id: str,
    target_knowledge_name: str,
    learning_goal: str,
    job_id: str,
    selection_context: dict[str, Any] | None,
    profile: Any,
    now: datetime,
) -> ResourcePackage:
    matched_profile: list[str] = []
    if selection_context:
        for key in ("source", "reason", "suggested_difficulty"):
            value = selection_context.get(key)
            if value:
                matched_profile.append(f"selection_{key}: {value}")
    if profile:
        if getattr(profile, "learning_style", ""):
            matched_profile.append(f"learning_style: {profile.learning_style}")
        if getattr(profile, "learning_goal", ""):
            matched_profile.append(f"profile_goal: {profile.learning_goal}")
    addressed_weakness = list((getattr(profile, "mistake_points", []) or [])[:3])
    rationale = ResourceRationale(
        package_id=package_id,
        profile_snapshot_id=f"profile_{student_id}",
        target_knowledge_id=target_knowledge_id,
        matched_profile=matched_profile,
        addressed_weakness=addressed_weakness,
        difficulty_reason=f"MainAgent 调用 OpenMAIC 生成互动课堂：{learning_goal}",
        source_trace=[f"interactive_classroom_job:{job_id}", f"student:{student_id}", f"knowledge:{target_knowledge_id}", "main_agent", "openmaic"],
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
        created_by_agent="MainAgent.OpenMAIC",
        created_at=now,
    )
    supplemental = build_supplemental_resources(
        knowledge_id=target_knowledge_id,
        knowledge_name=target_knowledge_name,
        student_id=student_id,
        weakness=addressed_weakness,
    )
    supplemental_items: list[ResourceItem] = []
    for index, video in enumerate(supplemental.get("videos", [])[:2], start=1):
        if isinstance(video, dict):
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


def _map_openmaic_job(openmaic_job: dict[str, Any]) -> tuple[str, str | None]:
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


def _safe_id(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in value).strip("-") or "knowledge"


def _safe_int(value: Any, *, default: int, low: int, high: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(low, min(high, parsed))
