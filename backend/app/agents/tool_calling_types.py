"""Shared types for MainAgent tool-calling orchestration."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from pydantic import BaseModel, Field

from .generate_flow import GenerateOutputs, GenerateRequest

ToolName = Literal[
    # Core resource-generation sub-agent tools
    "extract_profile",
    "plan_learning",
    "generate_document",
    "generate_exercise",
    "generate_visual",
    "generate_code",
    "evaluate_learning",
    # Whole-flow fallback tool
    "run_generate_flow",
    # Teacher-side tools
    "create_teacher_package",
    "export_teacher_pptx",
    # OpenMAIC interactive-classroom tools
    "create_interactive_classroom",
    "poll_interactive_classroom",
    "import_classroom_package",
    "load_resource_package",
    "import_exercise_attempts",
    "refresh_student_dashboard",
    # Kept only for backwards compatibility with older prompt outputs.
    "finish",
]


class MainAgentDecision(BaseModel):
    """MainAgent decision: call one or more tools, or finish.

    `tool_name` is kept for old single-tool outputs. New prompts should use
    `tool_names`; `finish` should be expressed through action="finish".
    """

    action: Literal["call_tool", "finish"]
    tool_name: ToolName | None = None
    tool_names: list[ToolName] = Field(
        default_factory=list,
        description="Tools to run in this round. Multiple tools may run in parallel.",
    )
    reason: str = ""
    args: dict[str, Any] = Field(default_factory=dict)


class ToolCallRecord(BaseModel):
    """One executed tool call recorded in ToolCallingState.history."""

    tool_name: str
    status: Literal["ok", "error"]
    reason: str = ""
    args: dict[str, Any] = Field(default_factory=dict)
    summary: str = ""
    error: str | None = None


class ToolCallingState(TypedDict, total=False):
    """Shared state for the MainAgent decision loop."""

    task_id: str
    req: GenerateRequest
    outputs: GenerateOutputs
    history: list[ToolCallRecord]
    decision: MainAgentDecision | None
    iterations: int
    max_tool_calls: int
    started_at: float
    finished: bool
