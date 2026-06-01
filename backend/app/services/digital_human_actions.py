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


class KnowledgeShortcut(BaseModel):
    """数字人可直接切换的知识点快捷入口。

    Frontend fetches this list on startup and uses it for voice/text command routing,
    so adding a new item here is the only change needed — no frontend edits required.
    """

    knowledge_id: str
    knowledge_name: str
    keywords: list[str] = Field(description="用于自然语言匹配的关键词列表")
    description: str = ""


def list_knowledge_shortcuts() -> list[KnowledgeShortcut]:
    """Return the canonical knowledge shortcut list.

    Single source of truth for which knowledge items the digital human can navigate
    to by voice/text command.
    """
    return [
        KnowledgeShortcut(
            knowledge_id="linked-list-basics",
            knowledge_name="链表",
            keywords=["链表", "linked list", "linkedlist", "单链表", "双链表", "节点指针"],
            description="链表基础：节点、指针、插入删除操作。",
        ),
        KnowledgeShortcut(
            knowledge_id="binary-tree-traversal",
            knowledge_name="二叉树遍历",
            keywords=["二叉树", "binary tree", "binarytree", "树遍历", "先序", "中序", "后序", "层序"],
            description="二叉树三种经典遍历：先序/中序/后序，递归与迭代实现。",
        ),
        KnowledgeShortcut(
            knowledge_id="sorting-algorithms",
            knowledge_name="排序算法",
            keywords=["排序", "sort", "冒泡", "快排", "归并", "bubble sort", "quick sort", "merge sort", "堆排序"],
            description="经典排序算法比较：时间复杂度、稳定性、适用场景。",
        ),
        KnowledgeShortcut(
            knowledge_id="dynamic-programming",
            knowledge_name="动态规划",
            keywords=["动态规划", "dp", "dynamic programming", "背包", "最长公共子序列", "记忆化", "状态转移"],
            description="动态规划：状态定义、转移方程、记忆化搜索。",
        ),
        KnowledgeShortcut(
            knowledge_id="graph-algorithms",
            knowledge_name="图算法",
            keywords=["图", "graph", "bfs", "dfs", "最短路径", "拓扑排序", "广度优先", "深度优先", "dijkstra"],
            description="图的遍历与经典算法：BFS、DFS、Dijkstra、拓扑排序。",
        ),
        KnowledgeShortcut(
            knowledge_id="stack-queue",
            knowledge_name="栈与队列",
            keywords=["栈", "队列", "stack", "queue", "先进先出", "后进先出", "单调栈", "双端队列"],
            description="栈与队列的原理、实现与应用场景。",
        ),
        KnowledgeShortcut(
            knowledge_id="hash-table",
            knowledge_name="哈希表",
            keywords=["哈希", "hash", "哈希表", "散列", "哈希冲突", "dictionary", "map", "字典"],
            description="哈希表：哈希函数、冲突处理、时间复杂度分析。",
        ),
        KnowledgeShortcut(
            knowledge_id="binary-search",
            knowledge_name="二分查找",
            keywords=["二分", "binary search", "二分查找", "二分法", "折半查找"],
            description="二分查找及其变体：查找边界、旋转数组、答案二分。",
        ),
    ]


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
            action_id="nav.open_coach",
            title="打开 AI 工作台",
            domain="navigation",
            description="切换到 Claude Code 式 AI Coach 工作台。",
            method="CLIENT",
            endpoint="app://module/coach",
            risk="read",
            success_feedback="已打开 AI 工作台。",
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
