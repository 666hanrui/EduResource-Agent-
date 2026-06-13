"""Backend client for the isolated OpenMAIC interactive-classroom subsystem."""

from __future__ import annotations

import os
from typing import Any

import httpx

from ..schemas.openmaic import (
    OpenMAICClassroomImportRequest,
    OpenMAICSceneImport,
    OpenMAICStageImport,
)


class OpenMAICClient:
    def __init__(self, base_url: str, timeout: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def start_classroom_generation(self, payload: dict[str, Any]) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/api/generate-classroom", json=payload)
            response.raise_for_status()
            data = response.json()
        return data

    async def get_classroom_job(self, job_id: str) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(f"{self.base_url}/api/generate-classroom/{job_id}")
            response.raise_for_status()
            data = response.json()
        return data


def openmaic_fallback_enabled() -> bool:
    """Whether local OpenMAIC fallback is allowed for demo stability."""

    return os.getenv("EDU_OPENMAIC_FALLBACK", "").strip().lower() in {"1", "true", "yes", "on"}


def build_mock_openmaic_classroom_import(
    *,
    source_classroom_id: str,
    resource_package_id: str,
    student_id: str,
    target_knowledge_id: str,
    target_knowledge_name: str,
    learning_goal: str,
    difficulty: int,
    profile_snapshot: dict[str, Any],
) -> OpenMAICClassroomImportRequest:
    """Build an OpenMAIC-compatible classroom import payload locally.

    This is intentionally shaped as an OpenMAIC import payload instead of a
    separate resource-package shortcut. The fallback must exercise the same
    EduResource import pipeline as a real OpenMAIC result:

    OpenMAIC-like stage/scenes -> openmaic_import.py -> ResourcePackage,
    ResourceItem, ExerciseSet, and ResourceRationale.
    """

    safe_goal = learning_goal or f"学习 {target_knowledge_name}"
    stage = OpenMAICStageImport(
        id=f"stage_mock_{target_knowledge_id}",
        name=f"{target_knowledge_name}互动课堂",
        description=f"本地 fallback 课堂：{safe_goal}",
        metadata={
            "source": "local_openmaic_fallback",
            "target_knowledge_id": target_knowledge_id,
            "difficulty": difficulty,
        },
    )
    scenes = [
        OpenMAICSceneImport(
            id="scene_01_concept",
            type="slide",
            title=f"{target_knowledge_name}核心概念",
            order=1,
            content={
                "headline": f"先用低负担方式理解 {target_knowledge_name}",
                "bullets": [
                    f"本节目标：{safe_goal}",
                    "先讲清概念，再进入互动验证。",
                    "所有问题都会回到学生画像与短板证据。",
                ],
            },
        ),
        OpenMAICSceneImport(
            id="scene_02_interactive",
            type="interactive",
            title="步骤拖拽验证",
            order=2,
            content={
                "interaction": "sequence_drag",
                "prompt": f"把 {target_knowledge_name} 的关键步骤拖到正确顺序。",
                "steps": [
                    "识别输入与目标",
                    "拆解关键状态或结构",
                    "执行一步核心操作",
                    "检查边界与反馈结果",
                ],
            },
        ),
        OpenMAICSceneImport(
            id="scene_03_quiz",
            type="quiz",
            title="课堂即时测验",
            order=3,
            content={
                "questions": [
                    {
                        "id": "q1",
                        "question": f"学习 {target_knowledge_name} 时，第一步最应该确认什么？",
                        "options": [
                            {"label": "A", "value": "题目目标与已知条件"},
                            {"label": "B", "value": "直接套用最长代码模板"},
                            {"label": "C", "value": "先忽略边界条件"},
                            {"label": "D", "value": "只看最终答案"},
                        ],
                        "answer": "A",
                        "analysis": "个性化课堂先确认目标和约束，再选择合适资源与练习。",
                    },
                    {
                        "id": "q2",
                        "question": f"如果 {target_knowledge_name} 的课堂测验正确率偏低，系统下一步应该做什么？",
                        "options": [
                            {"label": "A", "value": "直接提高难度"},
                            {"label": "B", "value": "回写画像并调整下一轮学习路径"},
                            {"label": "C", "value": "删除学习记录"},
                            {"label": "D", "value": "忽略测验结果"},
                        ],
                        "answer": "B",
                        "analysis": "课堂验证的价值在于证据回写和路径调整。",
                    },
                ]
            },
        ),
        OpenMAICSceneImport(
            id="scene_04_pbl",
            type="pbl",
            title="小任务迁移",
            order=4,
            content={
                "task": f"用 5 分钟说明 {target_knowledge_name} 可以解决的一个真实问题。",
                "deliverable": "一句话解释 + 一个最小例子 + 一个仍不确定的问题",
            },
        ),
    ]
    return OpenMAICClassroomImportRequest(
        source_classroom_id=source_classroom_id,
        resource_package_id=resource_package_id,
        student_id=student_id,
        target_knowledge_id=target_knowledge_id,
        target_knowledge_name=target_knowledge_name,
        profile_snapshot_id=source_classroom_id,
        difficulty=difficulty,
        stage=stage,
        scenes=scenes,
        profile_snapshot={
            **profile_snapshot,
            "selection_context": {
                **(profile_snapshot.get("selection_context") if isinstance(profile_snapshot.get("selection_context"), dict) else {}),
                "source": "openmaic_fallback",
                "reason": f"OpenMAIC unavailable; generated local classroom for {target_knowledge_name}.",
                "suggested_difficulty": difficulty,
            },
        },
        class_profile_snapshot={
            "common_weakness": [target_knowledge_name],
            "pace": "fallback_demo",
        },
    )
