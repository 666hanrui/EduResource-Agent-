from __future__ import annotations

from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from app.api.routes import build_router
from app.services.resource_package_store import SQLiteResourcePackageStore


def _sample_import_payload() -> dict:
    return {
        "source_classroom_id": "omc_stage_001",
        "resource_package_id": "pkg_openmaic_001",
        "student_id": "stu_001",
        "target_knowledge_id": "graph-shortest-path",
        "target_knowledge_name": "最短路径",
        "profile_snapshot_id": "profile_20260604",
        "difficulty": 3,
        "stage": {
            "id": "omc_stage_001",
            "name": "最短路径互动课堂",
            "description": "从校园导航问题理解 Dijkstra 算法",
        },
        "scenes": [
            {
                "id": "scene_slide_1",
                "type": "slide",
                "title": "校园路径问题",
                "order": 0,
                "content": {"type": "slide", "canvas": {"elements": []}},
            },
            {
                "id": "scene_interactive_1",
                "type": "interactive",
                "title": "拖动节点观察最短路径",
                "order": 1,
                "content": {"type": "interactive", "html": "<main>demo</main>"},
            },
            {
                "id": "scene_pbl_1",
                "type": "pbl",
                "title": "设计校园导航助手",
                "order": 2,
                "content": {"type": "pbl", "projectConfig": {"title": "导航助手"}},
            },
            {
                "id": "scene_quiz_1",
                "type": "quiz",
                "title": "课堂检测",
                "order": 3,
                "content": {
                    "type": "quiz",
                    "questions": [
                        {
                            "id": "q1",
                            "type": "single",
                            "question": "Dijkstra 算法每轮选择哪个节点？",
                            "options": [
                                {"label": "A", "value": "距离起点最近的未确定节点"},
                                {"label": "B", "value": "编号最大的节点"},
                            ],
                            "answer": ["A"],
                            "analysis": "每轮选择当前距离起点最近且尚未确定的节点。",
                        },
                        {
                            "id": "q2",
                            "type": "multiple",
                            "question": "哪些条件适合使用 Dijkstra？",
                            "options": [
                                {"label": "A", "value": "非负权图"},
                                {"label": "B", "value": "需要单源最短路径"},
                                {"label": "C", "value": "负权边大量存在"},
                            ],
                            "answer": ["A", "B"],
                            "analysis": "Dijkstra 适用于非负权图的单源最短路径。",
                        },
                    ],
                },
            },
        ],
    }


@pytest.mark.asyncio
async def test_openmaic_import_maps_classroom_to_resource_package(tmp_path) -> None:
    store = SQLiteResourcePackageStore(tmp_path / "resource_packages.sqlite3")
    app = FastAPI()
    app.include_router(build_router(SimpleNamespace(), resource_package_store=store))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )

    assert response.status_code == 200
    data = response.json()
    package = data["package"]
    exercise_set = data["exercise_set"]

    assert package["id"] == "pkg_openmaic_001"
    assert package["owner_id"] == "stu_001"
    assert package["owner_role"] == "student"
    assert package["target_knowledge_id"] == "graph-shortest-path"
    assert [item["type"] for item in package["items"]] == [
        "visual",
        "interactive",
        "pbl",
        "exercise",
    ]
    assert package["items"][1]["content_json"]["openmaic_scene_id"] == "scene_interactive_1"
    assert exercise_set["package_id"] == "pkg_openmaic_001"
    assert len(exercise_set["items"]) == 2
    assert exercise_set["items"][0]["stem"] == "Dijkstra 算法每轮选择哪个节点？"
    assert exercise_set["items"][0]["answer"] == "A"
    assert exercise_set["items"][1]["answer"] == "A,B"


@pytest.mark.asyncio
async def test_openmaic_import_persists_package_for_later_reads(tmp_path) -> None:
    store = SQLiteResourcePackageStore(tmp_path / "resource_packages.sqlite3")
    app = FastAPI()
    app.include_router(build_router(SimpleNamespace(), resource_package_store=store))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/api/integrations/openmaic/resource-package",
            json=_sample_import_payload(),
        )
        fetched = await client.get("/api/resource-packages/pkg_openmaic_001")

    assert created.status_code == 200
    assert fetched.status_code == 200
    assert fetched.json()["package"]["title"] == "最短路径互动课堂"
    assert fetched.json()["exercise_set"]["items"][0]["tags"] == [
        "graph-shortest-path",
        "最短路径",
        "阶段验证",
    ]
