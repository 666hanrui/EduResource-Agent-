from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from app.agents.generate_flow import GenerateOutputs
from app.api import routes as routes_module
from app.api.routes import build_router
from app.schemas.profile import CitedSource, Rationale
from app.schemas.resource import DocumentBody, DocumentResult, DocumentSection, ExerciseResult, Question
from app.services.generate_store import SQLiteGenerateStore
from app.services.teacher_store import SQLiteTeacherStore


class _FakeEventBus:
    async def close_task(self, task_id: str) -> None:
        return None


class _FakeOrchestrator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    async def run_generate(self, task_id: str, payload: object) -> GenerateOutputs:
        self.calls.append((task_id, payload))
        return _fake_outputs()


@pytest.fixture
def teacher_app(tmp_path, monkeypatch) -> tuple[FastAPI, _FakeOrchestrator]:
    monkeypatch.setattr(
        routes_module,
        "_TEACHER_STORE",
        SQLiteTeacherStore(tmp_path / "teacher_store.sqlite3"),
    )
    monkeypatch.setattr(
        routes_module,
        "_GENERATE_STORE",
        SQLiteGenerateStore(tmp_path / "generate_store.sqlite3"),
    )
    monkeypatch.setattr(routes_module, "_GENERATE_OUTPUT_CACHE", {})

    orchestrator = _FakeOrchestrator()
    app = FastAPI()
    app.include_router(
        build_router(
            SimpleNamespace(
                orchestrator=orchestrator,
                event_bus=_FakeEventBus(),
            )
        )
    )
    return app, orchestrator


@pytest.mark.asyncio
async def test_teacher_dashboard_comes_from_teacher_store(teacher_app) -> None:
    app, _ = teacher_app
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/teachers/tch_001/dashboard?class_id=class-ds-boost")

    assert response.status_code == 200
    data = response.json()
    assert data["teacher_context"]["teacher_id"] == "tch_001"
    assert data["active_class"]["class_id"] == "class-ds-boost"
    assert data["attention_queue"][0]["id"] == "stu_018"
    assert len(data["recent_packages"]) == 1
    assert data["recent_packages"][0]["target_student_id"] == "stu_018"
    assert data["recent_packages"][0]["results"]["document"]["document"]["title"] == "二叉树遍历补救讲义"
    assert any(item["type"] == "Document" for item in data["review_items"])


@pytest.mark.asyncio
async def test_teacher_package_generation_uses_teacher_boundary_and_persists_review(teacher_app) -> None:
    app, orchestrator = teacher_app
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        create_response = await client.post(
            "/api/teachers/tch_001/classes/class-ds-boost/teaching-packages",
            json={
                "target_knowledge_id": "binary-tree-traversal",
                "target_knowledge_name": "二叉树遍历",
                "teaching_goal": "为高风险学生生成一套低难度、可视化优先的补救资源包",
                "target_student_id": "stu_018",
                "difficulty": 2,
                "exercise_count": 6,
                "languages": ["python", "java"],
            },
        )

        assert create_response.status_code == 200
        created = create_response.json()
        await _wait_for_orchestrator_call(orchestrator)

        _, payload = orchestrator.calls[0]
        assert payload.conversation == []
        assert payload.prior_profile is not None
        assert payload.selection_context.source == "teacher_console"
        assert payload.selection_context.reason.startswith("为高风险学生")
        assert payload.exercise_count == 6

        job = await _wait_for_job(
            client,
            f"/api/teachers/tch_001/classes/class-ds-boost/teaching-packages/{created['job_id']}",
        )

        assert job["status"] == "succeeded"
        assert job["results"]["document"]["document"]["title"] == "二叉树遍历补救讲义"
        assert job["review_items"][0]["package_id"] == created["teaching_package_id"]
        assert job["review_items"][0]["student"] == "stu_018"

        task_results = await client.get(f"/api/tasks/{created['generate_task_id']}/results")
        assert task_results.status_code == 200
        assert task_results.json()["exercise"]["questions"][0]["qid"] == "q1"


@pytest.mark.asyncio
async def test_teacher_package_rejects_wrong_class_and_student(teacher_app) -> None:
    app, _ = teacher_app
    transport = httpx.ASGITransport(app=app)
    payload = {
        "target_knowledge_id": "binary-tree-traversal",
        "target_knowledge_name": "二叉树遍历",
        "teaching_goal": "生成补救课",
        "target_student_id": "stu_018",
        "difficulty": 2,
    }

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        wrong_class = await client.post(
            "/api/teachers/tch_001/classes/class-se-2301/teaching-packages",
            json=payload,
        )
        wrong_teacher = await client.post(
            "/api/teachers/tch_unknown/classes/class-ds-boost/teaching-packages",
            json=payload,
        )

    assert wrong_class.status_code == 403
    assert wrong_teacher.status_code == 404


@pytest.mark.asyncio
async def test_teacher_pptx_export_uses_ready_teacher_package(teacher_app, tmp_path, monkeypatch) -> None:
    app, _ = teacher_app
    output_path = tmp_path / "seed.pptx"
    output_path.write_bytes(b"pptx")
    calls: list[dict] = []

    def fake_build_teacher_pptx(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(path=output_path, filename="seed.pptx")

    monkeypatch.setattr(routes_module, "build_teacher_pptx", fake_build_teacher_pptx)
    transport = httpx.ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/teachers/tch_001/classes/class-ds-boost/teaching-packages/pkg_seed_binary_tree/pptx"
        )

    assert response.status_code == 200
    assert response.content == b"pptx"
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
    assert calls[0]["package_id"] == "pkg_seed_binary_tree"
    assert calls[0]["target_knowledge_name"] == "二叉树遍历"
    assert calls[0]["results"]["document"]["document"]["title"] == "二叉树遍历补救讲义"


async def _wait_for_job(client: httpx.AsyncClient, path: str) -> dict:
    for _ in range(20):
        response = await client.get(path)
        assert response.status_code == 200
        data = response.json()
        if data["status"] == "succeeded":
            return data
        await asyncio.sleep(0.01)
    raise AssertionError("teacher job did not succeed")


async def _wait_for_orchestrator_call(orchestrator: _FakeOrchestrator) -> None:
    for _ in range(20):
        if orchestrator.calls:
            return
        await asyncio.sleep(0.01)
    raise AssertionError("orchestrator was not called")


def _fake_outputs() -> GenerateOutputs:
    rationale = Rationale(
        matched_profile=["学习风格：图解 + 分步骤"],
        addressed_weakness=["递归栈顺序混乱"],
        difficulty_adjusted_from=3,
        difficulty_used=2,
        agent_name="DocumentAgent",
        prompt_version="document_agent_v1",
        model_name="test-model",
        cited_sources=[CitedSource(title="数据结构讲义", page="42", similarity=0.9)],
    )
    return GenerateOutputs(
        document=DocumentResult(
            document=DocumentBody(
                title="二叉树遍历补救讲义",
                sections=[DocumentSection(heading="递归栈", body_md="分步骤理解递归栈。")],
                key_diagrams=[],
            ),
            rationale=rationale,
        ),
        exercise=ExerciseResult(
            questions=[
                Question(
                    qid="q1",
                    type="single_choice",
                    stem="先序遍历首先访问什么？",
                    options=["根", "左子树", "右子树"],
                    answer="根",
                    explanation="先序遍历顺序是根左右。",
                    tags=["二叉树"],
                    difficulty=2,
                    expected_time_sec=30,
                )
            ],
            rationale=rationale.model_copy(update={"agent_name": "ExerciseAgent", "prompt_version": "exercise_agent_v1"}),
        ),
    )
