"""Lightweight in-process task manager.

This is intentionally small: it replaces scattered asyncio.create_task calls with
named tasks that record status, timestamps and errors. It is not a durable queue;
long-running jobs should eventually move to a persistent worker.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Awaitable, Literal

logger = logging.getLogger(__name__)

TaskStatus = Literal["running", "succeeded", "failed"]


@dataclass
class ManagedTask:
    task_id: str
    name: str
    status: TaskStatus
    started_at: datetime
    finished_at: datetime | None = None
    error: str | None = None


class TaskManager:
    """Tracks fire-and-forget async jobs inside the current process."""

    def __init__(self) -> None:
        self._tasks: dict[str, ManagedTask] = {}
        self._handles: dict[str, asyncio.Task[None]] = {}

    def spawn(self, task_id: str, name: str, coro: Awaitable[None]) -> ManagedTask:
        if task_id in self._handles and not self._handles[task_id].done():
            raise ValueError(f"background task already running: {task_id}")
        record = ManagedTask(
            task_id=task_id,
            name=name,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        self._tasks[task_id] = record

        async def _runner() -> None:
            try:
                await coro
                record.status = "succeeded"
            except Exception as exc:  # pragma: no cover - logged and surfaced through record
                logger.exception("background task failed task_id=%s name=%s", task_id, name)
                record.status = "failed"
                record.error = str(exc)
            finally:
                record.finished_at = datetime.now(timezone.utc)

        self._handles[task_id] = asyncio.create_task(_runner(), name=f"{name}:{task_id}")
        return record

    def get(self, task_id: str) -> ManagedTask | None:
        return self._tasks.get(task_id)

    def list_recent(self, limit: int = 50) -> list[ManagedTask]:
        return sorted(
            self._tasks.values(),
            key=lambda item: item.started_at,
            reverse=True,
        )[:limit]

    async def shutdown(self) -> None:
        pending = [handle for handle in self._handles.values() if not handle.done()]
        for handle in pending:
            handle.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)
