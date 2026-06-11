from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from app.api.routes import build_router
from app.services.resource_package_store import SQLiteResourcePackageStore
from app.services.student_learning_store import SQLiteStudentLearningStore
from tests.test_openmaic_import import _sample_import_payload


def _app_with_store(tmp_path) -> FastAPI:
    store = SQLiteResourcePackageStore(tmp_path / "resource_packages.sqlite3")
    learning_store = SQLiteStudentLearningStore(tmp_path / "student_learning.sqlite3")
    app = FastAPI()
    app.include_router(
        build_router(
            SimpleNamespace(),
            resource_package_store=store,
            student_learning_store=learning_store,
        )
    )
    app.state.learning_store = learning_store
    return app


@pytest.mark.asyncio
async def test_openmaic_quiz_attempts_create_attempts_and_evaluation(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        assert imported.status_code == 200

        response = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_openmaic_001",
                "student_id": "stu_001",
                "source_classroom_id": "omc_stage_001",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [
                    {
                        "question_id": "q1",
                        "user_answer": "A",
                        "time_spent_sec": 42,
                    },
                    {
                        "question_id": "q2",
                        "user_answer": ["C"],
                        "time_spent_sec": 75,
                    },
                ],
            },
        )
        fetched = await client.get(
            "/api/resource-packages/pkg_openmaic_001/attempts",
            params={"student_id": "stu_001"},
        )

    assert response.status_code == 200
    data = response.json()
    attempts = data["attempts"]
    evaluation = data["evaluation"]

    assert [attempt["is_correct"] for attempt in attempts] == [True, False]
    assert attempts[0]["exercise_item_id"] == "exset_pkg_openmaic_001:scene_quiz_1:q1"
    assert attempts[0]["user_answer"] == "A"
    assert attempts[1]["user_answer"] == "C"
    assert evaluation["student_id"] == "stu_001"
    assert evaluation["package_id"] == "pkg_openmaic_001"
    assert evaluation["attempt_ids_json"] == [attempt["id"] for attempt in attempts]
    assert evaluation["mastery_delta_json"]["knowledge_id"] == "graph-shortest-path"
    assert evaluation["mastery_delta_json"]["knowledge_name"] == "最短路径"
    assert evaluation["mastery_delta_json"]["observed_correct_rate"] == 0.5
    assert evaluation["mastery_delta_json"]["estimated_mastery"] == 0.5
    assert evaluation["mastery_delta_json"]["new_weakness"] == ["哪些条件适合使用 Dijkstra？"]
    assert evaluation["mastery_delta_json"]["resolved_weakness"] == []
    assert evaluation["mastery_delta_json"]["next_difficulty_recommendation"] == 2
    assert evaluation["mastery_delta_json"]["next_focus"] == "继续回到「最短路径」的阶段验证，优先复盘：哪些条件适合使用 Dijkstra？。"
    assert evaluation["mastery_delta_json"]["tags"] == [
        "graph-shortest-path",
        "最短路径",
        "stage_validation",
    ]
    assert evaluation["mastery_delta_json"]["fit_reason"] == "OpenMAIC 阶段验证题回写：最短路径 答对 1/2。"
    assert evaluation["mastery_delta_json"]["stage_validation"] == {
        "mode": "openmaic_quiz",
        "source_classroom_id": "omc_stage_001",
        "quiz_scene_id": "scene_quiz_1",
        "question_count": 2,
        "package_title": "最短路径互动课堂",
    }
    assert evaluation["mastery_delta_json"]["openmaic_summary"] == {
        "correct_count": 1,
        "total_count": 2,
        "correct_rate": 0.5,
    }
    assert evaluation["weakness_delta_json"]["wrong_exercise_item_ids"] == [
        "exset_pkg_openmaic_001:scene_quiz_1:q2"
    ]
    assert evaluation["weakness_delta_json"]["wrong_concepts"] == ["哪些条件适合使用 Dijkstra？"]
    assert "1/2" in evaluation["feedback_markdown"]

    assert fetched.status_code == 200
    fetched_data = fetched.json()
    assert len(fetched_data["attempts"]) == 2
    assert fetched_data["evaluations"][0]["id"] == evaluation["id"]


@pytest.mark.asyncio
async def test_openmaic_quiz_attempts_update_student_dashboard_profile_and_path(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        assert imported.status_code == 200

        response = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_openmaic_001",
                "student_id": "stu_001",
                "source_classroom_id": "omc_stage_001",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [
                    {"question_id": "q1", "user_answer": "A"},
                    {"question_id": "q2", "user_answer": "C"},
                ],
            },
        )
        dashboard = await client.get("/api/students/stu_001/dashboard")

    assert response.status_code == 200
    assert dashboard.status_code == 200
    data = dashboard.json()
    evaluation = response.json()["evaluation"]
    assert data["profile"]["knowledge_mastery"]["graph-shortest-path"] == 50
    assert "graph-shortest-path" in data["profile"]["mistake_points"]
    assert "哪些条件适合使用 Dijkstra？" in data["profile"]["mistake_points"]
    assert data["recent_evaluations"][0]["id"] == evaluation["id"]
    assert data["training_plan"]["stages"][0]["validation_question"]["target_knowledge_id"] == "graph-shortest-path"
    assert [stage["status"] for stage in data["training_plan"]["stages"]] == [
        "needs_review",
        "recommended",
        "recommended",
    ]

    path = data["learning_path"]
    assert path["steps"][0]["package_id"] == "pkg_openmaic_001"
    assert path["steps"][0]["evaluation_id"] == evaluation["id"]
    assert path["steps"][0]["mastery_after"] == 50
    assert path["steps"][0]["status"] == "adjusted"


@pytest.mark.asyncio
async def test_openmaic_quiz_attempts_reject_unknown_question_id(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        assert imported.status_code == 200

        response = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_openmaic_001",
                "student_id": "stu_001",
                "source_classroom_id": "omc_stage_001",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [
                    {
                        "question_id": "missing_question",
                        "user_answer": "A",
                    }
                ],
            },
        )

    assert response.status_code == 404
    assert "exercise item not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_openmaic_quiz_attempts_reject_student_owner_mismatch(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        assert imported.status_code == 200

        response = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_openmaic_001",
                "student_id": "stu_999",
                "source_classroom_id": "omc_stage_001",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [{"question_id": "q1", "user_answer": "A"}],
            },
        )

    assert response.status_code == 403
    assert "student does not own resource package" in response.json()["detail"]


@pytest.mark.asyncio
async def test_openmaic_quiz_attempts_reject_non_student_owned_package(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    teacher_payload = _sample_import_payload()
    teacher_payload.pop("student_id")
    teacher_payload["teacher_id"] = "teacher_001"
    teacher_payload["resource_package_id"] = "pkg_teacher_001"

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=teacher_payload,
        )
        assert imported.status_code == 200

        response = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_teacher_001",
                "student_id": "stu_001",
                "source_classroom_id": "omc_stage_001",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [{"question_id": "q1", "user_answer": "A"}],
            },
        )

    assert response.status_code == 403
    assert "quiz attempt writeback requires a student-owned resource package" in response.json()["detail"]


@pytest.mark.asyncio
async def test_openmaic_quiz_attempts_reject_source_classroom_mismatch(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        assert imported.status_code == 200

        response = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_openmaic_001",
                "student_id": "stu_001",
                "source_classroom_id": "other_stage",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [{"question_id": "q1", "user_answer": "A"}],
            },
        )

    assert response.status_code == 400
    assert "source classroom does not match resource package" in response.json()["detail"]


@pytest.mark.asyncio
async def test_openmaic_quiz_attempts_reject_empty_answers(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        assert imported.status_code == 200

        response = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_openmaic_001",
                "student_id": "stu_001",
                "source_classroom_id": "omc_stage_001",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [],
            },
        )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_openmaic_quiz_attempts_reject_blank_question_answer(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        assert imported.status_code == 200

        blank_string = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_openmaic_001",
                "student_id": "stu_001",
                "source_classroom_id": "omc_stage_001",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [{"question_id": "q1", "user_answer": "   "}],
            },
        )
        empty_list = await client.post(
            "/api/integrations/openmaic/exercise-attempts",
            json={
                "resource_package_id": "pkg_openmaic_001",
                "student_id": "stu_001",
                "source_classroom_id": "omc_stage_001",
                "quiz_scene_id": "scene_quiz_1",
                "answers": [{"question_id": "q1", "user_answer": []}],
            },
        )

    assert blank_string.status_code == 422
    assert empty_list.status_code == 422


@pytest.mark.asyncio
async def test_openmaic_quiz_attempt_history_requires_student_id(tmp_path) -> None:
    app = _app_with_store(tmp_path)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        imported = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        assert imported.status_code == 200

        response = await client.get("/api/resource-packages/pkg_openmaic_001/attempts")

    assert response.status_code == 422
