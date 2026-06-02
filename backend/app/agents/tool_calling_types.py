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
]


class MainAgentDecision(BaseModel):
    """One MainAgent decision: call one tool or finish."""

    action: Literal["call_tool", "finish"]
    tool_name: ToolName | None = None
    reason: str = ""
    args: dict[str, Any] = Field(default_factory=dict)


class ToolCallRecord(BaseModel):
    tool_name: str
    status: Literal["ok", "error"]
    reason: str = ""
    args: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    error: str | None = None


class ToolCallingState(TypedDict, total=False):
    task_id: str
    req: GenerateRequest
    outputs: GenerateOutputs
    history: list[dict[str, Any]]
    decision: MainAgentDecision | None
    iterations: int
    max_tool_calls: int
    started_at: float
    finished: bool
