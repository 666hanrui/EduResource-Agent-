"""Persist OpenMAIC quiz answers as EduResource exercise attempts."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from ..schemas.openmaic import (
    OpenMAICAttemptsHistoryResponse,
    OpenMAICExerciseAttemptsImportRequest,
    OpenMAICExerciseAttemptsImportResponse,
)
from ..schemas.student import EvaluationRecord, ExerciseAttempt, ExerciseItem, ResourcePackage
from .resource_package_store import SQLiteResourcePackageStore


def import_openmaic_attempts(
    payload: OpenMAICExerciseAttemptsImportRequest,
    store: SQLiteResourcePackageStore,
) -> OpenMAICExerciseAttemptsImportResponse:
    exercise_set = store.get_exercise_set_by_package(payload.resource_package_id)
    if exercise_set is None:
        raise KeyError(f"exercise set not found for package: {payload.resource_package_id}")
    package = store.get_package(payload.resource_package_id)
    if package is None:
        raise KeyError(f"resource package not found: {payload.resource_package_id}")

    _validate_attempt_scope(payload, package)

    now = datetime.now(timezone.utc)
    attempts: list[ExerciseAttempt] = []
    item_by_question_id = {
        _question_id_from_item(item): item
        for item in exercise_set.items
        if _scene_id_from_item(item) == payload.quiz_scene_id
    }

    for answer in payload.answers:
        item = item_by_question_id.get(answer.question_id)
        if item is None:
            raise KeyError(
                f"exercise item not found for scene={payload.quiz_scene_id} question={answer.question_id}"
            )
        user_answer = _format_answer(answer.user_answer)
        attempts.append(
            ExerciseAttempt(
                id=f"attempt_{uuid4().hex}",
                student_id=payload.student_id,
                exercise_item_id=item.id,
                package_id=payload.resource_package_id,
                user_answer=user_answer,
                is_correct=_normalized_answer(user_answer) == _normalized_answer(item.answer),
                time_spent_sec=answer.time_spent_sec,
                submitted_at=now,
            )
        )

    evaluation = _build_evaluation(payload, attempts, item_by_question_id, package, now)
    store.save_attempts_and_evaluation(attempts, evaluation)
    return OpenMAICExerciseAttemptsImportResponse(attempts=attempts, evaluation=evaluation)


def load_openmaic_attempts(
    package_id: str,
    student_id: str | None,
    store: SQLiteResourcePackageStore,
) -> OpenMAICAttemptsHistoryResponse:
    return OpenMAICAttemptsHistoryResponse(
        attempts=store.list_attempts(package_id, student_id),
        evaluations=store.list_evaluations(package_id, student_id),
    )


def _build_evaluation(
    payload: OpenMAICExerciseAttemptsImportRequest,
    attempts: list[ExerciseAttempt],
    item_by_question_id: dict[str, ExerciseItem],
    package: ResourcePackage,
    now: datetime,
) -> EvaluationRecord:
    correct_count = sum(1 for attempt in attempts if attempt.is_correct)
    total_count = len(attempts)
    correct_rate = round(correct_count / total_count, 3) if total_count else 0.0
    wrong_item_ids = [attempt.exercise_item_id for attempt in attempts if not attempt.is_correct]
    wrong_concepts = _wrong_concepts(attempts, item_by_question_id)
    target_knowledge_id = _target_knowledge_id(item_by_question_id)
    target_knowledge_name = _target_knowledge_name(item_by_question_id, package)
    next_difficulty = _next_difficulty_recommendation(correct_rate)
    next_focus = _next_focus(
        target_knowledge_id=target_knowledge_id,
        target_knowledge_name=target_knowledge_name,
        wrong_concepts=wrong_concepts,
        correct_rate=correct_rate,
    )
    tags = [item for item in [target_knowledge_id, target_knowledge_name, "stage_validation"] if item]

    return EvaluationRecord(
        id=f"eval_{uuid4().hex}",
        student_id=payload.student_id,
        package_id=payload.resource_package_id,
        attempt_ids_json=[attempt.id for attempt in attempts],
        mastery_delta_json={
            "knowledge_id": target_knowledge_id,
            "knowledge_name": target_knowledge_name,
            "observed_correct_rate": correct_rate,
            "estimated_mastery": correct_rate,
            "new_weakness": wrong_concepts,
            "resolved_weakness": [],
            "next_difficulty_recommendation": next_difficulty,
            "next_focus": next_focus,
            "tags": tags,
            "fit_reason": (
                f"OpenMAIC 阶段验证题回写：{target_knowledge_name or target_knowledge_id or '当前知识点'} "
                f"答对 {correct_count}/{total_count}。"
            ),
            "stage_validation": {
                "mode": "openmaic_quiz",
                "source_classroom_id": payload.source_classroom_id,
                "quiz_scene_id": payload.quiz_scene_id,
                "question_count": total_count,
                "package_title": package.title,
            },
            "openmaic_summary": {
                "correct_count": correct_count,
                "total_count": total_count,
                "correct_rate": correct_rate,
            },
        },
        weakness_delta_json={
            "wrong_exercise_item_ids": wrong_item_ids,
            "wrong_concepts": wrong_concepts,
        },
        feedback_markdown=(
            f"OpenMAIC 阶段验证回流：{target_knowledge_name or target_knowledge_id or '当前知识点'} "
            f"答对 {correct_count}/{total_count}，正确率 {correct_rate:.0%}。"
        ),
        created_at=now,
    )


def _validate_attempt_scope(
    payload: OpenMAICExerciseAttemptsImportRequest,
    package: ResourcePackage,
) -> None:
    if package.owner_role != "student":
        raise PermissionError("quiz attempt writeback requires a student-owned resource package")
    if package.owner_id != payload.student_id:
        raise PermissionError("student does not own resource package")

    stage_ids = {
        item.content_json.get("openmaic_stage_id")
        for item in package.items
        if isinstance(item.content_json.get("openmaic_stage_id"), str)
    }
    if stage_ids and payload.source_classroom_id not in stage_ids:
        raise ValueError("source classroom does not match resource package")


def _target_knowledge_id(item_by_question_id: dict[str, ExerciseItem]) -> str:
    for item in item_by_question_id.values():
        if item.tags:
            return item.tags[0]
    return ""


def _target_knowledge_name(
    item_by_question_id: dict[str, ExerciseItem],
    package: ResourcePackage,
) -> str:
    for item in item_by_question_id.values():
        if len(item.tags) >= 2 and item.tags[1] and item.tags[1] != item.tags[0]:
            return item.tags[1]
    if package.title.endswith("互动课堂"):
        return package.title[:-4]
    return package.target_knowledge_id


def _wrong_concepts(
    attempts: list[ExerciseAttempt],
    item_by_question_id: dict[str, ExerciseItem],
) -> list[str]:
    item_by_id = {item.id: item for item in item_by_question_id.values()}
    result: list[str] = []
    for attempt in attempts:
        if attempt.is_correct:
            continue
        item = item_by_id.get(attempt.exercise_item_id)
        if not item:
            continue
        prompt = _compact_prompt(item.stem)
        if prompt and prompt not in result:
            result.append(prompt)
    return result[:3]


def _next_difficulty_recommendation(correct_rate: float) -> int:
    if correct_rate >= 0.85:
        return 4
    if correct_rate >= 0.6:
        return 3
    return 2


def _next_focus(
    *,
    target_knowledge_id: str,
    target_knowledge_name: str,
    wrong_concepts: list[str],
    correct_rate: float,
) -> str:
    label = target_knowledge_name or target_knowledge_id or "本阶段知识点"
    if wrong_concepts:
        return f"继续回到「{label}」的阶段验证，优先复盘：{'；'.join(wrong_concepts[:2])}。"
    if correct_rate >= 0.85:
        return f"「{label}」当前阶段验证已稳定，可以进入更高阶应用。"
    return f"继续巩固「{label}」，再完成一轮阶段验证题确认掌握度。"


def _question_id_from_item(item: ExerciseItem) -> str:
    return item.id.rsplit(":", 1)[-1]


def _scene_id_from_item(item: ExerciseItem) -> str:
    parts = item.id.split(":")
    return parts[-2] if len(parts) >= 3 else ""


def _format_answer(value: Any) -> str:
    if isinstance(value, list):
        return ",".join(str(item) for item in value)
    return str(value)


def _normalized_answer(value: str) -> str:
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if len(parts) > 1:
        return ",".join(sorted(parts))
    return value.strip()


def _compact_prompt(value: str) -> str:
    text = " ".join(value.split()).strip()
    if len(text) <= 28:
        return text
    return f"{text[:28]}..."
