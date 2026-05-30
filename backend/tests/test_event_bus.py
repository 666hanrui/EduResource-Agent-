"""EventBus 单测 —— 重点验证 ring buffer + 晚订阅 replay。"""

from __future__ import annotations

import asyncio
import json

from app.agents.event_bus import AgentEvent, EventBus, EventType


def _make_event(task_id: str, agent: str, etype: EventType) -> AgentEvent:
    return AgentEvent(type=etype, task_id=task_id, agent=agent, ts=0.0, payload={})


def test_late_subscriber_gets_replay() -> None:
    async def run() -> None:
        bus = EventBus()
        # 先发 start，再让订阅者上来
        await bus.publish(_make_event("t1", "X", EventType.AGENT_START))
        await bus.publish(_make_event("t1", "X", EventType.AGENT_DONE))

        collected: list[dict] = []

        async def consumer() -> None:
            async for line in bus.subscribe("t1"):
                collected.append(json.loads(line))

        # close_task 让 subscribe 早点退出
        await bus.close_task("t1")

        # 跑消费者
        await asyncio.wait_for(consumer(), timeout=1.0)
        assert [e["type"] for e in collected] == ["agent.start", "agent.done"]

    asyncio.run(run())


def test_concurrent_publish_and_subscribe() -> None:
    async def run() -> None:
        bus = EventBus()
        collected: list[dict] = []

        async def consumer() -> None:
            async for line in bus.subscribe("t2"):
                collected.append(json.loads(line))

        consumer_task = asyncio.create_task(consumer())
        await asyncio.sleep(0)  # 让 consumer 进入订阅

        await bus.publish(_make_event("t2", "Y", EventType.AGENT_START))
        await bus.publish(_make_event("t2", "Y", EventType.AGENT_DELTA))
        await bus.publish(_make_event("t2", "Y", EventType.AGENT_DONE))
        await bus.close_task("t2")

        await asyncio.wait_for(consumer_task, timeout=1.0)
        assert len(collected) == 3
        assert collected[0]["type"] == "agent.start"
        assert collected[-1]["type"] == "agent.done"

    asyncio.run(run())


def test_history_size_caps_buffer() -> None:
    async def run() -> None:
        bus = EventBus(history_size=3)
        for _ in range(10):
            await bus.publish(_make_event("t3", "Z", EventType.AGENT_DELTA))
        await bus.close_task("t3")

        collected: list[dict] = []

        async def consumer() -> None:
            async for line in bus.subscribe("t3"):
                collected.append(json.loads(line))

        await asyncio.wait_for(consumer(), timeout=1.0)
        assert len(collected) == 3  # ring buffer 截断到 3 条

    asyncio.run(run())
