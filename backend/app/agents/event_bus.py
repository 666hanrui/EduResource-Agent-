"""
SSE NDJSON 事件总线。

设计要点：
- 沿用 career-planning-agent 的 meta → delta → done | error 三段式协议
- 每个 task_id 对应一个 asyncio.Queue，前端 SSE 端点从队列拉
- 多订阅者通过 fanout 实现（同一 task 可有多个观察者，例如演示视频投屏）
- NDJSON 格式：每条事件一行 JSON，便于浏览器 ReadableStream 直接 split

使用：
    bus = EventBus()
    await bus.publish(event)
    async for line in bus.subscribe(task_id):
        yield f"data: {line}\\n\\n"
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from dataclasses import dataclass
from enum import Enum
from typing import Any, AsyncIterator


class EventType(str, Enum):
    """SSE 事件类型，与前端 reducer 对齐。"""

    AGENT_START = "agent.start"
    AGENT_DELTA = "agent.delta"
    AGENT_DONE = "agent.done"
    AGENT_ERROR = "agent.error"
    TASK_SUMMARY = "task.summary"


@dataclass
class AgentEvent:
    """SSE 事件结构。

    与 docs/03-architecture.md 的事件协议对齐。
    """

    type: EventType
    task_id: str
    agent: str
    ts: float
    payload: dict[str, Any]

    def to_ndjson(self) -> str:
        """序列化为单行 JSON（NDJSON 一行就是一条事件）。"""
        return json.dumps(
            {
                "type": self.type.value,
                "task_id": self.task_id,
                "agent": self.agent,
                "ts": self.ts,
                "payload": self.payload,
            },
            ensure_ascii=False,
        )


_SENTINEL: AgentEvent | None = None  # 表示流结束的哨兵


class EventBus:
    """简易内存事件总线。

    生产环境可替换为 Redis Pub/Sub 或 Kafka，但接口保持不变。
    初赛单机部署用内存版即可。

    设计要点：
    - 每个 task_id 维护一个 ring buffer（最近 N 条历史事件）
    - 新订阅者首先 replay buffer，再实时跟进
    - 这样 POST 异步启动 + 前端稍后订阅的时序也不会漏 agent.start
    """

    DEFAULT_HISTORY_SIZE = 256

    def __init__(self, history_size: int = DEFAULT_HISTORY_SIZE) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[AgentEvent | None]]] = {}
        self._history: dict[str, list[AgentEvent]] = {}
        self._closed: set[str] = set()
        self._history_size = history_size
        self._lock: asyncio.Lock | None = None

    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def publish(self, event: AgentEvent) -> None:
        """向 task_id 对应的所有订阅者广播事件，并记入 ring buffer。"""
        async with self._get_lock():
            buf = self._history.setdefault(event.task_id, [])
            buf.append(event)
            if len(buf) > self._history_size:
                del buf[0 : len(buf) - self._history_size]
            queues = list(self._subscribers.get(event.task_id, []))
        for q in queues:
            await q.put(event)

    async def close_task(self, task_id: str) -> None:
        """任务结束。向所有当前订阅者推哨兵；之后新订阅会拿历史后立即收尾。"""
        async with self._get_lock():
            queues = self._subscribers.pop(task_id, [])
            self._closed.add(task_id)
        for q in queues:
            await q.put(_SENTINEL)

    @asynccontextmanager
    async def _register(
        self, task_id: str
    ) -> AsyncIterator[tuple[asyncio.Queue[AgentEvent | None], list[AgentEvent], bool]]:
        q: asyncio.Queue[AgentEvent | None] = asyncio.Queue(maxsize=512)
        async with self._get_lock():
            history = list(self._history.get(task_id, []))
            already_closed = task_id in self._closed
            if not already_closed:
                self._subscribers.setdefault(task_id, []).append(q)
        try:
            yield q, history, already_closed
        finally:
            async with self._get_lock():
                lst = self._subscribers.get(task_id)
                if lst and q in lst:
                    lst.remove(q)
                    if not lst:
                        self._subscribers.pop(task_id, None)

    async def subscribe(self, task_id: str) -> AsyncIterator[str]:
        """订阅指定 task_id 的事件流，逐条 yield NDJSON 字符串。

        先 replay 历史 buffer，再实时跟进。任务已关闭时 replay 完即结束。
        """
        async with self._register(task_id) as (q, history, already_closed):
            for event in history:
                yield event.to_ndjson()
            if already_closed:
                return
            while True:
                event = await q.get()
                if event is _SENTINEL:
                    return
                yield event.to_ndjson()
