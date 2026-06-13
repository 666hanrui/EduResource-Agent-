from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.student_business import build_student_business_router
from app.core.context import AppContext
from app.services.resource_package_store import SQLiteResourcePackageStore
from app.services.student_business import SQLiteStudentBusinessStore
from app.services.student_learning_store import SQLiteStudentLearningStore


def _client(tmp_path: Path) -> TestClient:
    app = FastAPI()
    learning_store = SQLiteStudentLearningStore(tmp_path / "student_learning.sqlite3")
    package_store = SQLiteResourcePackageStore(tmp_path / "resource_packages.sqlite3")
    business_store = SQLiteStudentBusinessStore(tmp_path / "student_business.sqlite3")
    # The student business router does not call ctx today; pass a light object so
    # tests do not require LLM/API settings just to exercise persistence routes.
    ctx = cast(AppContext, SimpleNamespace())
    app.include_router(
        build_student_business_router(
            ctx,
            resource_package_store=package_store,
            student_learning_store=learning_store,
            student_business_store=business_store,
        )
    )
    return TestClient(app)


def test_profile_patch_writes_history(tmp_path: Path) -> None:
    client = _client(tmp_path)

    default_profile = client.get("/api/students/stu_001/profile")
    assert default_profile.status_code == 200
    assert default_profile.json()["student_id"] == "stu_001"

    patched = client.patch(
        "/api/students/stu_001/profile",
        json={
            "learning_goal": "掌握链表并完成一次互动课堂验证",
            "learning_style": "图解 + 代码案例",
            "resource_preference": ["互动课堂", "B站视频"],
            "note": "pytest manual profile update",
        },
    )
    assert patched.status_code == 200
    assert patched.json()["learning_goal"] == "掌握链表并完成一次互动课堂验证"

    history = client.get("/api/students/stu_001/profile/history")
    assert history.status_code == 200
    records = history.json()
    assert records
    assert records[0]["source_type"] == "manual"
    assert records[0]["note"] == "pytest manual profile update"


def test_exploration_session_persists_profile_and_learning_path(tmp_path: Path) -> None:
    client = _client(tmp_path)

    response = client.post(
        "/api/students/stu_001/exploration-sessions",
        json={
            "student_id": "ignored_by_path",
            "major": "计算机科学与技术",
            "grade": "大一",
            "education_level": "本科",
            "foundation_level": "beginner",
            "interests": ["AI 应用", "Web 开发"],
            "weekly_hours": 6,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["session"]["student_id"] == "stu_001"
    assert body["session"]["recommended_directions"]
    assert body["plan"]["recommended_knowledge"]

    session_id = body["session"]["session_id"]
    stored_session = client.get(f"/api/students/stu_001/exploration-sessions/{session_id}")
    assert stored_session.status_code == 200
    assert stored_session.json()["session_id"] == session_id

    profile = client.get("/api/students/stu_001/profile")
    assert profile.status_code == 200
    assert "计算机科学与技术" in profile.json()["professional_background"]
    assert profile.json()["knowledge_mastery"]

    path = client.get("/api/students/stu_001/learning-path")
    assert path.status_code == 200
    assert path.json()["steps"]


def test_learning_path_step_patch_and_report(tmp_path: Path) -> None:
    client = _client(tmp_path)

    created = client.post(
        "/api/students/stu_001/exploration-sessions",
        json={
            "student_id": "stu_001",
            "major": "软件工程",
            "grade": "大二",
            "education_level": "本科",
            "foundation_level": "basic",
            "interests": ["数据结构", "AI Agent"],
            "weekly_hours": 8,
        },
    )
    assert created.status_code == 200

    path = client.get("/api/students/stu_001/learning-path").json()
    step_id = path["steps"][0]["step_id"]

    patched = client.patch(
        f"/api/students/stu_001/learning-path/steps/{step_id}",
        json={
            "status": "in_progress",
            "evidence": "pytest marked this step as in progress",
            "mastery_after": 35,
            "updated_reason": "pytest path update",
        },
    )
    assert patched.status_code == 200
    patched_path = patched.json()
    assert patched_path["steps"][0]["status"] == "in_progress"
    assert patched_path["adjustment_history"]

    report = client.post(
        "/api/students/stu_001/reports",
        json={"student_id": "stu_001", "report_type": "student_growth"},
    )
    assert report.status_code == 200
    report_body = report.json()
    assert report_body["report_type"] == "student_growth"
    assert "当前画像摘要" in report_body["content_markdown"]
    assert "学习路径进度" in report_body["content_markdown"]

    fetched = client.get(f"/api/students/stu_001/reports/{report_body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == report_body["id"]


def test_legacy_exploration_plan_endpoint_also_persists(tmp_path: Path) -> None:
    client = _client(tmp_path)

    plan = client.post(
        "/api/exploration/plan",
        json={
            "student_id": "stu_legacy",
            "major": "计算机科学与技术",
            "grade": "大一",
            "education_level": "本科",
            "foundation_level": "beginner",
            "interests": ["Web 开发"],
            "weekly_hours": 5,
        },
    )
    assert plan.status_code == 200
    assert plan.json()["recommended_knowledge"]

    profile = client.get("/api/students/stu_legacy/profile")
    assert profile.status_code == 200
    assert profile.json()["current_progress"]["last_exploration_session_id"].startswith("explore_")

    path = client.get("/api/students/stu_legacy/learning-path")
    assert path.status_code == 200
    assert path.json()["steps"]
