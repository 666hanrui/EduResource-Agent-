"""Shared types for LangGraph tool-calling orchestration."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from pydantic import BaseModel, Field

from .generate_flow import GenerateOutputs, GenerateRequest

ToolName = Literal[
    "extract_profile",
    "plan_learning",
    "generate_document",
    "generate_exercise",
    "generate_visual",
    "generate_code",
    "evaluate_learning",
    "finish",
]


class MainAgentDecision(BaseModel):
    """MainAgent 决策：单轮可并行调用多个工具。

    向后兼容保留 tool_name（单工具），新代码请使用 tool_names。
    """

    action: Literal["call_tool", "finish"]
    # 单工具（旧接口，兼容保留）
    tool_name: ToolName | None = None
    # 多工具并行（新接口，优先使用）
    tool_names: list[ToolName] = Field(
        default_factory=list,
        description="本轮并行调用的工具列表；finish 时为空",
    )
    reason: str = ""
    args: dict[str, Any] = Field(default_factory=dict)


class ToolCallRecord(BaseModel):
    """单次工具调用的记录，写入 ToolCallingState.history。"""

    tool_name: str
    status: Literal["ok", "error"]
    reason: str = ""
    args: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    error: str | None = None


class ToolCallingState(TypedDict, total=False):
    """MainAgent 决策循环共享状态。"""

    task_id: str
    req: GenerateRequest
    outputs: GenerateOutputs
    # history 改为 ToolCallRecord 列表（强类型，方便 summary 构建）
    history: list[ToolCallRecord]
    decision: MainAgentDecision | None
    iterations: int
    max_tool_calls: int
    started_at: float
    finished: bool
