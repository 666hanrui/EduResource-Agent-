"""Student-side business schemas.

The student side is a persistent learning-loop system, not a transient chat UI.
Every core object has a stable id and is saved through SQLite.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

OwnerRole = Literal["student", "teacher", "class"]
PackageType = Literal["student_learning", "teacher_teaching"]
PackageStatus = Literal["draft", "ready", "in_progress", "evaluated", "archived"]
InteractiveClassroomStatus = Literal["queued", "running", "succeeded", "failed"]
ResourceItemType = Literal[
    "document",
    "visual",
    "animation",
    "code",
    "exercise",
    "external_video",
    "reading",
    "rationale",
    "interactive",
    "pbl",
]
SourceType = Literal["agent", "bilibili", "external", "manual"]
PathStepStatus = Literal["pending", "in_progress", "done", "adjusted"]
ReportType = Literal["student_growth"]
StageValidationType = Literal["short_answer", "single_choice", "artifact", "reflection"]
TrainingStageStatus = Literal["recommended", "in_progress", "completed", "needs_review"]


class StudentProfileExtractRequest(BaseModel):
    student_id: str = "stu_001"
    major: str = "计算机科学与技术"
    grade: str = "大一"
    foundation_level: str = "beginner"
    interests: list[str] = Field(default_factory=list)
    learning_goal: str = "建立数据结构基础并完成可展示项目"
    learning_style: str = "图解 + 代码案例"
    resource_preference: list[str] = Field(default_factory=lambda: ["讲解文档", "代码案例", "B站视频"])
    weekly_hours: int = Field(default=6, ge=1, le=80)

    @field_validator("interests", "resource_preference")
    @classmethod
    def _normalize_list(cls, value: list[str]) -> list[str]:
        return _clean_list(value)


class StudentProfilePatchRequest(BaseModel):
    professional_background: str | None = None
    knowledge_mastery: dict[str, int] | None = None
    learning_goal: str | None = None
    learning_style: str | None = None
    mistake_points: list[str] | None = None
    resource_preference: list[str] | None = None
    learning_pace: str | None = None
    current_progress: dict[str, Any] | None = None
    note: str = "手动修改学生画像"

    @field_validator("mistake_points", "resource_preference")
    @classmethod
    def _normalize_optional_list(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return _clean_list(value)


class StudentProfile(BaseModel):
    student_id: str
    professional_background: str
    knowledge_mastery: dict[str, int] = Field(default_factory=dict)
    learning_goal: str
    learning_style: str
    mistake_points: list[str] = Field(default_factory=list)
    resource_preference: list[str] = Field(default_factory=list)
    learning_pace: str
    current_progress: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class StudentProfileHistory(BaseModel):
    history_id: str
    student_id: str
    source_type: Literal["extract", "manual", "evaluation", "exploration"]
    source_id: str | None = None
    before_json: dict[str, Any] = Field(default_factory=dict)
    after_json: dict[str, Any] = Field(default_factory=dict)
    delta_json: dict[str, Any] = Field(default_factory=dict)
    note: str = ""
    created_at: datetime


class StudentExplorationRequest(StudentProfileExtractRequest):
    target_outcome: str = "形成一条可执行学习路径"


class ExplorationDirection(BaseModel):
    id: str
    session_id: str
    title: str
    reason: str
    ability_requirements: list[str] = Field(default_factory=list)
    knowledge_path: list[str] = Field(default_factory=list)
    gap_analysis: list[str] = Field(default_factory=list)
    resource_entry_knowledge: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime


class ExplorationSession(BaseModel):
    session_id: str
    student_id: str
    major: str
    grade: str
    foundation_level: str
    interests: list[str]
    learning_goal: str
    weekly_hours: int
    summary: str
    recommended_directions: list[ExplorationDirection] = Field(default_factory=list)
    created_profile_id: str
    created_path_id: str
    created_at: datetime


class LearningPathStep(BaseModel):
    step_id: str
    path_id: str
    order_index: int
    title: str
    target_knowledge_id: str
    status: PathStepStatus = "pending"
    package_id: str | None = None
    evaluation_id: str | None = None
    evidence: str = ""
    mastery_before: int = 0
    mastery_after: int = 0
    updated_reason: str = ""
    created_at: datetime
    updated_at: datetime


class LearningPath(BaseModel):
    path_id: str
    student_id: str
    source_exploration_session_id: str | None = None
    title: str
    steps: list[LearningPathStep] = Field(default_factory=list)
    adjustment_history: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ExternalVideoResource(BaseModel):
    url: str
    title: str
    up_name: str
    duration: str
    tags: list[str] = Field(default_factory=list)
    fit_reason: str


class ResourceRationale(BaseModel):
    package_id: str
    profile_snapshot_id: str
    target_knowledge_id: str
    matched_profile: list[str] = Field(default_factory=list)
    addressed_weakness: list[str] = Field(default_factory=list)
    difficulty_reason: str
    source_trace: list[str] = Field(default_factory=list)
    created_at: datetime


class ResourceItem(BaseModel):
    id: str
    package_id: str
    type: ResourceItemType
    title: str
    content_json: dict[str, Any] = Field(default_factory=dict)
    content_markdown: str = ""
    source_type: SourceType = "agent"
    source_url: str = ""
    created_by_agent: str
    created_at: datetime


class ResourcePackage(BaseModel):
    id: str
    owner_id: str
    owner_role: OwnerRole = "student"
    package_type: PackageType = "student_learning"
    title: str
    target_knowledge_id: str
    profile_snapshot_id: str
    status: PackageStatus = "ready"
    items: list[ResourceItem] = Field(default_factory=list)
    rationale: ResourceRationale
    created_at: datetime
    updated_at: datetime


class ResourcePackageCreateRequest(BaseModel):
    student_id: str = "stu_001"
    target_knowledge_id: str
    target_knowledge_name: str
    exploration_session_id: str | None = None
    difficulty: int = Field(default=2, ge=1, le=5)


class InteractiveClassroomCreateRequest(BaseModel):
    student_id: str | None = None
    target_knowledge_id: str
    target_knowledge_name: str
    learning_goal: str = ""
    selection_context: dict[str, Any] = Field(default_factory=dict)
    difficulty: int = Field(default=3, ge=1, le=5)


class InteractiveClassroomJob(BaseModel):
    job_id: str
    student_id: str
    resource_package_id: str
    openmaic_job_id: str
    status: InteractiveClassroomStatus = "queued"
    classroom_url: str | None = None
    package_url: str
    message: str = ""
    created_at: datetime
    updated_at: datetime


class ExerciseItem(BaseModel):
    id: str
    exercise_set_id: str
    package_id: str
    stem: str
    options: list[str] = Field(default_factory=list)
    answer: str
    explanation: str
    tags: list[str] = Field(default_factory=list)
    difficulty: int = Field(default=2, ge=1, le=5)
    created_at: datetime


class ExerciseSet(BaseModel):
    id: str
    student_id: str
    package_id: str
    target_knowledge_id: str
    items: list[ExerciseItem] = Field(default_factory=list)
    created_at: datetime


class ExerciseAttemptCreateRequest(BaseModel):
    student_id: str
    exercise_item_id: str
    user_answer: str
    time_spent_sec: int = Field(default=60, ge=0)


class ExerciseAttempt(BaseModel):
    id: str
    student_id: str
    exercise_item_id: str
    package_id: str
    user_answer: str
    is_correct: bool
    time_spent_sec: int
    submitted_at: datetime


class EvaluationCreateRequest(BaseModel):
    student_id: str
    package_id: str
    attempt_ids: list[str]


class EvaluationRecord(BaseModel):
    id: str
    student_id: str
    package_id: str
    attempt_ids_json: list[str] = Field(default_factory=list)
    mastery_delta_json: dict[str, Any] = Field(default_factory=dict)
    weakness_delta_json: dict[str, Any] = Field(default_factory=dict)
    feedback_markdown: str
    created_at: datetime


class ReportCreateRequest(BaseModel):
    student_id: str
    report_type: ReportType = "student_growth"


class Report(BaseModel):
    id: str
    student_id: str
    report_type: ReportType = "student_growth"
    title: str
    content_markdown: str
    source_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class StageValidationQuestion(BaseModel):
    question_id: str
    prompt: str
    answer_format: StageValidationType = "short_answer"
    success_criteria: str
    target_knowledge_id: str
    target_knowledge_name: str
    suggested_difficulty: int = Field(default=2, ge=1, le=5)


class TrainingStage(BaseModel):
    stage_id: str
    key: Literal["foundation", "practice", "advancement"]
    title: str
    horizon: str
    goal: str
    summary: str
    status: TrainingStageStatus = "recommended"
    focus_knowledge_ids: list[str] = Field(default_factory=list)
    linked_step_ids: list[str] = Field(default_factory=list)
    evidence_targets: list[str] = Field(default_factory=list)
    validation_question: StageValidationQuestion
    next_action: str = ""


class PersonalizedTrainingPlan(BaseModel):
    plan_id: str
    student_id: str
    title: str
    summary: str
    stages: list[TrainingStage] = Field(default_factory=list)
    updated_at: datetime


class StudentDashboard(BaseModel):
    profile: StudentProfile | None = None
    learning_path: LearningPath | None = None
    training_plan: PersonalizedTrainingPlan | None = None
    recent_packages: list[ResourcePackage] = Field(default_factory=list)
    recent_evaluations: list[EvaluationRecord] = Field(default_factory=list)
    next_suggestions: list[str] = Field(default_factory=list)


def _clean_list(value: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result[:12]
