"""
Orchestrator —— Agent 调度核心。

职责（对应 docs/03-architecture.md）：
1. 接收外部任务请求
2. 按 DAG 调度 7 个 Agent（支持并行 + 依赖）
3. 维护共享上下文（Profile / KnowledgeBreakdown / Rationale / EvaluationDelta）
4. 通过 EventBus 推送实时事件，前端时序面板订阅
5. 处理失败重试与降级

骨架版本：先实现"线性 + 并行 + 依赖"三种最常用调度模式，决赛再加 DAG 解析器。
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel

from ..services.openmaic_main_tools import OpenMAICMainTools
from ..services.teacher_main_tools import TeacherMainTools
from .base import AgentRuntime, BaseAgent, AgentState, new_task_id
from .event_bus import AgentEvent, EventBus, EventType
from .generate_flow import GenerateFlow, GenerateOutputs, GenerateRequest
from .registry import AgentRegistry

logger = logging.getLogger(__name__)


@dataclass
class TaskNode:
    """单个 Agent 任务节点。"""

    node_id: str
    agent_name: str
    payload: BaseModel
    depends_on: list[str] = field(default_factory=list)


@dataclass
class TaskPlan:
    """一次完整调度计划。"""

    task_id: str
    nodes: list[TaskNode]
    metadata: dict[str, Any] = field(default_factory=dict)


class Orchestrator:
    """Agent 调度核心。"""

    def __init__(
        self,
        registry: AgentRegistry,
        event_bus: EventBus,
        llm_service: Any = None,
        openmaic_tools: OpenMAICMainTools | None = None,
        teacher_tools: TeacherMainTools | None = None,
    ) -> None:
        self.registry = registry
        self.event_bus = event_bus
        self._llm_service = llm_service
        self._openmaic_tools = openmaic_tools
        self._teacher_tools = teacher_tools
        self._generate_flow = GenerateFlow(registry, event_bus)

    async def run_generate(
        self,
        task_id: str,
        payload: GenerateRequest,
    ) -> GenerateOutputs:
        """Run the concrete seven-agent resource generation flow (fixed pipeline)."""

        return await self._generate_flow.run(task_id, payload)

    async def run_tool_calling(
        self,
        task_id: str,
        payload: GenerateRequest,
        *,
        max_tool_calls: int = 12,
    ) -> GenerateOutputs:
        """MainAgent 统一主控模式。"""

        from .main_agent_flow import MainAgentFlow

        if self._llm_service is None:
            logger.warning("run_tool_calling 需要 llm_service，当前未注入，降级为 run_generate")
            return await self.run_generate(task_id, payload)

        flow = MainAgentFlow(
            registry=self.registry,
            event_bus=self.event_bus,
            llm_service=self._llm_service,
            openmaic_tools=self._openmaic_tools,
            teacher_tools=self._teacher_tools,
        )
        flow.MAX_TOOL_CALLS = max_tool_calls
        try:
            result = await flow.run(task_id, payload)
            return result
        finally:
            await self.event_bus.close_task(task_id)

    async def run_plan(self, plan: TaskPlan) -> dict[str, BaseModel]:
        """执行一个 TaskPlan，返回各节点的输出 (node_id → result)。"""

        results: dict[str, BaseModel] = {}
        layers = self._topological_layers(plan.nodes)
        started_at = time.time()

        try:
            for layer_idx, layer in enumerate(layers):
                logger.info("Orchestrator 进入第 %d 层，并行节点：%s", layer_idx, [n.node_id for n in layer])
                coros = [self._run_node(plan.task_id, node) for node in layer]
                layer_results = await asyncio.gather(*coros, return_exceptions=True)

                for node, outcome in zip(layer, layer_results):
                    if isinstance(outcome, Exception):
                        await self._emit_summary(plan.task_id, started_at, "error", str(outcome))
                        raise outcome
                    results[node.node_id] = outcome

            await self._emit_summary(plan.task_id, started_at, "ok")
            return results
        finally:
            await self.event_bus.close_task(plan.task_id)

    async def run_single(
        self,
        agent_name: str,
        payload: BaseModel,
        *,
        task_id: str | None = None,
    ) -> tuple[str, BaseModel]:
        """单 Agent 调用的便捷方法（不经 DAG）。"""

        tid = task_id or new_task_id()
        agent = self.registry.get(agent_name)
        try:
            result = await agent.run(tid, payload)
            return tid, result
        finally:
            await self.event_bus.close_task(tid)

    async def _run_node(self, task_id: str, node: TaskNode) -> BaseModel:
        agent = self.registry.get(node.agent_name)
        return await agent.run(task_id, node.payload)

    def _topological_layers(self, nodes: list[TaskNode]) -> list[list[TaskNode]]:
        """把 DAG 切成多层，每层节点之间无依赖，可并行。"""

        node_map = {n.node_id: n for n in nodes}
        in_degree: dict[str, int] = {n.node_id: len(n.depends_on) for n in nodes}
        layers: list[list[TaskNode]] = []
        remaining = set(node_map.keys())
        while remaining:
            current_layer = [node_map[nid] for nid in list(remaining) if in_degree[nid] == 0]
            if not current_layer:
                raise ValueError(f"DAG 存在环，剩余节点：{remaining}")
            layers.append(current_layer)
            for n in current_layer:
                remaining.remove(n.node_id)
            for nid in remaining:
                deps = node_map[nid].depends_on
                in_degree[nid] = sum(1 for d in deps if d in remaining)
        return layers

    async def _emit_summary(self, task_id: str, started_at: float, status: str, error: str | None = None) -> None:
        await self.event_bus.publish(
            AgentEvent(
                type=EventType.TASK_SUMMARY,
                task_id=task_id,
                agent="Orchestrator",
                ts=time.time(),
                payload={
                    "status": status,
                    "elapsed_ms": int((time.time() - started_at) * 1000),
                    "error": error,
                },
            )
        )
