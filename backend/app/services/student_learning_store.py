"""Persistent student learning-loop store for interactive classrooms."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from ..schemas.student import (
    EvaluationRecord,
    InteractiveClassroomJob,
    LearningPath,
    LearningPathStep,
    PersonalizedTrainingPlan,
    ResourcePackage,
    StageValidationQuestion,
    StudentDashboard,
    StudentProfile,
    StudentProfileHistory,
    TrainingStage,
)
from .resource_package_store import SQLiteResourcePackageStore


def default_learning_store_path() -> Path:
    configured = os.getenv("EDU_STUDENT_DB_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / ".data" / "student_learning.sqlite3"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SQLiteStudentLearningStore:
    """Persist student profile, learning path, and classroom job state."""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path).expanduser() if path is not None else default_learning_store_path()
        self._ensure_schema()

    def now(self) -> datetime:
        return utc_now()

    def get_profile(self, student_id: str) -> StudentProfile | None:
        row = self._fetch_one("student_profiles", student_id)
        if row is None:
            return None
        return StudentProfile.model_validate(json.loads(row["payload"]))

    def save_profile(
        self,
        profile: StudentProfile,
        *,
        source_type: str = "manual",
        source_id: str | None = None,
        before_json: dict | None = None,
        delta_json: dict | None = None,
        note: str = "",
    ) -> StudentProfileHistory:
        now = utc_now()
        existing = self.get_profile(profile.student_id)
        payload = profile.model_copy(update={"updated_at": now})
        before = before_json if before_json is not None else (
            existing.model_dump(mode="json") if existing is not None else {}
        )
        history = StudentProfileHistory(
            history_id=f"hist_{uuid4().hex}",
            student_id=payload.student_id,
            source_type=source_type,  # type: ignore[arg-type]
            source_id=source_id,
            before_json=before,
            after_json=payload.model_dump(mode="json"),
            delta_json=delta_json or {},
            note=note,
            created_at=now,
        )
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO student_profiles (id, updated_at, payload)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    updated_at = excluded.updated_at,
                    payload = excluded.payload
                """,
                (
                    payload.student_id,
                    now.isoformat(),
                    json.dumps(payload.model_dump(mode="json"), ensure_ascii=False),
                ),
            )
            conn.execute(
                """
                INSERT INTO profile_history (id, student_id, created_at, payload)
                VALUES (?, ?, ?, ?)
                """,
                (
                    history.history_id,
                    history.student_id,
                    history.created_at.isoformat(),
                    json.dumps(history.model_dump(mode="json"), ensure_ascii=False),
                ),
            )
        return history

    def default_profile(self, student_id: str) -> StudentProfile:
        now = utc_now()
        return StudentProfile(
            student_id=student_id,
            professional_background="暂未采集",
            knowledge_mastery={},
            learning_goal="建立可执行的互动课堂学习路径",
            learning_style="图解 + 互动课堂 + 小测反馈",
            mistake_points=[],
            resource_preference=["互动课堂", "课堂测验", "代码演示"],
            learning_pace="medium",
            current_progress={},
            created_at=now,
            updated_at=now,
        )

    def get_learning_path(self, student_id: str) -> LearningPath | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM learning_paths WHERE student_id = ? ORDER BY updated_at DESC LIMIT 1",
                (student_id,),
            ).fetchone()
        if row is None:
            return None
        return LearningPath.model_validate(json.loads(row["payload"]))

    def get_or_create_learning_path(self, student_id: str) -> LearningPath:
        existing = self.get_learning_path(student_id)
        if existing is not None:
            return existing
        now = utc_now()
        path = LearningPath(
            path_id=f"path_{uuid4().hex}",
            student_id=student_id,
            title="互动课堂学习路径",
            steps=[],
            adjustment_history=[],
            created_at=now,
            updated_at=now,
        )
        self.save_learning_path(path)
        return path

    def save_learning_path(self, path: LearningPath) -> None:
        now = utc_now()
        payload = path.model_copy(update={"updated_at": now})
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO learning_paths (id, student_id, updated_at, payload)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    student_id = excluded.student_id,
                    updated_at = excluded.updated_at,
                    payload = excluded.payload
                """,
                (
                    payload.path_id,
                    payload.student_id,
                    now.isoformat(),
                    json.dumps(payload.model_dump(mode="json"), ensure_ascii=False),
                ),
            )

    def upsert_classroom_step(
        self,
        *,
        student_id: str,
        target_knowledge_id: str,
        title: str,
        package_id: str,
        mastery_before: int = 0,
    ) -> LearningPath:
        path = self.get_or_create_learning_path(student_id)
        now = utc_now()
        for step in path.steps:
            if step.package_id == package_id or step.target_knowledge_id == target_knowledge_id:
                step.package_id = package_id
                step.status = "in_progress"
                step.mastery_before = mastery_before
                step.updated_reason = "已生成互动课堂，等待课堂测验回流。"
                step.updated_at = now
                self.save_learning_path(path)
                return path

        path.steps.append(
            LearningPathStep(
                step_id=f"step_{uuid4().hex}",
                path_id=path.path_id,
                order_index=len(path.steps) + 1,
                title=title,
                target_knowledge_id=target_knowledge_id,
                status="in_progress",
                package_id=package_id,
                mastery_before=mastery_before,
                mastery_after=mastery_before,
                updated_reason="已生成互动课堂，等待课堂测验回流。",
                created_at=now,
                updated_at=now,
            )
        )
        self.save_learning_path(path)
        return path

    def save_job(self, job: InteractiveClassroomJob) -> None:
        now = utc_now()
        payload = job.model_copy(update={"updated_at": now})
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO interactive_classroom_jobs (id, student_id, package_id, updated_at, payload)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    student_id = excluded.student_id,
                    package_id = excluded.package_id,
                    updated_at = excluded.updated_at,
                    payload = excluded.payload
                """,
                (
                    payload.job_id,
                    payload.student_id,
                    payload.resource_package_id,
                    now.isoformat(),
                    json.dumps(payload.model_dump(mode="json"), ensure_ascii=False),
                ),
            )

    def get_job(self, student_id: str, job_id: str) -> InteractiveClassroomJob | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM interactive_classroom_jobs WHERE id = ? AND student_id = ?",
                (job_id, student_id),
            ).fetchone()
        if row is None:
            return None
        return InteractiveClassroomJob.model_validate(json.loads(row["payload"]))

    def apply_evaluation(
        self,
        evaluation: EvaluationRecord,
        package: ResourcePackage,
    ) -> tuple[StudentProfile, LearningPath]:
        before = self.get_profile(evaluation.student_id) or self.default_profile(evaluation.student_id)
        delta = evaluation.mastery_delta_json
        knowledge_id = str(delta.get("knowledge_id") or package.target_knowledge_id)
        observed_rate = float(delta.get("observed_correct_rate") or 0)
        estimated_mastery = float(delta.get("estimated_mastery") or observed_rate)
        mastery_after = max(0, min(100, round(estimated_mastery * 100)))
        mastery_before = int(before.knowledge_mastery.get(knowledge_id, 0))

        knowledge_mastery = dict(before.knowledge_mastery)
        knowledge_mastery[knowledge_id] = mastery_after
        mistake_points = list(before.mistake_points)
        if mastery_after < 85 and knowledge_id and knowledge_id not in mistake_points:
            mistake_points.append(knowledge_id)
        for weakness in delta.get("new_weakness", []) or []:
            if weakness and weakness not in mistake_points:
                mistake_points.append(str(weakness))
        if mastery_after >= 85 and knowledge_id in mistake_points:
            mistake_points.remove(knowledge_id)
        for weakness in delta.get("resolved_weakness", []) or []:
            if weakness in mistake_points:
                mistake_points.remove(weakness)

        current_progress = dict(before.current_progress)
        current_progress.update(
            {
                "last_package_id": evaluation.package_id,
                "last_evaluation_id": evaluation.id,
                "last_correct_rate": observed_rate,
                "next_focus": delta.get("next_focus", ""),
            }
        )
        now = utc_now()
        after = before.model_copy(
            update={
                "knowledge_mastery": knowledge_mastery,
                "mistake_points": mistake_points[:12],
                "current_progress": current_progress,
                "updated_at": now,
            }
        )
        self.save_profile(
            after,
            source_type="evaluation",
            source_id=evaluation.id,
            before_json=before.model_dump(mode="json"),
            delta_json=delta,
            note="OpenMAIC 课堂测验回流更新画像",
        )

        path = self.get_or_create_learning_path(evaluation.student_id)
        matched = False
        for step in path.steps:
            if step.package_id == package.id or step.target_knowledge_id == knowledge_id:
                step.package_id = package.id
                step.evaluation_id = evaluation.id
                step.evidence = evaluation.feedback_markdown
                step.mastery_before = mastery_before
                step.mastery_after = mastery_after
                step.status = "done" if observed_rate >= 0.6 else "adjusted"
                step.updated_reason = str(delta.get("next_focus") or "根据课堂测验结果更新学习路径。")
                step.updated_at = now
                matched = True
                break
        if not matched:
            path.steps.append(
                LearningPathStep(
                    step_id=f"step_{uuid4().hex}",
                    path_id=path.path_id,
                    order_index=len(path.steps) + 1,
                    title=package.title,
                    target_knowledge_id=knowledge_id,
                    status="done" if observed_rate >= 0.6 else "adjusted",
                    package_id=package.id,
                    evaluation_id=evaluation.id,
                    evidence=evaluation.feedback_markdown,
                    mastery_before=mastery_before,
                    mastery_after=mastery_after,
                    updated_reason=str(delta.get("next_focus") or "根据课堂测验结果更新学习路径。"),
                    created_at=now,
                    updated_at=now,
                )
            )
        path.adjustment_history.append(
            {
                "evaluation_id": evaluation.id,
                "package_id": package.id,
                "knowledge_id": knowledge_id,
                "mastery_before": mastery_before,
                "mastery_after": mastery_after,
                "reason": delta.get("next_focus", ""),
                "created_at": now.isoformat(),
            }
        )
        self.save_learning_path(path)
        return after, path

    def build_dashboard(
        self,
        student_id: str,
        package_store: SQLiteResourcePackageStore,
    ) -> StudentDashboard:
        profile = self.get_profile(student_id)
        path = self.get_learning_path(student_id)
        training_plan = _build_personalized_training_plan(student_id, profile, path)
        packages = package_store.list_packages(owner_id=student_id, owner_role="student", limit=5)
        evaluations = package_store.list_evaluations_for_student(student_id, limit=5)
        suggestions: list[str] = []
        if training_plan:
            for stage in training_plan.stages:
                if stage.status in {"recommended", "in_progress", "needs_review"}:
                    suggestions.append(stage.next_action or f"推进阶段：{stage.title}")
                    break
        if profile and profile.current_progress.get("next_focus"):
            suggestions.append(str(profile.current_progress["next_focus"]))
        if path:
            for step in path.steps:
                if step.status in {"pending", "in_progress", "adjusted"}:
                    suggestions.append(f"继续完成：{step.title}")
                    break
        if not suggestions:
            suggestions.append("选择一个知识点生成互动课堂，并完成课堂测验以更新画像。")
        return StudentDashboard(
            profile=profile,
            learning_path=path,
            training_plan=training_plan,
            recent_packages=packages,
            recent_evaluations=evaluations,
            next_suggestions=suggestions[:5],
        )

    def _fetch_one(self, table: str, row_id: str) -> sqlite3.Row | None:
        with self._connect() as conn:
            return conn.execute(f"SELECT payload FROM {table} WHERE id = ?", (row_id,)).fetchone()

    def _ensure_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS student_profiles (
                    id TEXT PRIMARY KEY,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS profile_history (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_profile_history_student"
                " ON profile_history(student_id, created_at)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS learning_paths (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_learning_paths_student"
                " ON learning_paths(student_id, updated_at)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS interactive_classroom_jobs (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    package_id TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_interactive_jobs_student"
                " ON interactive_classroom_jobs(student_id, updated_at)"
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn


def _build_personalized_training_plan(
    student_id: str,
    profile: StudentProfile | None,
    path: LearningPath | None,
) -> PersonalizedTrainingPlan | None:
    if profile is None and path is None:
        return None

    now = utc_now()
    steps = list(path.steps) if path else []
    knowledge_mastery = dict(profile.knowledge_mastery) if profile else {}
    weakest_knowledge_ids = [
        knowledge_id
        for knowledge_id, _score in sorted(knowledge_mastery.items(), key=lambda item: item[1])[:3]
    ]
    active_steps = [step for step in steps if step.status in {"pending", "in_progress", "adjusted"}]
    completed_steps = [step for step in steps if step.status == "done"]
    next_focus = str(profile.current_progress.get("next_focus") or "") if profile else ""
    mistake_points = list(profile.mistake_points) if profile else []

    foundation_focus = _pick_stage_focus(
        primary_ids=weakest_knowledge_ids,
        fallback_steps=steps,
    )
    practice_focus = _pick_stage_focus(
        primary_ids=[step.target_knowledge_id for step in active_steps],
        fallback_steps=steps,
    )
    advancement_focus = _pick_stage_focus(
        primary_ids=[step.target_knowledge_id for step in completed_steps[::-1]],
        fallback_steps=steps[::-1],
    )

    stages = [
        TrainingStage(
            stage_id=f"{path.path_id if path else f'plan_{student_id}'}:foundation",
            key="foundation",
            title="阶段 1 · 基础定标",
            horizon="当前 - 2 周",
            goal="先把最容易卡住的基础概念说清楚，建立第一层掌握度基线。",
            summary=(
                next_focus
                or "围绕基础概念做一次低成本验证，确认最先该补哪块知识。"
            ),
            status=_stage_status(
                focus_ids=foundation_focus,
                active_steps=active_steps,
                completed_steps=completed_steps,
                knowledge_mastery=knowledge_mastery,
                completion_threshold=55,
            ),
            focus_knowledge_ids=foundation_focus,
            linked_step_ids=[step.step_id for step in steps[:2]],
            evidence_targets=[
                "完成 1 次基础讲解或概念复述",
                "记录 1 个当前最不确定的知识点",
            ],
            validation_question=_build_stage_validation_question(
                stage_key="foundation",
                focus_knowledge_ids=foundation_focus,
                next_focus=next_focus,
            ),
            next_action=f"先验证基础阶段：{_display_focus_label(foundation_focus)}。",
        ),
        TrainingStage(
            stage_id=f"{path.path_id if path else f'plan_{student_id}'}:practice",
            key="practice",
            title="阶段 2 · 课堂练习",
            horizon="2 - 6 周",
            goal="把当前知识点推进成互动课堂，并用阶段验证题回写真实表现。",
            summary=(
                "每推进一个知识点，都要至少完成一次课堂测验，"
                "把结果写回学习路径。"
            ),
            status=_stage_status(
                focus_ids=practice_focus,
                active_steps=active_steps,
                completed_steps=completed_steps,
                knowledge_mastery=knowledge_mastery,
                completion_threshold=65,
            ),
            focus_knowledge_ids=practice_focus,
            linked_step_ids=[step.step_id for step in active_steps[:3]],
            evidence_targets=[
                "完成 1 节互动课堂",
                "完成 1 组阶段验证题并回收正确率",
            ],
            validation_question=_build_stage_validation_question(
                stage_key="practice",
                focus_knowledge_ids=practice_focus,
                next_focus=next_focus,
            ),
            next_action=f"把 {_display_focus_label(practice_focus)} 推进成互动课堂并完成测验。",
        ),
        TrainingStage(
            stage_id=f"{path.path_id if path else f'plan_{student_id}'}:advancement",
            key="advancement",
            title="阶段 3 · 进阶迁移",
            horizon="6 周以后",
            goal="把已经通过课堂验证的知识点迁移到更高阶应用或作品任务里。",
            summary=(
                "不只停留在答对题，而是把通过验证的知识点继续迁移到"
                "项目、讲解或更高难度课堂。"
            ),
            status=_stage_status(
                focus_ids=advancement_focus,
                active_steps=[],
                completed_steps=completed_steps,
                knowledge_mastery=knowledge_mastery,
                completion_threshold=80,
            ),
            focus_knowledge_ids=advancement_focus,
            linked_step_ids=[step.step_id for step in completed_steps[-3:]],
            evidence_targets=[
                "完成 1 个高阶应用任务或小作品",
                "对比 1 次前后掌握度变化",
            ],
            validation_question=_build_stage_validation_question(
                stage_key="advancement",
                focus_knowledge_ids=advancement_focus,
                next_focus=next_focus,
            ),
            next_action=(
                f"如果 {_display_focus_label(advancement_focus)} 已稳定，"
                "就进入更高阶应用验证。"
            ),
        ),
    ]

    if mistake_points:
        stages[0].evidence_targets.append(f"优先观察易错点：{mistake_points[0]}")
    if next_focus:
        stages[1].summary = f"当前系统建议重点：{next_focus}"

    return PersonalizedTrainingPlan(
        plan_id=path.path_id if path else f"training_{student_id}",
        student_id=student_id,
        title="个性化培养方案",
        summary="把专业探索、互动课堂和阶段验证题收束成连续推进的三阶段培养主线。",
        stages=stages,
        updated_at=now,
    )


def _pick_stage_focus(
    *,
    primary_ids: list[str],
    fallback_steps: list[LearningPathStep],
) -> list[str]:
    result: list[str] = []
    for knowledge_id in primary_ids:
        text = str(knowledge_id).strip()
        if text and text not in result:
            result.append(text)
    for step in fallback_steps:
        if step.target_knowledge_id and step.target_knowledge_id not in result:
            result.append(step.target_knowledge_id)
        if len(result) >= 2:
            break
    return result[:2]


def _stage_status(
    *,
    focus_ids: list[str],
    active_steps: list[LearningPathStep],
    completed_steps: list[LearningPathStep],
    knowledge_mastery: dict[str, int],
    completion_threshold: int,
) -> str:
    if not focus_ids:
        return "recommended"
    focus_set = set(focus_ids)
    if any(step.target_knowledge_id in focus_set for step in active_steps):
        return "in_progress"
    if any((knowledge_mastery.get(knowledge_id) or 0) < completion_threshold for knowledge_id in focus_ids):
        return "needs_review" if completed_steps else "recommended"
    return "completed"


def _build_stage_validation_question(
    *,
    stage_key: str,
    focus_knowledge_ids: list[str],
    next_focus: str,
) -> StageValidationQuestion:
    focus_id = focus_knowledge_ids[0] if focus_knowledge_ids else "knowledge-pending"
    focus_name = _humanize_knowledge_id(focus_id)
    if stage_key == "foundation":
        return StageValidationQuestion(
            question_id=f"validation:{stage_key}:{focus_id}",
            prompt=f"用你自己的话解释「{focus_name}」解决的核心问题，并举一个最简单的例子。",
            answer_format="short_answer",
            success_criteria="能说清核心概念、适用场景，以及一个简单例子。",
            target_knowledge_id=focus_id,
            target_knowledge_name=focus_name,
            suggested_difficulty=2,
        )
    if stage_key == "practice":
        return StageValidationQuestion(
            question_id=f"validation:{stage_key}:{focus_id}",
            prompt=(
                f"围绕「{focus_name}」完成一次阶段课堂验证题。"
                f"{f' 当前建议重点：{next_focus}' if next_focus else ''}"
            ),
            answer_format="single_choice",
            success_criteria="完成课堂测验并回写正确率，能明确指出本轮最容易错的点。",
            target_knowledge_id=focus_id,
            target_knowledge_name=focus_name,
            suggested_difficulty=3,
        )
    return StageValidationQuestion(
        question_id=f"validation:{stage_key}:{focus_id}",
        prompt=f"把「{focus_name}」迁移到一个更高阶场景，说明你会怎样应用它。",
        answer_format="reflection",
        success_criteria="能把知识点迁移到新场景，并说明为什么这样做。",
        target_knowledge_id=focus_id,
        target_knowledge_name=focus_name,
        suggested_difficulty=4,
    )


def _humanize_knowledge_id(value: str) -> str:
    text = value.strip().replace("_", " ").replace("-", " ")
    return " ".join(part.capitalize() if part.isascii() else part for part in text.split()) or value


def _display_focus_label(focus_ids: list[str]) -> str:
    if not focus_ids:
        return "当前阶段知识点"
    return " / ".join(_humanize_knowledge_id(item) for item in focus_ids)
