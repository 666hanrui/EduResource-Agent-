"""规则版专业探索服务。

Phase 1 目标是保留 feature-agentic 的 12 维画像和路径规划思想，同时避免
简历/目标岗位前置依赖。后续可把这里的规则数据替换成数据库、图谱或 LLM。
"""

from __future__ import annotations

import re
import hashlib
from html import escape
from datetime import datetime, timezone
from urllib.parse import quote
from uuid import uuid4

from ..data.major_catalog import DEFAULT_TEMPLATE, TEMPLATES, CareerProfile, MajorTemplate
from ..schemas.exploration import (
    CareerDirection,
    CareerRequirementProfile,
    CoachResponse,
    CoachSuggestion,
    CoachTone,
    DimensionProfile,
    DimensionScore,
    ExplorationPlan,
    ExplorationRequest,
    ExplorationTask,
    ExplorationWorkspace,
    FavoriteDirection,
    GrowthReportExport,
    GrowthReport,
    KnowledgeNode,
    LearningPathItem,
    ProfileVersion,
    RecommendedKnowledge,
    WorkspacePhase,
    WorkspaceReview,
    WorkspaceResource,
    WorkspaceTask,
)
from .exploration_store import SQLiteExplorationStore


DIMENSION_TITLES = {
    "professional_skills": "专业技能",
    "professional_background": "专业背景",
    "education_requirement": "学历与阶段",
    "teamwork": "团队协作",
    "stress_adaptability": "抗压/适应",
    "communication": "沟通表达",
    "work_experience": "实践经历",
    "documentation_awareness": "文档规范",
    "responsibility": "责任心/自我管理",
    "learning_ability": "学习能力",
    "problem_solving": "分析解决问题",
    "other_special": "补充信息",
}

DIMENSION_GROUPS = {
    "professional_skills": "专业与门槛",
    "professional_background": "专业与门槛",
    "education_requirement": "专业与门槛",
    "work_experience": "专业与门槛",
    "other_special": "专业与门槛",
    "teamwork": "协作与适应",
    "stress_adaptability": "协作与适应",
    "communication": "协作与适应",
    "documentation_awareness": "成长与职业素养",
    "responsibility": "成长与职业素养",
    "learning_ability": "成长与职业素养",
    "problem_solving": "成长与职业素养",
}


_STORE = SQLiteExplorationStore()


def build_major_exploration_plan(req: ExplorationRequest) -> ExplorationPlan:
    template = _pick_template(req.major)
    interests = req.interests or [template.directions[0]]
    base_score = _base_score(req.foundation_level)

    knowledge_map = _build_knowledge_map(req.major, template)
    tasks = _build_tasks(template, req.weekly_hours)
    profile = _build_profile(req, template, interests)
    scores = _build_dimension_scores(profile, req, template, base_score)
    directions = _build_directions(template, interests, scores)
    learning_path = _build_learning_path(template, tasks)
    recommended = _build_recommended_knowledge(knowledge_map, directions)

    return ExplorationPlan(
        student_id=req.student_id,
        major=req.major.strip(),
        summary=(
            f"从 {req.major.strip()} 的基础课、核心课和应用方向开始探索，"
            "先用低风险任务确认兴趣，再逐步收敛职业方向。"
        ),
        profile=profile,
        dimension_scores=scores,
        knowledge_map=knowledge_map,
        exploration_tasks=tasks,
        career_directions=directions,
        learning_path=learning_path,
        recommended_knowledge=recommended,
    )


def create_favorite_direction(
    *,
    student_id: str,
    plan: ExplorationPlan,
    direction_id: str,
) -> FavoriteDirection:
    direction = _find_direction(plan, direction_id)
    favorite_id = f"fav_{uuid4().hex[:12]}"
    favorite = FavoriteDirection(
        favorite_id=favorite_id,
        student_id=student_id,
        direction=direction,
        plan_summary=plan.summary,
        created_at=_now(),
    )
    _STORE.save_favorite(favorite)
    return favorite


def list_favorite_directions(student_id: str) -> list[FavoriteDirection]:
    return [
        item
        for item in sorted(_STORE.list_favorites(), key=lambda row: row.created_at, reverse=True)
        if item.student_id == student_id
    ]


def create_exploration_workspace(
    *,
    student_id: str,
    plan: ExplorationPlan,
    direction_id: str,
) -> ExplorationWorkspace:
    favorite = create_favorite_direction(
        student_id=student_id,
        plan=plan,
        direction_id=direction_id,
    )
    workspace_id = f"ws_{uuid4().hex[:12]}"
    task_by_id = {task.id: task for task in plan.exploration_tasks}
    phases: list[WorkspacePhase] = []
    for phase in plan.learning_path:
        phase_tasks: list[WorkspaceTask] = []
        for task_id in phase.tasks:
            task = task_by_id.get(task_id)
            if task is None:
                continue
            phase_tasks.append(
                WorkspaceTask(
                    id=task.id,
                    title=task.title,
                    phase=phase.phase,
                    task_type=task.task_type,
                    expected_minutes=task.expected_minutes,
                    evidence_to_collect=task.evidence_to_collect,
                )
            )
        phases.append(
            WorkspacePhase(
                phase=phase.phase,
                label=phase.label,
                horizon=phase.horizon,
                goal=phase.goal,
                tasks=phase_tasks,
                deliverables=phase.deliverables,
                progress_percent=_phase_progress(phase_tasks),
            )
        )
    now = _now()
    workspace = ExplorationWorkspace(
        workspace_id=workspace_id,
        favorite=favorite,
        profile=plan.profile.model_copy(deep=True),
        dimension_scores=[item.model_copy(deep=True) for item in plan.dimension_scores],
        resources=_build_workspace_resources(plan),
        phases=phases,
        created_at=now,
        updated_at=now,
    )
    _STORE.save_workspace(workspace)
    return workspace


def get_exploration_workspace(workspace_id: str) -> ExplorationWorkspace | None:
    return _STORE.get_workspace(workspace_id)


def update_workspace_task(
    *,
    workspace_id: str,
    task_id: str,
    status: str,
    note: str = "",
) -> ExplorationWorkspace:
    workspace = _require_workspace(workspace_id)
    found = False
    now = _now()
    for phase in workspace.phases:
        for task in phase.tasks:
            if task.id != task_id:
                continue
            task.status = "done" if status == "done" else "pending"
            task.note = note.strip()
            task.completed_at = now if task.status == "done" else None
            found = True
        phase.progress_percent = _phase_progress(phase.tasks)
    if not found:
        raise KeyError(f"task not found: {task_id}")
    workspace.updated_at = now
    _STORE.save_workspace(workspace)
    return workspace


def add_workspace_review(
    *,
    workspace_id: str,
    review_type: str,
    phase: str,
    summary: str,
) -> ExplorationWorkspace:
    workspace = _require_workspace(workspace_id)
    target_phase = next((item for item in workspace.phases if item.phase == phase), None)
    if target_phase is None:
        raise KeyError(f"phase not found: {phase}")
    review = WorkspaceReview(
        review_id=f"rev_{uuid4().hex[:12]}",
        review_type="monthly" if review_type == "monthly" else "weekly",
        phase=target_phase.phase,
        summary=summary.strip(),
        next_actions=_review_next_actions(target_phase, summary),
        created_at=_now(),
    )
    workspace.reviews.insert(0, review)
    workspace.updated_at = review.created_at
    _STORE.save_workspace(workspace)
    return workspace


def update_workspace_profile(
    *,
    workspace_id: str,
    dimension_key: str,
    values: list[str],
    note: str = "",
) -> ExplorationWorkspace:
    workspace = _require_workspace(workspace_id)
    previous = list(getattr(workspace.profile, dimension_key))
    normalized = _normalize_values(values)
    setattr(workspace.profile, dimension_key, normalized)
    version = ProfileVersion(
        version_id=f"pv_{uuid4().hex[:12]}",
        changed_dimension=dimension_key,
        previous_values=previous,
        next_values=normalized,
        note=note.strip(),
        created_at=_now(),
    )
    workspace.profile_versions.insert(0, version)
    workspace.dimension_scores = _scores_from_profile(workspace.profile, workspace.dimension_scores)
    workspace.updated_at = version.created_at
    _STORE.save_workspace(workspace)
    return workspace


def update_workspace_resource(
    *,
    workspace_id: str,
    resource_id: str,
    status: str,
) -> ExplorationWorkspace:
    workspace = _require_workspace(workspace_id)
    found = False
    now = _now()
    for resource in workspace.resources:
        if resource.resource_id != resource_id:
            continue
        if status == "completed":
            resource.status = "completed"
            resource.completed_at = now
            resource.opened_at = resource.opened_at or now
        elif status == "opened":
            resource.status = "opened"
            resource.opened_at = resource.opened_at or now
            resource.completed_at = None
        else:
            resource.status = "recommended"
            resource.opened_at = None
            resource.completed_at = None
        found = True
    if not found:
        raise KeyError(f"resource not found: {resource_id}")
    workspace.updated_at = now
    _STORE.save_workspace(workspace)
    return workspace


def build_exploration_coach_response(
    *,
    workspace_id: str,
    question: str = "",
    tone: CoachTone = "encourage",
) -> CoachResponse:
    workspace = _require_workspace(workspace_id)
    direction = workspace.favorite.direction
    pending_tasks = [
        task
        for phase in workspace.phases
        for task in phase.tasks
        if task.status != "done"
    ]
    done_tasks = [
        task
        for phase in workspace.phases
        for task in phase.tasks
        if task.status == "done"
    ]
    active_resources = [item for item in workspace.resources if item.status != "completed"]
    completed_resources = [item for item in workspace.resources if item.status == "completed"]
    low_scores = sorted(workspace.dimension_scores, key=lambda item: item.score)[:3]

    suggestions: list[CoachSuggestion] = []
    if pending_tasks:
        task = pending_tasks[0]
        suggestions.append(
            CoachSuggestion(
                title="先完成一个最小探索任务",
                reason="低年级阶段不急着定职业，先用小证据判断自己是否愿意继续投入。",
                action=f"本周完成「{task.title}」。",
                evidence_to_collect=task.evidence_to_collect,
                related_ids=[task.id],
            )
        )
    if active_resources:
        resource = active_resources[0]
        suggestions.append(
            CoachSuggestion(
                title="补一条学习资源证据",
                reason="资源打开和完成记录会进入成长报告，能把兴趣从口头偏好变成可观察证据。",
                action=f"打开并完成「{resource.title}」相关资源，学完后标记完成。",
                evidence_to_collect="记录 3 个新概念、1 个仍然困惑的问题和是否愿意继续学习。",
                related_ids=[resource.resource_id, resource.knowledge_id],
            )
        )
    if low_scores:
        dimension = low_scores[0]
        suggestions.append(
            CoachSuggestion(
                title=f"补强画像维度：{dimension.title}",
                reason=f"当前 {dimension.title} 证据较少，会影响系统判断探索方向是否真的适合你。",
                action=dimension.next_probe,
                evidence_to_collect="把结果写进画像关键词或周复盘。",
                related_ids=[dimension.key],
            )
        )
    if question.strip():
        suggestions.append(
            CoachSuggestion(
                title="把当前困惑转成验证问题",
                reason="探索教练不会直接替你定方向，而是帮你把困惑变成下一个可验证动作。",
                action=f"围绕「{question.strip()}」写下一个 30 分钟内能完成的小实验。",
                evidence_to_collect="记录实验结果、投入感和想继续/想放弃的理由。",
                related_ids=[workspace.workspace_id],
            )
        )

    completed_count = len(done_tasks) + len(completed_resources)
    tone_prefix = {
        "encourage": "你已经有了可继续推进的探索线索。",
        "diagnose": "当前最需要补的是可验证证据。",
        "challenge": "可以把下一步设得更硬一点，但仍然保持小步验证。",
    }[tone]
    summary = (
        f"{tone_prefix} 方向是「{direction.title}」，目前已有 {completed_count} 条任务/资源证据，"
        f"建议继续用短任务和复盘来判断真实兴趣。"
    )
    return CoachResponse(
        workspace_id=workspace.workspace_id,
        direction_title=direction.title,
        tone=tone,
        summary=summary,
        suggestions=suggestions[:4],
        follow_up_questions=[
            "这个方向里哪类任务让你最愿意多花 30 分钟？",
            "最近一次卡住是知识不会、工具不会，还是目标不清楚？",
            "如果只能保留一个探索方向，你会留下哪个，为什么？",
        ],
        generated_at=_now(),
    )


def build_growth_report(workspace_id: str) -> GrowthReport:
    workspace = _require_workspace(workspace_id)
    generated = _build_growth_report_markdown(workspace)
    markdown = workspace.report_markdown or generated
    direction = workspace.favorite.direction
    return GrowthReport(
        workspace_id=workspace.workspace_id,
        title=f"{direction.title} 专业探索成长报告",
        markdown=markdown,
        is_customized=bool(workspace.report_markdown),
        updated_at=workspace.report_updated_at,
        generated_at=_now(),
    )


def update_growth_report_draft(*, workspace_id: str, markdown: str) -> GrowthReport:
    workspace = _require_workspace(workspace_id)
    workspace.report_markdown = markdown.strip()
    workspace.report_updated_at = _now()
    workspace.updated_at = workspace.report_updated_at
    _STORE.save_workspace(workspace)
    return build_growth_report(workspace_id)


def export_growth_report(
    *,
    workspace_id: str,
    export_format: str = "markdown",
) -> GrowthReportExport:
    report = build_growth_report(workspace_id)
    base_name = _slug(report.title)
    if export_format == "html":
        return GrowthReportExport(
            filename=f"{base_name}.html",
            media_type="text/html; charset=utf-8",
            content=_markdown_to_printable_html(report),
        )
    return GrowthReportExport(
        filename=f"{base_name}.md",
        media_type="text/markdown; charset=utf-8",
        content=report.markdown,
    )


def _build_growth_report_markdown(workspace: ExplorationWorkspace) -> str:
    direction = workspace.favorite.direction
    done_tasks = [
        task
        for phase in workspace.phases
        for task in phase.tasks
        if task.status == "done"
    ]
    pending_tasks = [
        task
        for phase in workspace.phases
        for task in phase.tasks
        if task.status != "done"
    ]
    lines = [
        f"# {direction.title} 专业探索成长报告",
        "",
        f"- 探索方向：{direction.title}",
        f"- 初始匹配度：{direction.fit_score}",
        f"- 工作区：{workspace.workspace_id}",
        "",
        "## 为什么探索这个方向",
        *[f"- {item}" for item in direction.why_explore],
        "",
        "## 阶段进度",
    ]
    lines.extend(["", "## 当前 12 维画像证据"])
    for key, title in DIMENSION_TITLES.items():
        values = getattr(workspace.profile, key)
        if values:
            lines.append(f"- {title}：{'、'.join(values[:5])}")
    if workspace.profile_versions:
        lines.extend(["", "## 画像更新记录"])
        for version in workspace.profile_versions[:5]:
            title = DIMENSION_TITLES.get(version.changed_dimension, version.changed_dimension)
            lines.append(
                f"- {title}：{'、'.join(version.previous_values) or '空'} -> "
                f"{'、'.join(version.next_values) or '空'}"
            )
    if workspace.resources:
        lines.extend(["", "## 学习资源使用记录"])
        for resource in workspace.resources:
            label = {
                "recommended": "待学习",
                "opened": "已打开",
                "completed": "已完成",
            }[resource.status]
            lines.append(f"- {label}：{resource.title}（{resource.url}）")
    for phase in workspace.phases:
        lines.extend(
            [
                f"### {phase.label}（{phase.horizon}）",
                f"- 目标：{phase.goal}",
                f"- 完成度：{phase.progress_percent}%",
                f"- 交付物：{'、'.join(phase.deliverables)}",
            ]
        )
    lines.extend(["", "## 已完成证据"])
    if done_tasks:
        for task in done_tasks:
            note = f"：{task.note}" if task.note else ""
            lines.append(f"- {task.title}{note}")
    else:
        lines.append("- 暂无完成任务，建议先完成短期探索中的一个诊断或小任务。")
    lines.extend(["", "## 下一步"])
    for task in pending_tasks[:3]:
        lines.append(f"- {task.title}，收集证据：{task.evidence_to_collect}")
    if workspace.reviews:
        lines.extend(["", "## 复盘记录"])
        for review in workspace.reviews[:5]:
            lines.append(f"- {review.review_type} / {review.phase}：{review.summary}")
    return "\n".join(lines)


def _markdown_to_printable_html(report: GrowthReport) -> str:
    blocks: list[str] = []
    for line in report.markdown.splitlines():
        text = escape(line)
        if line.startswith("# "):
            blocks.append(f"<h1>{escape(line[2:].strip())}</h1>")
        elif line.startswith("## "):
            blocks.append(f"<h2>{escape(line[3:].strip())}</h2>")
        elif line.startswith("### "):
            blocks.append(f"<h3>{escape(line[4:].strip())}</h3>")
        elif line.startswith("- "):
            blocks.append(f"<p class=\"bullet\">{escape(line[2:].strip())}</p>")
        elif text:
            blocks.append(f"<p>{text}</p>")
        else:
            blocks.append("<br>")
    return "\n".join(
        [
            "<!doctype html>",
            "<html lang=\"zh-CN\">",
            "<head>",
            "<meta charset=\"utf-8\">",
            f"<title>{escape(report.title)}</title>",
            "<style>",
            "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.65;color:#1f2328;max-width:880px;margin:40px auto;padding:0 24px;}",
            "h1{font-size:28px;margin:0 0 24px;}h2{font-size:20px;margin:28px 0 10px;}h3{font-size:16px;margin:18px 0 6px;}",
            ".bullet{margin:6px 0 6px 18px;}@media print{body{margin:20px auto;}}",
            "</style>",
            "</head>",
            "<body>",
            *blocks,
            "</body>",
            "</html>",
        ]
    )


def reset_exploration_store() -> None:
    _STORE.clear()


def use_exploration_store(store: SQLiteExplorationStore) -> None:
    """Swap the repository, mainly for tests and future app wiring."""

    global _STORE
    _STORE = store


def _pick_template(major: str) -> MajorTemplate:
    normalized = major.strip().lower()
    for template in TEMPLATES:
        if any(alias.lower() in normalized for alias in template.aliases):
            return template
    return DEFAULT_TEMPLATE


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _find_direction(plan: ExplorationPlan, direction_id: str) -> CareerDirection:
    for direction in plan.career_directions:
        if direction.id == direction_id:
            return direction
    raise KeyError(f"direction not found: {direction_id}")


def _require_workspace(workspace_id: str) -> ExplorationWorkspace:
    workspace = get_exploration_workspace(workspace_id)
    if workspace is None:
        raise KeyError(f"workspace not found: {workspace_id}")
    return workspace


def _phase_progress(tasks: list[WorkspaceTask]) -> int:
    if not tasks:
        return 0
    done = sum(1 for task in tasks if task.status == "done")
    return round(done / len(tasks) * 100)


def _review_next_actions(phase: WorkspacePhase, summary: str) -> list[str]:
    pending = [task for task in phase.tasks if task.status != "done"]
    actions = [f"继续完成：{task.title}" for task in pending[:2]]
    if "难" in summary or "卡" in summary:
        actions.insert(0, "把卡住的问题转成 3 个可提问的具体概念。")
    if not actions:
        actions.append("进入下一阶段前，整理本阶段交付物和兴趣变化。")
    return actions[:3]


def _build_workspace_resources(plan: ExplorationPlan) -> list[WorkspaceResource]:
    resources: list[WorkspaceResource] = []
    for item in plan.recommended_knowledge[:6]:
        query = quote(f"{plan.major} {item.knowledge_name} 入门 学习资源")
        resources.append(
            WorkspaceResource(
                resource_id=f"res_{_slug(item.knowledge_id)}",
                knowledge_id=item.knowledge_id,
                title=item.knowledge_name,
                url=f"https://www.bilibili.com/search?keyword={query}",
                reason=item.reason,
            )
        )
    return resources


def _normalize_values(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for item in values:
        text = str(item).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result[:12]


def _scores_from_profile(
    profile: DimensionProfile,
    previous_scores: list[DimensionScore],
) -> list[DimensionScore]:
    score_by_key = {item.key: item for item in previous_scores}
    result: list[DimensionScore] = []
    for key, title in DIMENSION_TITLES.items():
        values = getattr(profile, key)
        previous = score_by_key.get(key)
        base = previous.score if previous else 45
        evidence_score = min(25, len(values) * 5)
        score = max(base, min(95, 35 + evidence_score + (10 if values else 0)))
        result.append(
            DimensionScore(
                key=key,
                title=title,
                group=DIMENSION_GROUPS[key],
                score=score,
                evidence=values,
                next_probe=previous.next_probe if previous else "继续补充可验证证据。",
            )
        )
    return result


def _slug(value: str) -> str:
    ascii_part = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if ascii_part:
        return ascii_part
    return "k" + hashlib.sha1(value.encode("utf-8")).hexdigest()[:8]


def _base_score(level: str) -> int:
    return {
        "beginner": 35,
        "basic": 55,
        "intermediate": 72,
    }.get(level, 45)


def _build_knowledge_map(major: str, template: MajorTemplate) -> list[KnowledgeNode]:
    nodes: list[KnowledgeNode] = []
    for idx, title in enumerate(template.foundations, start=1):
        nodes.append(
            KnowledgeNode(
                id=f"foundation-{_slug(title)}",
                title=title,
                category="foundation",
                difficulty=1 if idx <= 2 else 2,
                why=f"{major} 的入门底座，决定后续核心课理解速度。",
            )
        )
    for title in template.core:
        nodes.append(
            KnowledgeNode(
                id=f"core-{_slug(title)}",
                title=title,
                category="core",
                difficulty=3,
                why="专业核心知识，适合作为资源生成和诊断题的重点。",
                prerequisites=[nodes[0].id] if nodes else [],
            )
        )
    for title in template.directions:
        related = [node.id for node in nodes if node.category in {"foundation", "core"}][:3]
        nodes.append(
            KnowledgeNode(
                id=f"direction-{_slug(title)}",
                title=title,
                category="direction",
                difficulty=4,
                why="用于确认兴趣和职业方向的探索分支。",
                prerequisites=related,
            )
        )
    for title in template.practice:
        nodes.append(
            KnowledgeNode(
                id=f"practice-{_slug(title)}",
                title=title,
                category="practice",
                difficulty=2,
                why="把知识转成可观察证据，帮助系统更新画像。",
            )
        )
    return nodes


def _build_tasks(template: MajorTemplate, weekly_hours: int) -> list[ExplorationTask]:
    minutes = max(20, min(120, weekly_hours * 10))
    return [
        ExplorationTask(
            id="task-foundation-map",
            title=f"画出 {template.foundations[0]} 到 {template.core[0]} 的关系图",
            task_type="reflection",
            related_knowledge_ids=[f"foundation-{_slug(template.foundations[0])}", f"core-{_slug(template.core[0])}"],
            expected_minutes=minutes,
            evidence_to_collect="一张手绘或 Markdown 关系图，以及 3 个还不理解的问题。",
        ),
        ExplorationTask(
            id="task-core-quiz",
            title=f"完成一次 {template.core[0]} 入门诊断",
            task_type="quiz",
            related_knowledge_ids=[f"core-{_slug(template.core[0])}"],
            expected_minutes=30,
            evidence_to_collect="记录正确率、最卡的题型和想追问的概念。",
        ),
        ExplorationTask(
            id="task-mini-project",
            title=f"做一个 {template.practice[0]} 小任务",
            task_type="mini_project",
            related_knowledge_ids=[f"practice-{_slug(template.practice[0])}"],
            expected_minutes=max(45, minutes),
            evidence_to_collect="保存过程截图、结果链接或复盘笔记。",
        ),
        ExplorationTask(
            id="task-interest-reflection",
            title="兴趣反馈：给每个方向打分",
            task_type="reflection",
            related_knowledge_ids=[f"direction-{_slug(item)}" for item in template.directions[:3]],
            expected_minutes=20,
            evidence_to_collect="写下最想继续了解的 1 个方向和不想继续的 1 个方向。",
        ),
    ]


def _build_profile(req: ExplorationRequest, template: MajorTemplate, interests: list[str]) -> DimensionProfile:
    return DimensionProfile(
        professional_skills=list(template.tools[:3]),
        professional_background=[req.major.strip(), *template.foundations[:2]],
        education_requirement=[req.education_level, req.grade, f"每周可投入 {req.weekly_hours} 小时"],
        teamwork=["待通过小组任务观察", "课程讨论反馈"],
        stress_adaptability=["待通过诊断题压力反馈观察"],
        communication=["待通过讲解复述和展示任务观察"],
        work_experience=["课程项目待补充", "探索任务将作为早期实践证据"],
        documentation_awareness=["建议从学习日志和错题记录开始"],
        responsibility=["以每周探索任务完成率作为证据"],
        learning_ability=[f"{req.foundation_level} 起点", "可通过复盘频率更新"],
        problem_solving=["待通过小项目和诊断题观察"],
        other_special=interests,
    )


def _build_dimension_scores(
    profile: DimensionProfile,
    req: ExplorationRequest,
    template: MajorTemplate,
    base_score: int,
) -> list[DimensionScore]:
    boosts = {
        "professional_background": 12,
        "education_requirement": 10,
        "learning_ability": 8 if req.weekly_hours >= 6 else 0,
        "professional_skills": 8 if req.foundation_level != "beginner" else 0,
        "other_special": 8 if req.interests else 0,
    }
    probes = {
        "professional_skills": f"用 {template.tools[0]} 完成一个 30 分钟小练习。",
        "professional_background": f"解释 {template.foundations[0]} 为什么支撑 {template.core[0]}。",
        "education_requirement": "补充本学期正在学习的 2 门课程。",
        "teamwork": "记录一次小组作业中的分工和协作感受。",
        "stress_adaptability": "完成限时诊断后记录卡住原因。",
        "communication": "把一个新概念讲给同学或用 100 字写清楚。",
        "work_experience": "完成一个可截图或可链接的小任务。",
        "documentation_awareness": "连续 3 天保存学习日志。",
        "responsibility": "按计划完成一周探索任务。",
        "learning_ability": "复盘一次从不会到会的学习过程。",
        "problem_solving": "记录一个问题的定位、尝试和结果。",
        "other_special": "补充兴趣、限制条件或想避开的方向。",
    }
    result: list[DimensionScore] = []
    for key, title in DIMENSION_TITLES.items():
        evidence = list(getattr(profile, key))
        score = min(95, max(20, base_score + boosts.get(key, 0) + min(len(evidence), 3) * 4))
        result.append(
            DimensionScore(
                key=key,
                title=title,
                group=DIMENSION_GROUPS[key],
                score=score,
                evidence=evidence,
                next_probe=probes[key],
            )
        )
    return result


def _build_directions(
    template: MajorTemplate,
    interests: list[str],
    scores: list[DimensionScore],
) -> list[CareerDirection]:
    score_by_key = {item.key: item.score for item in scores}
    directions: list[CareerDirection] = []
    for idx, profile in enumerate(template.career_profiles[:5]):
        interest_bonus = 10 if any(i in profile.title or i in profile.direction for i in interests) else 0
        weighted_score = _weighted_fit_score(score_by_key, profile)
        fit = min(94, 42 + idx * 2 + interest_bonus + weighted_score // 3)
        related_core = _first_matching_knowledge(profile.core_skills, template.core, fallback=template.core[idx % len(template.core)])
        directions.append(
            CareerDirection(
                id=f"direction-{_slug(profile.title)}",
                title=profile.title,
                exploration_domain=profile.direction,
                fit_score=fit,
                why_explore=[
                    f"与 {profile.direction} 方向相关，适合用低成本任务验证兴趣。",
                    f"典型任务包括：{'、'.join(profile.typical_tasks[:2])}。",
                    f"建议先收集证据：{profile.evidence_suggestions[0]}。",
                ],
                required_dimensions=list(profile.dimension_weights.keys()),
                first_probe_task_id="task-mini-project" if idx < 3 else "task-interest-reflection",
                related_knowledge_ids=[
                    f"direction-{_slug(profile.direction)}",
                    f"core-{_slug(related_core)}",
                ],
                requirement_profile=CareerRequirementProfile(
                    core_skills=list(profile.core_skills),
                    typical_tasks=list(profile.typical_tasks),
                    dimension_weights=dict(profile.dimension_weights),
                    evidence_suggestions=list(profile.evidence_suggestions),
                ),
            )
        )
    directions.sort(key=lambda item: item.fit_score, reverse=True)
    return directions


def _weighted_fit_score(score_by_key: dict[str, int], profile: CareerProfile) -> int:
    total_weight = sum(profile.dimension_weights.values())
    if total_weight <= 0:
        return 45
    weighted = sum(
        score_by_key.get(key, 45) * weight
        for key, weight in profile.dimension_weights.items()
    )
    return round(weighted / total_weight)


def _first_matching_knowledge(
    skills: tuple[str, ...],
    core_titles: tuple[str, ...],
    *,
    fallback: str,
) -> str:
    for skill in skills:
        for title in core_titles:
            if skill in title or title in skill:
                return title
    return fallback


def _build_learning_path(
    template: MajorTemplate,
    tasks: list[ExplorationTask],
) -> list[LearningPathItem]:
    return [
        LearningPathItem(
            phase="short_term",
            label="短期探索",
            horizon="0-4 周",
            goal="建立专业底座认知，确认哪些基础知识最卡。",
            focus_knowledge_ids=[f"foundation-{_slug(item)}" for item in template.foundations[:2]],
            tasks=[tasks[0].id, tasks[1].id],
            deliverables=["专业知识关系图", "一次诊断题复盘", "个人问题清单"],
        ),
        LearningPathItem(
            phase="mid_term",
            label="中期试探",
            horizon="1-3 个月",
            goal="围绕 2-3 个方向做小任务，观察真实兴趣。",
            focus_knowledge_ids=[f"core-{_slug(item)}" for item in template.core[:3]],
            tasks=[tasks[2].id, tasks[3].id],
            deliverables=["一个小作品或报告", "方向兴趣评分", "更新后的 12 维画像"],
        ),
        LearningPathItem(
            phase="long_term",
            label="长期收敛",
            horizon="3-12 个月",
            goal="选择一个主方向，形成课程、项目和职业假设的闭环。",
            focus_knowledge_ids=[f"direction-{_slug(item)}" for item in template.directions[:3]],
            tasks=["task-mini-project", "task-interest-reflection"],
            deliverables=["方向作品集雏形", "下一阶段学习路径", "成长报告素材"],
        ),
    ]


def _build_recommended_knowledge(
    knowledge_map: list[KnowledgeNode],
    directions: list[CareerDirection],
) -> list[RecommendedKnowledge]:
    selected_ids = set()
    for direction in directions[:2]:
        selected_ids.update(direction.related_knowledge_ids)
    selected = [node for node in knowledge_map if node.id in selected_ids]
    if len(selected) < 3:
        selected.extend([node for node in knowledge_map if node.category == "core"][: 3 - len(selected)])
    return [
        RecommendedKnowledge(
            knowledge_id=node.id,
            knowledge_name=node.title,
            reason=node.why,
            suggested_difficulty=min(5, max(1, node.difficulty)),
        )
        for node in selected[:5]
    ]
