"""Map OpenMAIC classroom output into EduResource resource package objects."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..schemas.openmaic import OpenMAICClassroomImportRequest, OpenMAICClassroomImportResponse
from ..schemas.student import (
    ExerciseItem,
    ExerciseSet,
    OwnerRole,
    PackageType,
    ResourceItem,
    ResourceItemType,
    ResourcePackage,
    ResourceRationale,
)
from .resource_package_store import SQLiteResourcePackageStore


def import_openmaic_classroom(
    payload: OpenMAICClassroomImportRequest,
    store: SQLiteResourcePackageStore,
) -> OpenMAICClassroomImportResponse:
    now = datetime.now(timezone.utc)
    existing_package = store.get_package(payload.resource_package_id)
    owner_id, owner_role = _resolve_owner(payload)
    package_type: PackageType = "teacher_teaching" if owner_role in {"teacher", "class"} else "student_learning"
    exercise_set = _build_exercise_set(payload, now)

    imported_items = [
        _build_resource_item(
            payload=payload,
            scene=scene.model_dump(mode="json"),
            item_type=_scene_item_type(scene.type),
            exercise_set_id=exercise_set.id if scene.type == "quiz" and exercise_set else None,
            now=now,
        )
        for scene in payload.scenes
    ]
    items = _merge_package_items(existing_package, imported_items)

    package = ResourcePackage(
        id=payload.resource_package_id,
        owner_id=owner_id,
        owner_role=owner_role,
        package_type=package_type,
        title=payload.stage.name,
        target_knowledge_id=payload.target_knowledge_id,
        profile_snapshot_id=payload.profile_snapshot_id or payload.source_classroom_id,
        status="ready",
        items=items,
        rationale=ResourceRationale(
            package_id=payload.resource_package_id,
            profile_snapshot_id=payload.profile_snapshot_id or payload.source_classroom_id,
            target_knowledge_id=payload.target_knowledge_id,
            matched_profile=_merge_unique(
                (existing_package.rationale.matched_profile if existing_package else []),
                _profile_hints(payload),
            ),
            addressed_weakness=_merge_unique(
                (existing_package.rationale.addressed_weakness if existing_package else []),
                _weakness_hints(payload),
            ),
            difficulty_reason=_difficulty_reason(payload, existing_package),
            source_trace=_merge_unique(
                (existing_package.rationale.source_trace if existing_package else []),
                [payload.source_classroom_id, payload.stage.id, *[scene.id for scene in payload.scenes]],
            ),
            created_at=now,
        ),
        created_at=now,
        updated_at=now,
    )

    store.save(package, exercise_set)
    return OpenMAICClassroomImportResponse(
        package=package,
        exercise_set=exercise_set,
        imported_scene_count=len(payload.scenes),
        imported_quiz_count=len([scene for scene in payload.scenes if scene.type == "quiz"]),
    )


def load_openmaic_import(
    package_id: str,
    store: SQLiteResourcePackageStore,
) -> OpenMAICClassroomImportResponse | None:
    package = store.get_package(package_id)
    if package is None:
        return None
    exercise_set = store.get_exercise_set_by_package(package_id)
    return OpenMAICClassroomImportResponse(
        package=package,
        exercise_set=exercise_set,
        imported_scene_count=len(
            [item for item in package.items if item.content_json.get("openmaic_scene_id")]
        ),
        imported_quiz_count=len(
            [
                item
                for item in package.items
                if item.type == "exercise" and item.content_json.get("openmaic_scene_id")
            ]
        ),
    )


def _resolve_owner(payload: OpenMAICClassroomImportRequest) -> tuple[str, OwnerRole]:
    if payload.student_id:
        return payload.student_id, "student"
    if payload.teacher_id:
        return payload.teacher_id, "teacher"
    return payload.class_id or "class_unknown", "class"


def _scene_item_type(scene_type: str) -> ResourceItemType:
    return {
        "slide": "visual",
        "quiz": "exercise",
        "interactive": "interactive",
        "pbl": "pbl",
    }[scene_type]


def _build_resource_item(
    *,
    payload: OpenMAICClassroomImportRequest,
    scene: dict[str, Any],
    item_type: ResourceItemType,
    exercise_set_id: str | None,
    now: datetime,
) -> ResourceItem:
    scene_id = str(scene["id"])
    content_json = {
        "openmaic_stage_id": payload.stage.id,
        "openmaic_scene_id": scene_id,
        "scene_type": scene["type"],
        "scene": scene,
    }
    if exercise_set_id:
        content_json["exercise_set_id"] = exercise_set_id

    return ResourceItem(
        id=f"{payload.resource_package_id}:{scene_id}",
        package_id=payload.resource_package_id,
        type=item_type,
        title=str(scene["title"]),
        content_json=content_json,
        content_markdown=_scene_markdown(scene),
        source_type="agent",
        source_url="",
        created_by_agent="OpenMAIC",
        created_at=now,
    )


def _build_exercise_set(
    payload: OpenMAICClassroomImportRequest,
    now: datetime,
) -> ExerciseSet | None:
    questions: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for scene in payload.scenes:
        if scene.type != "quiz":
            continue
        for question in scene.content.get("questions", []):
            questions.append((scene.model_dump(mode="json"), question))

    if not questions:
        return None

    exercise_set_id = f"exset_{payload.resource_package_id}"
    owner_id, _owner_role = _resolve_owner(payload)
    items = [
        ExerciseItem(
            id=f"{exercise_set_id}:{scene['id']}:{question.get('id', index + 1)}",
            exercise_set_id=exercise_set_id,
            package_id=payload.resource_package_id,
            stem=str(question.get("question", "")),
            options=[_format_option(option) for option in question.get("options", [])],
            answer=_format_answer(question.get("answer")),
            explanation=str(question.get("analysis", "")),
            tags=[payload.target_knowledge_id, payload.target_knowledge_name, "阶段验证"],
            difficulty=payload.difficulty,
            created_at=now,
        )
        for index, (scene, question) in enumerate(questions)
    ]

    return ExerciseSet(
        id=exercise_set_id,
        student_id=payload.student_id or owner_id,
        package_id=payload.resource_package_id,
        target_knowledge_id=payload.target_knowledge_id,
        items=items,
        created_at=now,
    )


def _format_option(option: Any) -> str:
    if isinstance(option, dict):
        label = str(option.get("label", "")).strip()
        value = str(option.get("value", "")).strip()
        return f"{label}. {value}" if label and value else label or value
    return str(option)


def _format_answer(answer: Any) -> str:
    if isinstance(answer, list):
        return ",".join(str(item) for item in answer)
    if answer is None:
        return ""
    return str(answer)


def _profile_hints(payload: OpenMAICClassroomImportRequest) -> list[str]:
    hints: list[str] = []
    selection_context = payload.profile_snapshot.get("selection_context")
    if isinstance(selection_context, dict):
        source = selection_context.get("source")
        reason = selection_context.get("reason")
        suggested_difficulty = selection_context.get("suggested_difficulty")
        if source:
            hints.append(f"selection_source: {source}")
        if reason:
            hints.append(f"selection_reason: {reason}")
        if suggested_difficulty:
            hints.append(f"selection_suggested_difficulty: {suggested_difficulty}")
    for key in ("foundation_level", "learning_style", "learning_goal"):
        value = payload.profile_snapshot.get(key)
        if value:
            hints.append(f"{key}: {value}")
    current_step = payload.profile_snapshot.get("current_path_step")
    if isinstance(current_step, dict):
        title = current_step.get("title")
        status = current_step.get("status")
        if title:
            hints.append(f"path_step: {title}")
        if status:
            hints.append(f"path_step_status: {status}")
    for key in ("pace", "common_weakness"):
        value = payload.class_profile_snapshot.get(key)
        if value:
            hints.append(f"{key}: {value}")
    return hints


def _weakness_hints(payload: OpenMAICClassroomImportRequest) -> list[str]:
    weakness: list[str] = []
    for item in payload.profile_snapshot.get("mistake_points", []):
        text = str(item).strip()
        if text:
            weakness.append(text)
    common = payload.class_profile_snapshot.get("common_weakness")
    if isinstance(common, list):
        for item in common:
            text = str(item).strip()
            if text:
                weakness.append(text)
    elif common:
        weakness.append(str(common).strip())
    return _merge_unique([], weakness)[:4]


def _difficulty_reason(
    payload: OpenMAICClassroomImportRequest,
    existing_package: ResourcePackage | None,
) -> str:
    existing_reason = existing_package.rationale.difficulty_reason if existing_package else ""
    selection_reason = ""
    selection_context = payload.profile_snapshot.get("selection_context")
    if isinstance(selection_context, dict):
        selection_reason = str(selection_context.get("reason") or "").strip()
    parts = [
        existing_reason.strip(),
        f"OpenMAIC classroom import uses requested difficulty {payload.difficulty}.",
        f"阶段目标：{payload.stage.name}",
        f"推荐依据：{selection_reason}" if selection_reason else "",
    ]
    return " ".join(part for part in parts if part)


def _merge_package_items(
    existing_package: ResourcePackage | None,
    imported_items: list[ResourceItem],
) -> list[ResourceItem]:
    imported_ids = {item.id for item in imported_items}
    retained: list[ResourceItem] = []
    if existing_package is not None:
        for item in existing_package.items:
            if item.id in imported_ids:
                continue
            if item.id.endswith(":classroom-placeholder"):
                continue
            if item.content_json.get("openmaic_scene_id"):
                continue
            retained.append(item)
    return [*retained, *imported_items]


def _merge_unique(existing: list[str], new_items: list[str]) -> list[str]:
    result: list[str] = []
    for item in [*existing, *new_items]:
        text = str(item).strip()
        if text and text not in result:
            result.append(text)
    return result


def _scene_markdown(scene: dict[str, Any]) -> str:
    return f"## {scene['title']}\n\nOpenMAIC scene type: {scene['type']}"
