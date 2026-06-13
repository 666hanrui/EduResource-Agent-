"""Student business-loop helpers layered on top of the current stores.

This module fills the student-side API gaps without replacing the current
OpenMAIC classroom path. EduResource remains the system of record for profile,
exploration sessions, learning path, packages, attempts, evaluations and reports.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from ..schemas.exploration import ExplorationPlan, ExplorationRequest
from ..schemas.student import (
    ExplorationDirection as StudentExplorationDirection,
    ExplorationSession,
    LearningPath,
    LearningPathStep,
    Report,
    ReportType,
    StudentProfile,
    StudentProfileHistory,
)
from .resource_package_store import SQLiteResourcePackageStore
from .student_learning_store import SQLiteStudentLearningStore, utc_now


def default_student_business_path() -> Path:
    configured = os.getenv("EDU_STUDENT_BUSINESS_DB_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / ".data" / "student_business.sqlite3"


class SQLiteStudentBusinessStore:
    """Persist student exploration sessions and growth reports."""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path).expanduser() if path is not None else default_student_business_path()
        self._ensure_schema()

    def save_exploration_session(self, session: ExplorationSession) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO exploration_sessions (id, student_id, created_at, payload)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    student_id = excluded.student_id,
                    created_at = excluded.created_at,
                    payload = excluded.payload
                """,
                (
                    session.session_id,
                    session.student_id,
                    session.created_at.isoformat(),
                    json.dumps(session.model_dump(mode="json"), ensure_ascii=False),
                ),
            )
            conn.execute(
                """
                INSERT INTO student_business_index (id, student_id, type, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    student_id = excluded.student_id,
                    type = excluded.type,
                    updated_at = excluded.updated_at
                """,
                (session.session_id, session.student_id, "exploration_session", now),
            )

    def get_exploration_session(self, student_id: str, session_id: str) -> ExplorationSession | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM exploration_sessions WHERE id = ? AND student_id = ?",
                (session_id, student_id),
            ).fetchone()
        if row is None:
            return None
        return ExplorationSession.model_validate(json.loads(row["payload"]))

    def save_report(self, report: Report) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO reports (id, student_id, report_type, created_at, payload)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    student_id = excluded.student_id,
                    report_type = excluded.report_type,
                    created_at = excluded.created_at,
                    payload = excluded.payload
                """,
                (
                    report.id,
                    report.student_id,
                    report.report_type,
                    report.created_at.isoformat(),
                    json.dumps(report.model_dump(mode="json"), ensure_ascii=False),
                ),
            )
            conn.execute(
                """
                INSERT INTO student_business_index (id, student_id, type, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    student_id = excluded.student_id,
                    type = excluded.type,
                    updated_at = excluded.updated_at
                """,
                (report.id, report.student_id, "report", now),
            )

    def get_report(self, student_id: str, report_id: str) -> Report | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM reports WHERE id = ? AND student_id = ?",
                (report_id, student_id),
            ).fetchone()
        if row is None:
            return None
        return Report.model_validate(json.loads(row["payload"]))

    def _ensure_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS exploration_sessions (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_exploration_sessions_student"
                " ON exploration_sessions(student_id, created_at)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS reports (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    report_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_reports_student"
                " ON reports(student_id, created_at)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS student_business_index (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn


def list_profile_history(
    learning_store: SQLiteStudentLearningStore,
    student_id: str,
    *,
    limit: int = 50,
) -> list[StudentProfileHistory]:
    """Read profile history from the existing student learning store."""

    with learning_store._connect() as conn:  # noqa: SLF001 - deliberate adapter over existing store
        rows = conn.execute(
            """
            SELECT payload FROM profile_history
            WHERE student_id = ?
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (student_id, limit),
        ).fetchall()
    return [StudentProfileHistory.model_validate(json.loads(row["payload"])) for row in rows]


def patch_student_profile(
    learning_store: SQLiteStudentLearningStore,
    student_id: str,
    updates: dict,
    *,
    note: str = "手动修改学生画像",
) -> StudentProfile:
    before = learning_store.get_profile(student_id) or learning_store.default_profile(student_id)
    clean_updates = {key: value for key, value in updates.items() if value is not None and key != "note"}
    after = before.model_copy(update={**clean_updates, "updated_at": utc_now()})
    learning_store.save_profile(
        after,
        source_type="manual",
        before_json=before.model_dump(mode="json"),
        delta_json=clean_updates,
        note=note,
    )
    return after


def persist_exploration_plan(
    *,
    payload: ExplorationRequest,
    plan: ExplorationPlan,
    learning_store: SQLiteStudentLearningStore,
    business_store: SQLiteStudentBusinessStore,
) -> ExplorationSession:
    """Persist exploration output and bind it to profile + learning path."""

    now = utc_now()
    session_id = f"explore_{uuid4().hex}"
    before_profile = learning_store.get_profile(payload.student_id) or learning_store.default_profile(payload.student_id)
    mastery = dict(before_profile.knowledge_mastery)
    baseline = _foundation_baseline(payload.foundation_level)
    for item in plan.recommended_knowledge:
        mastery.setdefault(item.knowledge_id, max(5, baseline - item.suggested_difficulty * 3))
    for node in plan.knowledge_map:
        mastery.setdefault(node.id, max(0, baseline - node.difficulty * 4))

    current_progress = dict(before_profile.current_progress)
    current_progress.update(
        {
            "last_exploration_session_id": session_id,
            "major": payload.major,
            "grade": payload.grade,
            "interests": payload.interests,
            "recommended_knowledge": [item.model_dump(mode="json") for item in plan.recommended_knowledge[:8]],
        }
    )
    after_profile = before_profile.model_copy(
        update={
            "professional_background": f"{payload.education_level}{payload.grade} · {payload.major}",
            "knowledge_mastery": mastery,
            "learning_goal": f"围绕 {payload.major} 明确学习方向，并形成可执行学习路径。",
            "learning_style": before_profile.learning_style or "图解 + 互动课堂 + 小测反馈",
            "learning_pace": _pace_from_weekly_hours(payload.weekly_hours),
            "current_progress": current_progress,
            "updated_at": now,
        }
    )
    learning_store.save_profile(
        after_profile,
        source_type="exploration",
        source_id=session_id,
        before_json=before_profile.model_dump(mode="json"),
        delta_json={
            "major": payload.major,
            "interests": payload.interests,
            "recommended_knowledge_count": len(plan.recommended_knowledge),
        },
        note="专业探索结果写入学生画像",
    )

    path = _build_learning_path_from_exploration(payload.student_id, session_id, plan, learning_store.get_learning_path(payload.student_id))
    learning_store.save_learning_path(path)

    directions: list[StudentExplorationDirection] = []
    for direction in plan.career_directions:
        direction_knowledge = [
            node.title for node in plan.knowledge_map if node.id in set(direction.related_knowledge_ids)
        ] or [item.knowledge_name for item in plan.recommended_knowledge[:3]]
        match_report = next((report for report in plan.match_reports if report.direction_id == direction.id), None)
        gap_analysis = []
        if match_report:
            gap_analysis = [
                f"{item.title}：差距 {item.gap}，下一步：{'; '.join(item.next_actions[:2])}"
                for item in match_report.comparison_dimensions
                if item.gap > 0
            ][:5]
        directions.append(
            StudentExplorationDirection(
                id=direction.id,
                session_id=session_id,
                title=direction.title,
                reason="；".join(direction.why_explore) or plan.summary,
                ability_requirements=direction.requirement_profile.core_skills,
                knowledge_path=direction_knowledge,
                gap_analysis=gap_analysis or ["需要通过后续互动课堂收集真实作答证据。"],
                resource_entry_knowledge=[item.model_dump(mode="json") for item in plan.recommended_knowledge[:5]],
                created_at=now,
            )
        )

    session = ExplorationSession(
        session_id=session_id,
        student_id=payload.student_id,
        major=payload.major,
        grade=payload.grade,
        foundation_level=payload.foundation_level,
        interests=payload.interests,
        learning_goal=after_profile.learning_goal,
        weekly_hours=payload.weekly_hours,
        summary=plan.summary,
        recommended_directions=directions,
        created_profile_id=payload.student_id,
        created_path_id=path.path_id,
        created_at=now,
    )
    business_store.save_exploration_session(session)
    return session


def update_learning_path_step(
    learning_store: SQLiteStudentLearningStore,
    student_id: str,
    step_id: str,
    updates: dict,
) -> LearningPath:
    path = learning_store.get_learning_path(student_id)
    if path is None:
        raise KeyError("learning path not found")
    now = utc_now()
    matched = False
    for step in path.steps:
        if step.step_id != step_id:
            continue
        for key in ["status", "package_id", "evaluation_id", "evidence", "mastery_after", "updated_reason"]:
            if key in updates and updates[key] is not None:
                setattr(step, key, updates[key])
        step.updated_at = now
        matched = True
        break
    if not matched:
        raise KeyError("learning path step not found")
    path.adjustment_history.append(
        {
            "step_id": step_id,
            "updates": {key: value for key, value in updates.items() if value is not None},
            "created_at": now.isoformat(),
            "reason": updates.get("updated_reason") or "学生端手动更新路径步骤",
        }
    )
    learning_store.save_learning_path(path)
    return path


def build_and_save_student_report(
    *,
    student_id: str,
    report_type: ReportType,
    learning_store: SQLiteStudentLearningStore,
    package_store: SQLiteResourcePackageStore,
    business_store: SQLiteStudentBusinessStore,
) -> Report:
    now = utc_now()
    profile = learning_store.get_profile(student_id) or learning_store.default_profile(student_id)
    path = learning_store.get_learning_path(student_id)
    packages = package_store.list_packages(owner_id=student_id, owner_role="student", limit=20)
    evaluations = package_store.list_evaluations_for_student(student_id, limit=20)
    completed_steps = [step for step in (path.steps if path else []) if step.status == "done"]
    active_steps = [step for step in (path.steps if path else []) if step.status in {"pending", "in_progress", "adjusted"}]

    mastery_lines = [
        f"- {knowledge_id}：{score} 分"
        for knowledge_id, score in sorted(profile.knowledge_mastery.items(), key=lambda item: item[0])[:12]
    ] or ["- 暂无掌握度数据，建议先完成一次互动课堂测验。"]
    weakness_lines = [f"- {item}" for item in profile.mistake_points[:12]] or ["- 暂未形成稳定易错点。"]
    package_lines = [f"- {package.title}（{package.status}）" for package in packages[:8]] or ["- 暂无资源包。"]
    evaluation_lines = [
        f"- {evaluation.created_at.date()}：{evaluation.feedback_markdown.splitlines()[0] if evaluation.feedback_markdown else evaluation.id}"
        for evaluation in evaluations[:6]
    ] or ["- 暂无评估记录。"]
    path_lines = [
        f"- [{step.status}] {step.title}：{step.mastery_before} → {step.mastery_after}"
        for step in (path.steps if path else [])[:10]
    ] or ["- 暂无学习路径。"]
    next_suggestions = []
    if active_steps:
        next_suggestions.append(f"优先推进：{active_steps[0].title}")
    if profile.current_progress.get("next_focus"):
        next_suggestions.append(str(profile.current_progress["next_focus"]))
    if not next_suggestions:
        next_suggestions.append("选择一个推荐知识点生成互动课堂，并完成测验回写。")

    content = f"""# 学生成长报告

## 当前画像摘要

- 学生：{student_id}
- 专业背景：{profile.professional_background}
- 学习目标：{profile.learning_goal}
- 学习风格：{profile.learning_style}
- 学习节奏：{profile.learning_pace}

## 知识掌握度

{chr(10).join(mastery_lines)}

## 已完成资源

{chr(10).join(package_lines)}

## 练习与评估表现

{chr(10).join(evaluation_lines)}

## 薄弱点变化

{chr(10).join(weakness_lines)}

## 学习路径进度

- 已完成步骤：{len(completed_steps)}
- 待推进步骤：{len(active_steps)}

{chr(10).join(path_lines)}

## 下一步建议

{chr(10).join(f'- {item}' for item in next_suggestions[:5])}
"""
    report = Report(
        id=f"report_{uuid4().hex}",
        student_id=student_id,
        report_type=report_type,
        title="学生成长报告",
        content_markdown=content,
        source_json={
            "profile_updated_at": profile.updated_at.isoformat(),
            "path_id": path.path_id if path else None,
            "package_ids": [package.id for package in packages[:20]],
            "evaluation_ids": [evaluation.id for evaluation in evaluations[:20]],
        },
        created_at=now,
    )
    business_store.save_report(report)
    return report


def _build_learning_path_from_exploration(
    student_id: str,
    session_id: str,
    plan: ExplorationPlan,
    existing: LearningPath | None,
) -> LearningPath:
    now = utc_now()
    path = existing or LearningPath(
        path_id=f"path_{uuid4().hex}",
        student_id=student_id,
        source_exploration_session_id=session_id,
        title="专业探索学习路径",
        steps=[],
        adjustment_history=[],
        created_at=now,
        updated_at=now,
    )
    path.source_exploration_session_id = session_id
    path.title = f"{plan.major} 个性化学习路径"
    existing_ids = {step.target_knowledge_id for step in path.steps}
    order_index = len(path.steps) + 1
    for item in plan.recommended_knowledge[:8]:
        if item.knowledge_id in existing_ids:
            continue
        path.steps.append(
            LearningPathStep(
                step_id=f"step_{uuid4().hex}",
                path_id=path.path_id,
                order_index=order_index,
                title=item.knowledge_name,
                target_knowledge_id=item.knowledge_id,
                status="pending",
                mastery_before=0,
                mastery_after=0,
                updated_reason=f"来自专业探索：{item.reason}",
                created_at=now,
                updated_at=now,
            )
        )
        order_index += 1
    path.adjustment_history.append(
        {
            "source": "exploration",
            "session_id": session_id,
            "summary": plan.summary,
            "created_at": now.isoformat(),
        }
    )
    return path


def _foundation_baseline(level: str) -> int:
    if level == "intermediate":
        return 58
    if level == "basic":
        return 38
    return 22


def _pace_from_weekly_hours(hours: int) -> str:
    if hours >= 12:
        return "fast"
    if hours >= 5:
        return "medium"
    return "slow"
