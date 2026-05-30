"""
Agent 注册表。

集中管理 7 个 Agent 的实例化与查找，让 Orchestrator 通过名字调度。
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .base import BaseAgent


class AgentRegistry:
    """Agent 实例注册表。

    用法：
        registry = AgentRegistry()
        registry.register(ProfileAgent(...))
        agent = registry.get("ProfileAgent")
    """

    def __init__(self) -> None:
        self._agents: dict[str, BaseAgent] = {}

    def register(self, agent: BaseAgent) -> None:
        if agent.name in self._agents:
            raise ValueError(f"Agent {agent.name!r} 已注册过")
        self._agents[agent.name] = agent

    def get(self, name: str) -> BaseAgent:
        if name not in self._agents:
            raise KeyError(f"未注册的 Agent: {name!r}")
        return self._agents[name]

    def all_names(self) -> list[str]:
        return list(self._agents.keys())

    def __contains__(self, name: str) -> bool:
        return name in self._agents
