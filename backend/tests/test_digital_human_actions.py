from __future__ import annotations

from app.services.digital_human_actions import (
    list_digital_human_actions,
    list_knowledge_shortcuts,
)


def test_digital_human_actions_cover_core_feature_domains() -> None:
    actions = list_digital_human_actions()
    ids = {item.action_id for item in actions}
    domains = {item.domain for item in actions}

    assert {"navigation", "exploration", "generation", "workspace", "report"} <= domains
    assert "exploration.build_plan" in ids
    assert "generation.start" in ids
    assert "workspace.ask_coach" in ids
    assert "report.export" in ids
    assert all(item.title and item.endpoint and item.success_feedback for item in actions)


def test_digital_human_write_actions_require_clear_params() -> None:
    actions = list_digital_human_actions()
    write_actions = [item for item in actions if item.risk == "write"]

    assert write_actions
    assert all(item.required_params for item in write_actions)
    assert any(item.confirmation_required for item in write_actions)


def test_digital_human_knowledge_shortcuts_are_backend_catalog() -> None:
    shortcuts = list_knowledge_shortcuts()
    names = {item.knowledge_name for item in shortcuts}

    assert {"链表", "二叉树遍历", "动态规划", "哈希表"} <= names
    assert all(item.knowledge_id and item.keywords for item in shortcuts)
