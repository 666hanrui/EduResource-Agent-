"""专业探索模块 Schema。

该模块从 feature-agentic 的 12 维画像思想改造而来，但入口从“上传简历”
调整为“专业、年级、基础水平和兴趣反馈”。
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


ExplorationLevel = Literal["beginner", "basic", "intermediate"]
ExplorationPhase = Literal["short_term", "mid_term", "long_term"]
ResourceStatus = Literal["recommended", "opened", "completed"]
CoachTone = Literal["encourage", "diagnose", "challenge"]
ReportExportFormat = Literal["markdown", "html"]

PROFILE_DIMENSION_KEYS = [
    "professional_skills",
    "professional_background",
    "education_requirement",
    "teamwork",
    "stress_adaptability",
    "communication",
    "work_experience",
    "documentation_awareness",
    "responsibility",
    "learning_ability",
    "problem_solving",
    "other_special",
]


class ExplorationRequest(BaseModel):
    """专业探索入口请求。"""

    student_id: str = Field(default="stu_001")
    major: str = Field(min_length=1)
    grade: str = Field(default="大一")
    education_level: str = Field(default="本科")
    foundation_level: ExplorationLevel = Field(default="beginner")
    interests: list[str] = Field(default_factory=list)
    weekly_hours: int = Field(default=6, ge=1, le=60)

    @field_validator("interests")
    @classmethod
    def _normalize_interests(cls, value: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for item in value:
            text = str(item).strip()
            if not text or text in seen:
                continue
            seen.add(text)
            result.append(text)
        return result[:8]


class DimensionProfile(BaseModel):
    """保留 feature-agentic 的 12 维 key，便于后续迁移匹配与路径能力。"""

    professional_skills: list[str] = Field(default_factory=list)
    professional_background: list[str] = Field(default_factory=list)
    education_requirement: list[str] = Field(default_factory=list)
    teamwork: list[str] = Field(default_factory=list)
    stress_adaptability: list[str] = Field(default_factory=list)
    communication: list[str] = Field(default_factory=list)
    work_experience: list[str] = Field(default_factory=list)
    documentation_awareness: list[str] = Field(default_factory=list)
    responsibility: list[str] = Field(default_factory=list)
    learning_ability: list[str] = Field(default_factory=list)
    problem_solving: list[str] = Field(default_factory=list)
    other_special: list[str] = Field(default_factory=list)


class DimensionScore(BaseModel):
    key: str
    title: str
    group: str
    score: int = Field(ge=0, le=100)
    evidence: list[str] = Field(default_factory=list)
    next_probe: str = Field(default="")


class KnowledgeNode(BaseModel):
    id: str
    title: str
    category: Literal["foundation", "core", "direction", "practice"]
    difficulty: int = Field(default=1, ge=1, le=5)
    why: str
    prerequisites: list[str] = Field(default_factory=list)


class ExplorationTask(BaseModel):
    id: str
    title: str
    task_type: Literal["read", "quiz", "mini_project", "reflection"]
    related_knowledge_ids: list[str] = Field(default_factory=list)
    expected_minutes: int = Field(default=30, ge=5)
    evidence_to_collect: str


class CareerRequirementProfile(BaseModel):
    core_skills: list[str] = Field(default_factory=list)
    typical_tasks: list[str] = Field(default_factory=list)
    dimension_weights: dict[str, int] = Field(default_factory=dict)
    evidence_suggestions: list[str] = Field(default_factory=list)


class CareerDirection(BaseModel):
    id: str
    title: str
    exploration_domain: str = ""
    fit_score: int = Field(ge=0, le=100)
    why_explore: list[str] = Field(default_factory=list)
    required_dimensions: list[str] = Field(default_factory=list)
    first_probe_task_id: str
    related_knowledge_ids: list[str] = Field(default_factory=list)
    requirement_profile: CareerRequirementProfile = Field(default_factory=CareerRequirementProfile)


class LearningPathItem(BaseModel):
    phase: ExplorationPhase
    label: str
    horizon: str
    goal: str
    focus_knowledge_ids: list[str] = Field(default_factory=list)
    tasks: list[str] = Field(default_factory=list)
    deliverables: list[str] = Field(default_factory=list)


class RecommendedKnowledge(BaseModel):
    knowledge_id: str
    knowledge_name: str
    reason: str
    suggested_difficulty: int = Field(default=2, ge=1, le=5)


class ExplorationPlan(BaseModel):
    student_id: str
    major: str
    summary: str
    profile: DimensionProfile
    dimension_scores: list[DimensionScore]
    knowledge_map: list[KnowledgeNode]
    exploration_tasks: list[ExplorationTask]
    career_directions: list[CareerDirection]
    learning_path: list[LearningPathItem]
    recommended_knowledge: list[RecommendedKnowledge]


class FavoriteDirectionRequest(BaseModel):
    student_id: str = Field(default="stu_001")
    plan: ExplorationPlan
    direction_id: str


class FavoriteDirection(BaseModel):
    favorite_id: str
    student_id: str
    direction: CareerDirection
    plan_summary: str
    created_at: datetime


class WorkspaceCreateRequest(BaseModel):
    student_id: str = Field(default="stu_001")
    plan: ExplorationPlan
    direction_id: str


class WorkspaceTask(BaseModel):
    id: str
    title: str
    phase: ExplorationPhase
    task_type: str
    status: Literal["pending", "done"] = "pending"
    expected_minutes: int = Field(default=30, ge=5)
    evidence_to_collect: str
    note: str = ""
    completed_at: datetime | None = None


class WorkspacePhase(BaseModel):
    phase: ExplorationPhase
    label: str
    horizon: str
    goal: str
    progress_percent: int = Field(default=0, ge=0, le=100)
    tasks: list[WorkspaceTask] = Field(default_factory=list)
    deliverables: list[str] = Field(default_factory=list)


class WorkspaceReview(BaseModel):
    review_id: str
    review_type: Literal["weekly", "monthly"]
    phase: ExplorationPhase
    summary: str
    next_actions: list[str] = Field(default_factory=list)
    created_at: datetime


class WorkspaceResource(BaseModel):
    resource_id: str
    knowledge_id: str
    title: str
    resource_type: Literal["search", "article", "video", "course"] = "search"
    source_key: str = "bilibili"
    source_name: str = "Bilibili"
    logo_hint: str = "B"
    quality_score: int = Field(default=70, ge=0, le=100)
    url: str
    reason: str
    status: ResourceStatus = "recommended"
    opened_at: datetime | None = None
    completed_at: datetime | None = None


class ProfileVersion(BaseModel):
    version_id: str
    changed_dimension: str
    previous_values: list[str] = Field(default_factory=list)
    next_values: list[str] = Field(default_factory=list)
    note: str = ""
    created_at: datetime


class ExplorationWorkspace(BaseModel):
    workspace_id: str
    favorite: FavoriteDirection
    profile: DimensionProfile
    dimension_scores: list[DimensionScore] = Field(default_factory=list)
    profile_versions: list[ProfileVersion] = Field(default_factory=list)
    resources: list[WorkspaceResource] = Field(default_factory=list)
    phases: list[WorkspacePhase]
    reviews: list[WorkspaceReview] = Field(default_factory=list)
    report_markdown: str = ""
    report_updated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class TaskUpdateRequest(BaseModel):
    status: Literal["pending", "done"]
    note: str = ""


class ReviewCreateRequest(BaseModel):
    review_type: Literal["weekly", "monthly"] = "weekly"
    phase: ExplorationPhase
    summary: str = Field(min_length=1)


class ProfileUpdateRequest(BaseModel):
    dimension_key: str
    values: list[str] = Field(default_factory=list)
    note: str = ""

    @field_validator("dimension_key")
    @classmethod
    def _known_dimension(cls, value: str) -> str:
        if value not in PROFILE_DIMENSION_KEYS:
            raise ValueError(f"unknown dimension: {value}")
        return value

    @field_validator("values")
    @classmethod
    def _normalize_values(cls, value: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for item in value:
            text = str(item).strip()
            if not text or text in seen:
                continue
            seen.add(text)
            result.append(text)
        return result[:12]


class ResourceStatusUpdateRequest(BaseModel):
    status: ResourceStatus


class CoachRequest(BaseModel):
    question: str = Field(default="")
    tone: CoachTone = "encourage"


class CoachSuggestion(BaseModel):
    title: str
    reason: str
    action: str
    evidence_to_collect: str
    related_ids: list[str] = Field(default_factory=list)


class CoachResponse(BaseModel):
    workspace_id: str
    direction_title: str
    tone: CoachTone
    summary: str
    suggestions: list[CoachSuggestion]
    follow_up_questions: list[str] = Field(default_factory=list)
    generated_at: datetime


class GrowthReportUpdateRequest(BaseModel):
    markdown: str = Field(min_length=1)


class GrowthReport(BaseModel):
    workspace_id: str
    title: str
    markdown: str
    is_customized: bool = False
    updated_at: datetime | None = None
    generated_at: datetime


class GrowthReportExport(BaseModel):
    filename: str
    media_type: str
    content: str
