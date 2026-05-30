"""
8 维学习画像 Pydantic Schema。

设计原则：
- 所有字段都有合法默认值，避免 Agent 输出缺字段时崩
- knowledge_levels 使用 dict[str, float]，0~1 浮点数表示掌握度
- weakness 是字符串列表，存"指针修改顺序"这样的具体描述
- 与 LLM 输出严格对应，反序列化失败立即触发重试
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


Pace = Literal["fast", "medium", "slow"]
LearningStyle = Literal[
    "diagram",       # 图解
    "code",          # 代码驱动
    "derivation",    # 公式推导
    "case_study",    # 案例驱动
    "step_by_step",  # 分步骤讲解
]
ResourcePreference = Literal[
    "mindmap",
    "animation",
    "exercise",
    "document",
    "code_sample",
    "extended_reading",
]


class Progress(BaseModel):
    """学习进度子结构。"""

    current_chapter: str = Field(default="unknown", description="当前所在章节 ID")
    completed: list[str] = Field(default_factory=list, description="已完成的章节 ID 列表")


class Profile(BaseModel):
    """8 维学习画像。

    维度对应 docs/01-solution-overview.md 第 3.1 节。
    """

    major: str = Field(default="unknown", description="专业背景，决定术语深度")
    knowledge_levels: dict[str, float] = Field(
        default_factory=dict,
        description="知识点掌握度，key 为知识点 ID，value 为 0~1 浮点数",
    )
    goal: str = Field(default="unknown", description="学习目标，决定路径终点")
    style: list[LearningStyle] = Field(
        default_factory=list,
        description="学习风格，决定资源形态",
    )
    weakness: list[str] = Field(
        default_factory=list,
        description="易错点，决定题目重点。建议保留最近 5 个",
    )
    preference: list[ResourcePreference] = Field(
        default_factory=list,
        description="资源偏好，决定优先生成什么",
    )
    pace: Pace = Field(default="medium", description="学习节奏，决定路径粒度")
    progress: Progress = Field(default_factory=Progress, description="当前进度")

    @field_validator("knowledge_levels")
    @classmethod
    def _clamp_levels(cls, v: dict[str, float]) -> dict[str, float]:
        return {k: max(0.0, min(1.0, float(val))) for k, val in v.items()}

    @field_validator("weakness")
    @classmethod
    def _trim_weakness(cls, v: list[str]) -> list[str]:
        # 去重保序，保留最近 5 个
        seen: set[str] = set()
        result: list[str] = []
        for item in v:
            if item and item not in seen:
                seen.add(item)
                result.append(item)
        return result[-5:]


class ExtractionRationale(BaseModel):
    """ProfileAgent 自身的抽取依据，与下游 Agent 的 Rationale 不同。"""

    extracted_from: list[Literal["conversation", "answers", "upload"]] = Field(
        default_factory=list,
        description="本次抽取信息的来源",
    )
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    notes: str = Field(default="")


class ProfileExtractionResult(BaseModel):
    """ProfileAgent 的最终输出契约。"""

    profile: Profile
    rationale: ExtractionRationale


# ─────────────────────────────────────────────────────────────────────────
# 下游生成 Agent 共用的 Rationale（资源溯源四段式）
# 见 docs/04-ui-sketch.md
# ─────────────────────────────────────────────────────────────────────────


class CitedSource(BaseModel):
    """生成时引用的资料。"""

    title: str
    page: str = Field(default="unknown")
    similarity: float = Field(default=0.0, ge=0.0, le=1.0)


class Rationale(BaseModel):
    """资源生成 Agent 输出的标准溯源结构。

    四段式：
    1. matched_profile —— 画像匹配
    2. addressed_weakness —— 短板对应
    3. difficulty_adjusted_from / difficulty_used —— 难度自适应
    4. agent_name / prompt_version / model_name / cited_sources —— 生成参数
    """

    matched_profile: list[str] = Field(default_factory=list)
    addressed_weakness: list[str] = Field(default_factory=list)
    difficulty_adjusted_from: int = Field(default=3, ge=1, le=5)
    difficulty_used: int = Field(default=3, ge=1, le=5)
    agent_name: str
    prompt_version: str
    model_name: str
    cited_sources: list[CitedSource] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────
# 闭环信号：EvaluationAgent → ProfileAgent
# ─────────────────────────────────────────────────────────────────────────


class EvaluationDelta(BaseModel):
    """答题分析后产出的画像更新建议。"""

    knowledge_id: str
    observed_correct_rate: float = Field(ge=0.0, le=1.0)
    estimated_mastery: float = Field(ge=0.0, le=1.0)
    new_weakness: list[str] = Field(default_factory=list)
    resolved_weakness: list[str] = Field(default_factory=list)
    next_difficulty_recommendation: int = Field(default=3, ge=1, le=5)
    next_focus: str = Field(default="")
