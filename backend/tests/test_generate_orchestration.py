from __future__ import annotations

import asyncio
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI

from app.agents.generate_flow import (
    GenerateOutputs,
    GenerateSelectionContext,
    _apply_selection_context,
    _selection_context_turns,
)
from app.api.routes import build_router
from app.schemas.resource import ResourceTaskParams


class _FakeEventBus:
    async def close_task(self, task_id: str) -> None:
        return None


class _FakeOrchestrator:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []
        self.called = asyncio.Event()

    async def run_generate(self, task_id: str, payload: object) -> GenerateOutputs:
        self.calls.append((task_id, payload))
        self.called.set()
        return GenerateOutputs()


@pytest.mark.asyncio
async def test_generate_endpoint_dispatches_through_orchestrator() -> None:
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

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/generate",
            json={
                "student_id": "stu_001",
                "knowledge_id": "core-data-structure",
                "knowledge_name": "数据结构",
            },
        )

    assert response.status_code == 200
    await asyncio.wait_for(orchestrator.called.wait(), timeout=1)
    assert orchestrator.calls
    _, payload = orchestrator.calls[0]
    assert payload.knowledge_id == "core-data-structure"


def test_selection_context_becomes_profile_conversation_turn() -> None:
    turns = _selection_context_turns(
        GenerateSelectionContext(
            source="exploration",
            reason="该知识点连接 AI 应用方向的首个验证任务",
            suggested_difficulty=2,
        )
    )

    assert len(turns) == 1
    assert turns[0].role == "student"
    assert "AI 应用方向" in turns[0].text
    assert "建议难度 2" in turns[0].text


def test_selection_context_guides_downstream_resource_params() -> None:
    params = ResourceTaskParams(
        difficulty=4,
        focus="数据结构",
        style_hint="step_by_step",
        reason="planner reason",
    )

    next_params = _apply_selection_context(
        params,
        GenerateSelectionContext(
            source="exploration",
            reason="学生从专业探索中选择，因为它支撑 Web 开发方向",
            suggested_difficulty=2,
        ),
    )

    assert next_params.difficulty == 2
    assert next_params.focus == "数据结构"
    assert "Web 开发方向" in next_params.reason
