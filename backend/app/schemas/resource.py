"""
PlannerAgent / DocumentAgent / ExerciseAgent / CodeAgent / VisualAgent / EvaluationAgent
共享的资源生产相关 Schema。

按 docs/05-agent-prompts.md 的输出契约定义。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from .profile import EvaluationDelta, Rationale  # 资源 Agent 共用的溯源结构

AgentName = Literal[
    "DocumentAgent",
    "ExerciseAgent",
    "CodeAgent",
    "VisualAgent",
]


class KnowledgeBreakdown(BaseModel):
    """知识点解构 —— 跨模态一致性的锚点。

    DocumentAgent / ExerciseAgent / CodeAgent / VisualAgent 共享同一份。
    """

    concept: str = Field(default="unknown")
    key_points: list[str] = Field(default_factory=list)
    common_pitfalls: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)


class ResourceTaskParams(BaseModel):
    """单个生成任务的参数。"""

    difficulty: int = Field(default=3, ge=1, le=5)
    focus: str = Field(default="")
    style_hint: str = Field(default="")
    reason: str = Field(default="")


class ResourceTask(BaseModel):
    """PlannerAgent 派发的单个生成任务。"""

    task_id: str
    agent: AgentName
    depends_on: list[str] = Field(default_factory=list)
    params: ResourceTaskParams = Field(default_factory=ResourceTaskParams)


class PlannerOutput(BaseModel):
    """PlannerAgent 输出契约。"""

    knowledge_breakdown: KnowledgeBreakdown
    tasks: list[ResourceTask]

    @field_validator("tasks")
    @classmethod
    def _ensure_unique_task_ids(cls, v: list[ResourceTask]) -> list[ResourceTask]:
        ids = [t.task_id for t in v]
        if len(ids) != len(set(ids)):
            raise ValueError("Planner 输出包含重复的 task_id")
        return v


# ──────────────────────────────── Document ────────────────────────────────


class DocumentDiagram(BaseModel):
    type: Literal["step_diagram", "concept_map", "comparison_table"]
    data: dict | list


class DocumentSection(BaseModel):
    heading: str
    body_md: str


class DocumentBody(BaseModel):
    title: str = Field(default="未命名文档")
    sections: list[DocumentSection] = Field(default_factory=list)
    key_diagrams: list[DocumentDiagram] = Field(default_factory=list)


class DocumentResult(BaseModel):
    document: DocumentBody
    rationale: Rationale


# ──────────────────────────────── Exercise ────────────────────────────────


class Question(BaseModel):
    qid: str
    type: Literal["single_choice", "multi_choice", "fill_blank", "code"]
    stem: str
    options: list[str] = Field(default_factory=list)
    answer: str
    explanation: str = Field(default="")
    tags: list[str] = Field(default_factory=list)
    difficulty: int = Field(default=3, ge=1, le=5)
    expected_time_sec: int = Field(default=60, ge=5)


class ExerciseResult(BaseModel):
    questions: list[Question]
    rationale: Rationale


# ──────────────────────────────── Code ────────────────────────────────


class StepComment(BaseModel):
    line_range: tuple[int, int]
    explanation: str


class CodeComplexity(BaseModel):
    time: str = "unknown"
    space: str = "unknown"


class CodeTraceStep(BaseModel):
    step: int
    state: str


class CodeSample(BaseModel):
    lang: Literal["python", "java"]
    filename: str
    code: str
    step_comments: list[StepComment] = Field(default_factory=list)
    complexity: CodeComplexity = Field(default_factory=CodeComplexity)
    trace: list[CodeTraceStep] = Field(default_factory=list)


class CodeResult(BaseModel):
    code_samples: list[CodeSample]
    rationale: Rationale


# ──────────────────────────────── Visual ────────────────────────────────


class AnimationStep(BaseModel):
    action: str
    target: str = ""
    narration: str = ""
    duration_ms: int = Field(default=800, ge=100)
    links_to_doc_section: str = ""


class Animation(BaseModel):
    scene: str
    initial_state: dict | list = Field(default_factory=dict)
    steps: list[AnimationStep] = Field(default_factory=list)


class VisualResult(BaseModel):
    mindmap_md: str
    animation: Animation
    rationale: Rationale


# ──────────────────────────────── Evaluation ────────────────────────────────


class EvaluationEvidence(BaseModel):
    """答题分析中的单条证据，用于解释 evaluation_delta 是怎么得来的。"""

    qid: str
    verdict: str = Field(default="")
    weight: float = Field(default=0.5, ge=0.0, le=1.0)


class EvaluationRationale(BaseModel):
    """EvaluationAgent 自己的溯源结构（与生成 Agent 的 Rationale 不同）。"""

    evidence: list[EvaluationEvidence] = Field(default_factory=list)
    agent_name: str = Field(default="EvaluationAgent")
    prompt_version: str = Field(default="v1")


class EvaluationResult(BaseModel):
    """EvaluationAgent 的最终输出契约。

    delta 给 ProfileAgent 用，narrative 给学生看。
    """

    evaluation_delta: EvaluationDelta
    narrative: str = Field(default="")
    rationale: EvaluationRationale = Field(default_factory=EvaluationRationale)
