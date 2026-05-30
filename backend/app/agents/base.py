"""
Agent 基类、状态机、事件结构。

设计原则：
- BaseAgent 只负责生命周期（start / step / done / error）和事件发布
- 业务逻辑在子类的 _run_impl() 中实现
- 所有事件统一通过 EventBus 推送，前端按 task_id 订阅 SSE
- 状态机保证每个 Agent 实例不会重复进入同一状态
"""

from __future__ import annotations

import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from .event_bus import AgentEvent, EventBus, EventType


class AgentState(str, Enum):
    """Agent 生命周期状态机。

    转换：
        WAITING ──▶ RUNNING ──▶ STREAMING ──▶ DONE
                                ▲              │
                                └──────────────┘
                       RUNNING ──▶ ERROR  (任何阶段都可进入)
    """

    WAITING = "waiting"
    RUNNING = "running"
    STREAMING = "streaming"
    DONE = "done"
    ERROR = "error"


@dataclass
class AgentRuntime:
    """Agent 运行时状态，由 Orchestrator 维护并通过事件暴露给前端。"""

    task_id: str
    agent_name: str
    state: AgentState = AgentState.WAITING
    started_at: float | None = None
    finished_at: float | None = None
    token_used: int = 0
    error: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def elapsed_ms(self) -> int:
        if self.started_at is None:
            return 0
        end = self.finished_at or time.time()
        return int((end - self.started_at) * 1000)


InputT = TypeVar("InputT", bound=BaseModel)
OutputT = TypeVar("OutputT", bound=BaseModel)


class BaseAgent(ABC, Generic[InputT, OutputT]):
    """Agent 抽象基类。

    子类只需实现 _run_impl()，其余生命周期由基类托管。

    使用示例：
        agent = ProfileAgent(event_bus, llm_service)
        result = await agent.run(task_id, profile_input)
    """

    name: str = "BaseAgent"
    prompt_version: str = "v1"

    def __init__(self, event_bus: EventBus) -> None:
        self.event_bus = event_bus

    @abstractmethod
    async def _run_impl(self, runtime: AgentRuntime, payload: InputT) -> OutputT:
        """业务逻辑。子类实现。"""
        raise NotImplementedError

    async def run(self, task_id: str, payload: InputT) -> OutputT:
        """统一入口。负责发事件、计时、错误捕获。"""
        runtime = AgentRuntime(task_id=task_id, agent_name=self.name)
        await self._emit_start(runtime)

        try:
            runtime.state = AgentState.RUNNING
            runtime.started_at = time.time()

            result = await self._run_impl(runtime, payload)

            runtime.state = AgentState.DONE
            runtime.finished_at = time.time()
            await self._emit_done(runtime, result)
            return result

        except Exception as exc:
            runtime.state = AgentState.ERROR
            runtime.finished_at = time.time()
            runtime.error = str(exc)
            await self._emit_error(runtime, exc)
            raise

    # ─────────────────────────────── 事件发布 ───────────────────────────────

    async def _emit_start(self, runtime: AgentRuntime) -> None:
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.AGENT_START,
                task_id=runtime.task_id,
                agent=self.name,
                ts=time.time(),
                payload={"prompt_version": self.prompt_version},
            )
        )

    async def emit_delta(self, runtime: AgentRuntime, delta: dict[str, Any]) -> None:
        """供子类在流式生成期间调用，把增量推给前端。"""
        if runtime.state != AgentState.STREAMING:
            runtime.state = AgentState.STREAMING
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.AGENT_DELTA,
                task_id=runtime.task_id,
                agent=self.name,
                ts=time.time(),
                payload=delta,
            )
        )

    async def _emit_done(self, runtime: AgentRuntime, result: BaseModel) -> None:
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.AGENT_DONE,
                task_id=runtime.task_id,
                agent=self.name,
                ts=time.time(),
                payload={
                    "elapsed_ms": runtime.elapsed_ms,
                    "token_used": runtime.token_used,
                    "result": result.model_dump(),
                },
            )
        )

    async def _emit_error(self, runtime: AgentRuntime, exc: BaseException) -> None:
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.AGENT_ERROR,
                task_id=runtime.task_id,
                agent=self.name,
                ts=time.time(),
                payload={
                    "elapsed_ms": runtime.elapsed_ms,
                    "error": str(exc),
                    "type": type(exc).__name__,
                },
            )
        )


def new_task_id(prefix: str = "task") -> str:
    """生成对前端友好的 task_id（短一点便于演示展示）。"""
    return f"{prefix}_{uuid.uuid4().hex[:10]}"
