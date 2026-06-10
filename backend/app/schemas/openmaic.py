"""Schemas for importing OpenMAIC classroom output into EduResource-Agent."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from .student import ExerciseSet, ResourcePackage
from .student import EvaluationRecord, ExerciseAttempt

OpenMAICSceneType = Literal["slide", "quiz", "interactive", "pbl"]


class OpenMAICStageImport(BaseModel):
    id: str
    name: str
    description: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OpenMAICSceneImport(BaseModel):
    id: str
    type: OpenMAICSceneType
    title: str
    order: int
    content: dict[str, Any] = Field(default_factory=dict)


class OpenMAICClassroomImportRequest(BaseModel):
    source_classroom_id: str
    resource_package_id: str
    student_id: str | None = None
    teacher_id: str | None = None
    class_id: str | None = None
    target_knowledge_id: str
    target_knowledge_name: str
    profile_snapshot_id: str | None = None
    difficulty: int = Field(default=2, ge=1, le=5)
    stage: OpenMAICStageImport
    scenes: list[OpenMAICSceneImport] = Field(default_factory=list)
    profile_snapshot: dict[str, Any] = Field(default_factory=dict)
    class_profile_snapshot: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _require_owner(self) -> "OpenMAICClassroomImportRequest":
        if not (self.student_id or self.teacher_id or self.class_id):
            raise ValueError("one of student_id, teacher_id, or class_id is required")
        return self


class OpenMAICClassroomImportResponse(BaseModel):
    package: ResourcePackage
    exercise_set: ExerciseSet | None = None
    imported_scene_count: int
    imported_quiz_count: int


class OpenMAICQuizAnswerImport(BaseModel):
    question_id: str
    user_answer: str | list[str]
    time_spent_sec: int = Field(default=60, ge=0)

    @field_validator("user_answer")
    @classmethod
    def answer_must_not_be_blank(cls, value: str | list[str]) -> str | list[str]:
        if isinstance(value, str):
            if not value.strip():
                raise ValueError("user_answer must not be blank")
            return value
        if not any(str(item).strip() for item in value):
            raise ValueError("user_answer must not be blank")
        return value


class OpenMAICExerciseAttemptsImportRequest(BaseModel):
    resource_package_id: str
    student_id: str
    source_classroom_id: str
    quiz_scene_id: str
    answers: list[OpenMAICQuizAnswerImport] = Field(min_length=1)


class OpenMAICExerciseAttemptsImportResponse(BaseModel):
    attempts: list[ExerciseAttempt]
    evaluation: EvaluationRecord


class OpenMAICAttemptsHistoryResponse(BaseModel):
    attempts: list[ExerciseAttempt]
    evaluations: list[EvaluationRecord]
