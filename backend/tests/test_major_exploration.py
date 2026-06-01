from __future__ import annotations

import pytest

from app.schemas.exploration import ExplorationRequest, PROFILE_DIMENSION_KEYS
from app.services.exploration_store import SQLiteExplorationStore
from app.services.major_exploration import (
    add_workspace_review,
    build_exploration_coach_response,
    export_growth_report,
    build_growth_report,
    build_major_exploration_plan,
    create_exploration_workspace,
    create_favorite_direction,
    list_favorite_directions,
    reset_exploration_store,
    update_growth_report_draft,
    use_exploration_store,
    update_workspace_profile,
    update_workspace_resource,
    update_workspace_task,
)


@pytest.fixture(autouse=True)
def isolated_exploration_store(tmp_path):
    use_exploration_store(SQLiteExplorationStore(tmp_path / "exploration_store.sqlite3"))
    reset_exploration_store()
    yield
    reset_exploration_store()


def test_major_exploration_keeps_12_dimension_profile() -> None:
    plan = build_major_exploration_plan(
        ExplorationRequest(
            student_id="stu_001",
            major="计算机科学与技术",
            grade="大一",
            foundation_level="beginner",
            interests=["AI 应用", "Web 开发", "AI 应用"],
        )
    )

    dumped = plan.profile.model_dump()
    assert set(PROFILE_DIMENSION_KEYS) == set(dumped.keys())
    assert plan.major == "计算机科学与技术"
    assert plan.profile.professional_background[0] == "计算机科学与技术"
    assert plan.profile.other_special == ["AI 应用", "Web 开发"]


def test_major_exploration_builds_knowledge_map_and_recommendations() -> None:
    plan = build_major_exploration_plan(
        ExplorationRequest(major="软件工程", foundation_level="basic")
    )

    categories = {node.category for node in plan.knowledge_map}
    assert {"foundation", "core", "direction", "practice"} <= categories
    assert len(plan.recommended_knowledge) >= 3
    assert all(item.knowledge_id for item in plan.recommended_knowledge)


def test_major_exploration_ranks_interest_related_direction() -> None:
    plan = build_major_exploration_plan(
        ExplorationRequest(
            major="计算机科学与技术",
            foundation_level="basic",
            interests=["数据分析"],
        )
    )

    top_titles = [item.title for item in plan.career_directions[:3]]
    assert "数据分析师" in top_titles
    assert plan.career_directions[0].fit_score >= plan.career_directions[-1].fit_score
    top = plan.career_directions[0]
    assert top.exploration_domain
    assert top.requirement_profile.core_skills
    assert top.requirement_profile.dimension_weights
    assert top.requirement_profile.evidence_suggestions
    report = next(item for item in plan.match_reports if item.direction_id == top.id)
    assert report.overall_match == top.fit_score
    assert report.comparison_dimensions
    assert report.chart_series
    assert report.action_advices
    assert report.evidence_cards
    assert report.narrative.overall_review


def test_major_exploration_exposes_agentic_pipeline() -> None:
    plan = build_major_exploration_plan(
        ExplorationRequest(major="软件工程", interests=["AI 应用"])
    )

    agent_names = [item.agent_name for item in plan.agent_steps]

    assert agent_names == [
        "MajorScopeAgent",
        "KnowledgeMapAgent",
        "Profile12Agent",
        "DirectionMatchAgent",
        "GapDiagnosisAgent",
        "SnailPathAgent",
        "CoachReportAgent",
    ]
    assert all(item.status == "done" for item in plan.agent_steps)
    assert plan.agent_steps[3].output_count == len(plan.match_reports)
    assert all(item.started_at for item in plan.agent_steps)
    assert all(item.completed_at for item in plan.agent_steps)
    assert all(item.duration_ms >= 1 for item in plan.agent_steps)


def test_major_exploration_uses_major_catalog_role_profiles() -> None:
    plan = build_major_exploration_plan(
        ExplorationRequest(
            major="电子信息工程",
            foundation_level="basic",
            interests=["嵌入式开发"],
        )
    )

    embedded = next(item for item in plan.career_directions if item.title == "嵌入式工程师")
    assert embedded.exploration_domain == "嵌入式开发"
    assert "C 语言" in embedded.requirement_profile.core_skills
    assert "problem_solving" in embedded.required_dimensions
    assert any("direction-" in item for item in embedded.related_knowledge_ids)


def test_major_exploration_returns_three_phase_path() -> None:
    plan = build_major_exploration_plan(
        ExplorationRequest(major="电子信息工程", weekly_hours=8)
    )

    assert [item.phase for item in plan.learning_path] == [
        "short_term",
        "mid_term",
        "long_term",
    ]
    assert len(plan.exploration_tasks) >= 4
    task_ids = {task.id for task in plan.exploration_tasks}
    for phase in plan.learning_path:
        assert set(phase.tasks) & task_ids


def test_favorite_direction_is_scoped_by_student() -> None:
    reset_exploration_store()
    plan = build_major_exploration_plan(ExplorationRequest(major="软件工程"))
    direction_id = plan.career_directions[0].id

    favorite = create_favorite_direction(
        student_id="stu_a",
        plan=plan,
        direction_id=direction_id,
    )

    assert favorite.direction.id == direction_id
    assert [item.favorite_id for item in list_favorite_directions("stu_a")] == [
        favorite.favorite_id
    ]
    assert list_favorite_directions("stu_b") == []


def test_workspace_tracks_task_completion_and_phase_progress() -> None:
    reset_exploration_store()
    plan = build_major_exploration_plan(ExplorationRequest(major="软件工程"))
    workspace = create_exploration_workspace(
        student_id="stu_a",
        plan=plan,
        direction_id=plan.career_directions[0].id,
    )
    first_task = workspace.phases[0].tasks[0]

    updated = update_workspace_task(
        workspace_id=workspace.workspace_id,
        task_id=first_task.id,
        status="done",
        note="完成了关系图",
    )

    assert updated.phases[0].tasks[0].status == "done"
    assert updated.phases[0].tasks[0].note == "完成了关系图"
    assert updated.phases[0].progress_percent > 0


def test_workspace_review_and_growth_report() -> None:
    reset_exploration_store()
    plan = build_major_exploration_plan(ExplorationRequest(major="软件工程"))
    workspace = create_exploration_workspace(
        student_id="stu_a",
        plan=plan,
        direction_id=plan.career_directions[0].id,
    )

    reviewed = add_workspace_review(
        workspace_id=workspace.workspace_id,
        review_type="weekly",
        phase="short_term",
        summary="数据结构有点卡，但小任务挺有意思。",
    )
    report = build_growth_report(workspace.workspace_id)

    assert reviewed.reviews[0].next_actions
    assert "专业探索成长报告" in report.title
    assert "数据结构有点卡" in report.markdown


def test_workspace_profile_update_versions_and_report() -> None:
    reset_exploration_store()
    plan = build_major_exploration_plan(ExplorationRequest(major="软件工程"))
    workspace = create_exploration_workspace(
        student_id="stu_a",
        plan=plan,
        direction_id=plan.career_directions[0].id,
    )

    updated = update_workspace_profile(
        workspace_id=workspace.workspace_id,
        dimension_key="professional_skills",
        values=["Python", "SQL", "React"],
        note="补充课堂外自学技能",
    )
    report = build_growth_report(workspace.workspace_id)

    assert updated.profile.professional_skills == ["Python", "SQL", "React"]
    assert updated.profile_versions[0].changed_dimension == "professional_skills"
    assert "React" in report.markdown
    assert "画像更新记录" in report.markdown


def test_workspace_resource_status_and_report() -> None:
    plan = build_major_exploration_plan(ExplorationRequest(major="软件工程"))
    workspace = create_exploration_workspace(
        student_id="stu_a",
        plan=plan,
        direction_id=plan.career_directions[0].id,
    )
    resource = workspace.resources[0]

    assert resource.source_key
    assert resource.source_name
    assert resource.logo_hint
    assert resource.quality_score >= 70
    assert resource.resource_type in {"article", "course", "video", "search"}

    opened = update_workspace_resource(
        workspace_id=workspace.workspace_id,
        resource_id=resource.resource_id,
        status="opened",
    )
    completed = update_workspace_resource(
        workspace_id=workspace.workspace_id,
        resource_id=resource.resource_id,
        status="completed",
    )
    report = build_growth_report(workspace.workspace_id)

    assert opened.resources[0].status == "opened"
    assert completed.resources[0].status == "completed"
    assert completed.resources[0].opened_at is not None
    assert completed.resources[0].completed_at is not None
    assert "学习资源使用记录" in report.markdown
    assert resource.title in report.markdown


def test_workspace_resources_include_multiple_sources_when_possible() -> None:
    plan = build_major_exploration_plan(ExplorationRequest(major="软件工程"))
    workspace = create_exploration_workspace(
        student_id="stu_a",
        plan=plan,
        direction_id=plan.career_directions[0].id,
    )

    sources = {item.source_key for item in workspace.resources}

    assert workspace.resources
    assert workspace.match_report is not None
    assert workspace.agent_steps
    assert all(item.quality_score > 0 for item in workspace.resources)
    assert all(item.source_name in item.reason for item in workspace.resources)
    assert len(sources) >= 2


def test_exploration_coach_suggests_next_actions() -> None:
    plan = build_major_exploration_plan(
        ExplorationRequest(major="软件工程", interests=["Web 开发"])
    )
    workspace = create_exploration_workspace(
        student_id="stu_a",
        plan=plan,
        direction_id=plan.career_directions[0].id,
    )

    coach = build_exploration_coach_response(
        workspace_id=workspace.workspace_id,
        question="我不知道 Web 开发适不适合我",
        tone="diagnose",
    )

    assert coach.workspace_id == workspace.workspace_id
    assert coach.direction_title == workspace.favorite.direction.title
    assert coach.tone == "diagnose"
    assert len(coach.suggestions) >= 3
    assert any("Web 开发" in item.action for item in coach.suggestions)
    assert coach.follow_up_questions


def test_growth_report_draft_and_export() -> None:
    plan = build_major_exploration_plan(ExplorationRequest(major="软件工程"))
    workspace = create_exploration_workspace(
        student_id="stu_a",
        plan=plan,
        direction_id=plan.career_directions[0].id,
    )
    custom_markdown = "# 自定义专业探索报告\n\n## 关键发现\n- 我喜欢可视化结果。"

    updated = update_growth_report_draft(
        workspace_id=workspace.workspace_id,
        markdown=custom_markdown,
    )
    markdown_export = export_growth_report(
        workspace_id=workspace.workspace_id,
        export_format="markdown",
    )
    html_export = export_growth_report(
        workspace_id=workspace.workspace_id,
        export_format="html",
    )

    assert updated.is_customized is True
    assert updated.markdown == custom_markdown
    assert markdown_export.filename.endswith(".md")
    assert "我喜欢可视化结果" in markdown_export.content
    assert html_export.filename.endswith(".html")
    assert "<h1>自定义专业探索报告</h1>" in html_export.content


def test_workspace_persists_across_store_instances(tmp_path) -> None:
    store_path = tmp_path / "persistent_exploration_store.sqlite3"
    use_exploration_store(SQLiteExplorationStore(store_path))
    reset_exploration_store()
    plan = build_major_exploration_plan(ExplorationRequest(major="软件工程"))
    workspace = create_exploration_workspace(
        student_id="stu_a",
        plan=plan,
        direction_id=plan.career_directions[0].id,
    )

    use_exploration_store(SQLiteExplorationStore(store_path))
    restored = build_growth_report(workspace.workspace_id)

    assert store_path.exists()
    assert restored.workspace_id == workspace.workspace_id
    assert workspace.favorite.direction.title in restored.title
