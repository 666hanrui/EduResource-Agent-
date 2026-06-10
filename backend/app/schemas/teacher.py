"""Teacher-side business schemas.

The teacher side owns classroom context, class snapshots, teaching packages,
and review queues. It may reuse generation agents, but it must not write
teacher goals into student memory.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


TeacherJobStatus = Literal["queued", "running", "succeeded", "failed"]
TeacherPackageStatus = Literal["draft", "generating", "ready", "failed", "archived"]
TeacherReviewStatus = Literal["pending", "ready", "approved", "rejected"]
StudentRisk = Literal["high", "medium", "low"]


class TeacherContext(BaseModel):
    teacher_id: str
    display_name: str
    subject: str
    teaching_style: list[str] = Field(default_factory=list)
    resource_preferences: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ClassProfile(BaseModel):
    class_id: str
    teacher_id: str
    name: str
    students: int
    risk: int
    progress: int = Field(ge=0, le=100)
    status: str
    mastery_trend: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class TeacherStudentSnapshot(BaseModel):
    id: str
    class_id: str
    focus: str
    mastery: int = Field(ge=0, le=100)
    risk: StudentRisk
    evidence: str
    action: str
    knowledge_id: str
    knowledge_name: str
    profile_json: dict[str, Any] = Field(default_factory=dict)
    updated_at: datetime


class TeacherTeachingPackageCreateRequest(BaseModel):
    target_knowledge_id: str
    target_knowledge_name: str
    teaching_goal: str
    target_student_id: str | None = None
    difficulty: int = Field(default=3, ge=1, le=5)
    exercise_count: int = Field(default=5, ge=1, le=10)
    languages: list[str] = Field(default_factory=lambda: ["python", "java"])


class TeacherReviewItem(BaseModel):
    id: str
    package_id: str
    teacher_id: str
    class_id: str
    title: str
    type: str
    student: str | None = None
    status: TeacherReviewStatus = "pending"
    agent: str
    reason: str
    rationale: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class TeacherTeachingPackage(BaseModel):
    id: str
    teacher_id: str
    class_id: str
    target_student_id: str | None = None
    title: str
    target_knowledge_id: str
    target_knowledge_name: str
    teaching_goal: str
    status: TeacherPackageStatus = "generating"
    results: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class TeacherGenerationJob(BaseModel):
    job_id: str
    teacher_id: str
    class_id: str
    target_student_id: str | None = None
    teaching_package_id: str
    generate_task_id: str
    status: TeacherJobStatus
    message: str
    results: dict[str, Any] | None = None
    review_items: list[TeacherReviewItem] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class TeacherDashboard(BaseModel):
    teacher_context: TeacherContext
    classes: list[ClassProfile] = Field(default_factory=list)
    active_class: ClassProfile
    attention_queue: list[TeacherStudentSnapshot] = Field(default_factory=list)
    recent_packages: list[TeacherTeachingPackage] = Field(default_factory=list)
    review_items: list[TeacherReviewItem] = Field(default_factory=list)
