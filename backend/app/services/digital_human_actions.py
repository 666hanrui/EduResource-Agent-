"""Action catalog for a digital human operator.

The digital human should operate product features through explicit actions instead
of reaching into UI state directly. This catalog is the contract between voice /
avatar intent recognition and the existing REST APIs.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


ActionDomain = Literal["navigation", "exploration", "generation", "workspace", "report"]
ActionRisk = Literal["read", "write", "external"]


class DigitalHumanAction(BaseModel):
    action_id: str
    title: str
    domain: ActionDomain
    description: str
    method: str
    endpoint: str
    required_params: list[str] = Field(default_factory=list)
    optional_params: list[str] = Field(default_factory=list)
    risk: ActionRisk = "read"
    confirmation_required: bool = False
    success_feedback: str


def list_digital_human_actions() -> list[DigitalHumanAction]:
    """Return every backend-backed action the digital human may trigger."""

    return [
        DigitalHumanAction(
            action_id="nav.open_exploration",
            title="打开专业探索",
            domain="navigation",
            description="切换到专业探索工作台。",
            method="CLIENT",
            endpoint="app://module/exploration",
            risk="read",
            success_feedback="已打开专业探索工作台。",
        ),
        DigitalHumanAction(
            action_id="nav.open_generator",
            title="打开资源生成",
            domain="navigation",
            description="切换到多 Agent 学习资源生成页。",
            method="CLIENT",
            endpoint="app://module/generator",
            risk="read",
            success_feedback="已打开资源生成页。",
        ),
        DigitalHumanAction(
            action_id="exploration.build_plan",
            title="生成专业探索计划",
            domain="exploration",
            description="根据专业、年级、基础水平、兴趣关键词生成 12 维画像、知识地图和职业方向。",
            method="POST",
            endpoint="/api/exploration/plan",
            required_params=["student_id", "major"],
            optional_params=["grade", "education_level", "foundation_level", "interests", "weekly_hours"],
            risk="write",
            success_feedback="已生成专业探索计划。",
        ),
        DigitalHumanAction(
            action_id="exploration.create_workspace",
            title="收藏方向并创建路径工作区",
            domain="exploration",
            description="围绕候选职业方向创建可持续打卡的探索工作区。",
            method="POST",
            endpoint="/api/exploration/workspaces",
            required_params=["student_id", "plan", "direction_id"],
            risk="write",
            confirmation_required=True,
            success_feedback="已收藏方向并创建探索工作区。",
        ),
        DigitalHumanAction(
            action_id="workspace.toggle_task",
            title="更新探索任务状态",
            domain="workspace",
            description="把工作区里的探索任务标记为完成或待完成。",
            method="PATCH",
            endpoint="/api/exploration/workspaces/{workspace_id}/tasks/{task_id}",
            required_params=["workspace_id", "task_id", "status"],
            optional_params=["note"],
            risk="write",
            confirmation_required=True,
            success_feedback="已更新任务状态。",
        ),
        DigitalHumanAction(
            action_id="workspace.update_profile",
            title="编辑 12 维画像关键词",
            domain="workspace",
            description="更新某个画像维度的关键词并生成版本记录。",
            method="PATCH",
            endpoint="/api/exploration/workspaces/{workspace_id}/profile",
            required_params=["workspace_id", "dimension_key", "values"],
            optional_params=["note"],
            risk="write",
            confirmation_required=True,
            success_feedback="已更新画像关键词。",
        ),
        DigitalHumanAction(
            action_id="workspace.update_resource",
            title="打开或完成学习资源",
            domain="workspace",
            description="把学习资源标记为已打开、已完成或待学习。",
            method="PATCH",
            endpoint="/api/exploration/workspaces/{workspace_id}/resources/{resource_id}",
            required_params=["workspace_id", "resource_id", "status"],
            risk="external",
            success_feedback="已更新学习资源状态。",
        ),
        DigitalHumanAction(
            action_id="workspace.add_review",
            title="保存周/月复盘",
            domain="workspace",
            description="把学生口述复盘保存进探索工作区，并生成下一步建议。",
            method="POST",
            endpoint="/api/exploration/workspaces/{workspace_id}/reviews",
            required_params=["workspace_id", "summary"],
            optional_params=["review_type", "phase"],
            risk="write",
            success_feedback="已保存复盘。",
        ),
        DigitalHumanAction(
            action_id="workspace.ask_coach",
            title="询问探索教练",
            domain="workspace",
            description="基于当前工作区状态生成下一步探索建议。",
            method="POST",
            endpoint="/api/exploration/workspaces/{workspace_id}/coach",
            required_params=["workspace_id"],
            optional_params=["question", "tone"],
            risk="read",
            success_feedback="已生成探索教练建议。",
        ),
        DigitalHumanAction(
            action_id="generation.start",
            title="启动多 Agent 资源生成",
            domain="generation",
            description="调用完整 DAG 生成讲解、题目、代码、可视化和评估资源。",
            method="POST",
            endpoint="/api/generate",
            required_params=["student_id", "knowledge_id", "knowledge_name"],
            optional_params=["conversation", "exercise_count", "languages"],
            risk="write",
            confirmation_required=True,
            success_feedback="已启动多 Agent 资源生成。",
        ),
        DigitalHumanAction(
            action_id="report.build",
            title="生成成长报告",
            domain="report",
            description="生成或读取专业探索成长报告。",
            method="GET",
            endpoint="/api/exploration/workspaces/{workspace_id}/growth-report",
            required_params=["workspace_id"],
            risk="read",
            success_feedback="已生成成长报告。",
        ),
        DigitalHumanAction(
            action_id="report.save_draft",
            title="保存成长报告编辑稿",
            domain="report",
            description="保存用户编辑后的 Markdown 成长报告。",
            method="PATCH",
            endpoint="/api/exploration/workspaces/{workspace_id}/growth-report",
            required_params=["workspace_id", "markdown"],
            risk="write",
            confirmation_required=True,
            success_feedback="已保存成长报告编辑稿。",
        ),
        DigitalHumanAction(
            action_id="report.export",
            title="导出成长报告",
            domain="report",
            description="导出 Markdown 或可打印 HTML 成长报告。",
            method="GET",
            endpoint="/api/exploration/workspaces/{workspace_id}/growth-report/export",
            required_params=["workspace_id", "format"],
            risk="external",
            success_feedback="已导出成长报告。",
        ),
    ]
