from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.agents.generate_flow import GenerateOutputs, GenerateRequest
from app.api.main_agent_business import build_main_agent_business_router
from app.core.context import AppContext
from app.schemas.student import InteractiveClassroomJob
from app.services.generate_store import SQLiteGenerateStore
from app.services.student_learning_store import SQLiteStudentLearningStore
from app.services.teacher_store import SQLiteTeacherStore

import app.api.main_agent_business as main_agent_business


class FakeOrchestrator:
    def __init__(self, learning_store: SQLiteStudentLearningStore) -> None:
        self.learning_store = learning_store
        self.calls: list[tuple[str, GenerateRequest, int]] = []

    async def run_tool_calling(
        self,
        task_id: str,
        payload: GenerateRequest,
        *,
        max_tool_calls: int = 12,
    ) -> GenerateOutputs:
        self.calls.append((task_id, payload, max_tool_calls))
        outputs = GenerateOutputs()
        setattr(outputs, "external", {})
        external: dict[str, Any] = getattr(outputs, "external")

        if payload.selection_context and payload.selection_context.source == "exploration":
            now = datetime.now(timezone.utc)
            job = InteractiveClassroomJob(
                job_id="ic_test_001",
                student_id=payload.student_id,
                resource_package_id="pkg_test_001",
                openmaic_job_id="om_test_001",
                status="running",
                classroom_url=None,
                package_url="/api/resource-packages/pkg_test_001",
                message="created by fake MainAgent",
                created_at=now,
                updated_at=now,
            )
            self.learning_store.save_job(job)
            external["openmaic_classroom"] = {
                "job_id": job.job_id,
                "student_id": job.student_id,
                "resource_package_id": job.resource_package_id,
                "openmaic_job_id": job.openmaic_job_id,
                "status": job.status,
                "package_url": job.package_url,
            }
        else:
            external["run_generate_flow"] = {"status": "ok", "knowledge_id": payload.knowledge_id}
        return outputs


def _client(tmp_path: Path) -> tuple[TestClient, FakeOrchestrator]:
    generate_store = SQLiteGenerateStore(tmp_path / "generate.sqlite3")
    learning_store = SQLiteStudentLearningStore(tmp_path / "student_learning.sqlite3")
    teacher_store = SQLiteTeacherStore(tmp_path / "teacher.sqlite3")

    main_agent_business._GENERATE_STORE = generate_store
    main_agent_business._RESULT_CACHE = generate_store.load_all()
    main_agent_business._LEARNING_STORE = learning_store
    main_agent_business._TEACHER_STORE = teacher_store

    orchestrator = FakeOrchestrator(learning_store)
    ctx = cast(AppContext, SimpleNamespace(orchestrator=orchestrator))
    app = FastAPI()
    app.include_router(build_main_agent_business_router(ctx))
    return TestClient(app), orchestrator


def test_main_agent_generate_persists_external_results(tmp_path: Path) -> None:
    client, orchestrator = _client(tmp_path)

    created = client.post(
        "/api/main-agent/generate",
        json={
            "student_id": "stu_001",
            "knowledge_id": "linked-list-basics",
            "knowledge_name": "链表",
            "selection_context": {
                "source": "manual",
                "reason": "只需要轻量资源",
                "suggested_difficulty": 2,
            },
        },
    )

    assert created.status_code == 200
    task_id = created.json()["task_id"]
    assert orchestrator.calls

    results = client.get(f"/api/main-agent/tasks/{task_id}/results")
    assert results.status_code == 200
    body = results.json()
    assert body["external"]["run_generate_flow"]["status"] == "ok"
    assert body["errors"] == {}


def test_student_interactive_classroom_enters_main_agent(tmp_path: Path) -> None:
    client, orchestrator = _client(tmp_path)

    response = client.post(
        "/api/students/stu_main/interactive-classrooms",
        json={
            "target_knowledge_id": "linked-list-basics",
            "target_knowledge_name": "链表",
            "learning_goal": "通过互动课堂验证链表理解",
            "selection_context": {
                "source": "exploration",
                "reason": "探索路径推荐进入课堂验证",
            },
            "difficulty": 3,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == "ic_test_001"
    assert body["openmaic_job_id"] == "om_test_001"
    assert body["resource_package_id"] == "pkg_test_001"
    assert orchestrator.calls[0][1].selection_context is not None
    assert orchestrator.calls[0][1].selection_context.source == "exploration"


def test_task_results_endpoint_is_external_aware(tmp_path: Path) -> None:
    client, _orchestrator = _client(tmp_path)

    created = client.post(
        "/api/main-agent/generate",
        json={
            "student_id": "stu_002",
            "knowledge_id": "binary-tree-traversal",
            "knowledge_name": "二叉树遍历",
            "selection_context": {
                "source": "manual",
                "reason": "轻量复习",
            },
        },
    )
    task_id = created.json()["task_id"]

    compat_results = client.get(f"/api/tasks/{task_id}/results")
    assert compat_results.status_code == 200
    assert "external" in compat_results.json()
