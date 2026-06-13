from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from app.api.routes import build_router
from app.schemas.student import StudentProfile
from app.services.resource_package_store import SQLiteResourcePackageStore
from app.services.student_learning_store import SQLiteStudentLearningStore


class FakeOpenMAICClient:
    def __init__(self) -> None:
        self.started_payloads: list[dict] = []
        self.jobs: dict[str, dict] = {}

    async def start_classroom_generation(self, payload: dict) -> dict:
        self.started_payloads.append(payload)
        job_id = f"om_job_{len(self.started_payloads)}"
        self.jobs[job_id] = {
            "jobId": job_id,
            "status": "running",
            "message": "queued in fake OpenMAIC",
            "result": None,
        }
        return {"jobId": job_id, "status": "queued", "message": "queued"}

    async def get_classroom_job(self, job_id: str) -> dict:
        return self.jobs[job_id]


class FailingOpenMAICClient:
    async def start_classroom_generation(self, payload: dict) -> dict:
        del payload
        raise RuntimeError("OpenMAIC offline")

    async def get_classroom_job(self, job_id: str) -> dict:
        del job_id
        raise RuntimeError("OpenMAIC offline")


def _app(tmp_path, fake_openmaic) -> FastAPI:
    package_store = SQLiteResourcePackageStore(tmp_path / "resource_packages.sqlite3")
    learning_store = SQLiteStudentLearningStore(tmp_path / "student_learning.sqlite3")
    app = FastAPI()
    app.include_router(
        build_router(
            SimpleNamespace(),
            resource_package_store=package_store,
            student_learning_store=learning_store,
            openmaic_client=fake_openmaic,
        )
    )
    app.state.package_store = package_store
    app.state.learning_store = learning_store
    return app


@pytest.mark.asyncio
async def test_student_interactive_classroom_creation_starts_openmaic_with_context(tmp_path) -> None:
    fake_openmaic = FakeOpenMAICClient()
    app = _app(tmp_path, fake_openmaic)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students/stu_001/interactive-classrooms",
            json={
                "student_id": "ignored_body_value",
                "target_knowledge_id": "graph-shortest-path",
                "target_knowledge_name": "最短路径",
                "learning_goal": "理解 Dijkstra 并完成课堂测验",
                "selection_context": {"source": "exploration", "reason": "专业探索推荐"},
                "difficulty": 3,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert data["student_id"] == "stu_001"
    assert data["resource_package_id"].startswith("pkg_ic_stu_001_graph-shortest-path_")
    assert data["openmaic_job_id"] == "om_job_1"
    assert data["status"] == "running"
    assert data["package_url"] == f"/api/resource-packages/{data['resource_package_id']}"

    assert len(fake_openmaic.started_payloads) == 1
    openmaic_payload = fake_openmaic.started_payloads[0]
    assert "理解 Dijkstra" in openmaic_payload["requirement"]
    assert openmaic_payload["eduResourceContext"] == {
        "mode": "student",
        "studentId": "stu_001",
        "resourcePackageId": data["resource_package_id"],
        "targetKnowledge": {"id": "graph-shortest-path", "name": "最短路径"},
        "learningGoal": "理解 Dijkstra 并完成课堂测验",
        "difficulty": 3,
        "profileSnapshot": {
            "selection_context": {
                "source": "exploration",
                "reason": "专业探索推荐",
            },
            "selection_context_reason": "专业探索推荐",
            "selection_context_source": "exploration",
            "learning_goal": "理解 Dijkstra 并完成课堂测验",
        },
        "resourcePreferences": [],
    }


@pytest.mark.asyncio
async def test_student_interactive_classroom_uses_local_fallback_when_openmaic_fails(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("EDU_OPENMAIC_FALLBACK", "1")
    app = _app(tmp_path, FailingOpenMAICClient())

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/api/students/stu_001/interactive-classrooms",
            json={
                "target_knowledge_id": "binary-tree-traversal",
                "target_knowledge_name": "二叉树遍历",
                "learning_goal": "理解递归栈并完成课堂测验",
                "difficulty": 2,
            },
        )
        package_id = created.json()["resource_package_id"]
        package = await client.get(f"/api/resource-packages/{package_id}")

    assert created.status_code == 200
    data = created.json()
    assert data["status"] == "succeeded"
    assert data["openmaic_job_id"].startswith("fallback_")
    assert data["classroom_url"] == f"/api/resource-packages/{package_id}"
    assert "local fallback classroom" in data["message"]

    assert package.status_code == 200
    imported = package.json()
    assert imported["package"]["status"] == "ready"
    assert imported["package"]["target_knowledge_id"] == "binary-tree-traversal"
    assert len(imported["package"]["items"]) >= 4
    assert imported["exercise_set"] is not None


@pytest.mark.asyncio
async def test_student_interactive_classroom_returns_502_when_fallback_disabled(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("EDU_OPENMAIC_FALLBACK", raising=False)
    app = _app(tmp_path, FailingOpenMAICClient())

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/students/stu_001/interactive-classrooms",
            json={
                "target_knowledge_id": "binary-tree-traversal",
                "target_knowledge_name": "二叉树遍历",
            },
        )

    assert response.status_code == 502
    assert "OpenMAIC generation failed" in response.json()["detail"]


@pytest.mark.asyncio
async def test_student_interactive_classroom_polling_persists_success_url(tmp_path) -> None:
    fake_openmaic = FakeOpenMAICClient()
    app = _app(tmp_path, fake_openmaic)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/api/students/stu_001/interactive-classrooms",
            json={
                "target_knowledge_id": "graph-shortest-path",
                "target_knowledge_name": "最短路径",
            },
        )
        job_id = created.json()["job_id"]
        fake_openmaic.jobs["om_job_1"] = {
            "jobId": "om_job_1",
            "status": "succeeded",
            "message": "done",
            "result": {
                "classroomId": "omc_stage_001",
                "url": "http://localhost:3100/classroom/omc_stage_001",
                "scenesCount": 4,
            },
        }
        polled = await client.get(f"/api/students/stu_001/interactive-classrooms/{job_id}")
        polled_again = await client.get(f"/api/students/stu_001/interactive-classrooms/{job_id}")

    assert polled.status_code == 200
    assert polled.json()["status"] == "succeeded"
    assert polled.json()["classroom_url"] == "http://localhost:3100/classroom/omc_stage_001"
    assert polled_again.json()["classroom_url"] == "http://localhost:3100/classroom/omc_stage_001"


@pytest.mark.asyncio
async def test_student_dashboard_returns_profile_path_packages_and_evaluations(tmp_path) -> None:
    fake_openmaic = FakeOpenMAICClient()
    app = _app(tmp_path, fake_openmaic)
    learning_store: SQLiteStudentLearningStore = app.state.learning_store
    learning_store.save_profile(
        StudentProfile(
            student_id="stu_001",
            professional_background="计算机科学与技术",
            knowledge_mastery={"graph-shortest-path": 50},
            learning_goal="理解最短路径",
            learning_style="图解 + 互动课堂",
            mistake_points=[],
            resource_preference=["互动课堂"],
            learning_pace="medium",
            current_progress={},
            created_at=learning_store.now(),
            updated_at=learning_store.now(),
        ),
        source_type="manual",
        note="test seed",
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/api/students/stu_001/interactive-classrooms",
            json={
                "target_knowledge_id": "graph-shortest-path",
                "target_knowledge_name": "最短路径",
            },
        )
        dashboard = await client.get("/api/students/stu_001/dashboard")

    assert created.status_code == 200
    assert dashboard.status_code == 200
    data = dashboard.json()
    assert data["profile"]["student_id"] == "stu_001"
    assert data["learning_path"]["steps"][0]["package_id"] == created.json()["resource_package_id"]
    assert data["recent_packages"][0]["id"] == created.json()["resource_package_id"]
    assert data["training_plan"]["title"] == "个性化培养方案"
    assert len(data["training_plan"]["stages"]) == 3
    assert [stage["status"] for stage in data["training_plan"]["stages"]] == [
        "in_progress",
        "recommended",
        "recommended",
    ]
    assert data["next_suggestions"]
