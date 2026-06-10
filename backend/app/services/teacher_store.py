"""SQLite persistence for teacher-side classroom context and packages."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..schemas.profile import Profile, Progress
from ..schemas.teacher import (
    ClassProfile,
    TeacherContext,
    TeacherDashboard,
    TeacherGenerationJob,
    TeacherReviewItem,
    TeacherStudentSnapshot,
    TeacherTeachingPackage,
    TeacherTeachingPackageCreateRequest,
)
from .supplemental_resources import build_supplemental_resources


def default_teacher_store_path() -> Path:
    configured = os.getenv("EDU_TEACHER_DB_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / ".data" / "teacher_store.sqlite3"


class TeacherStoreError(Exception):
    """Base exception for teacher store boundary violations."""


class TeacherNotFoundError(TeacherStoreError):
    pass


class ClassNotFoundError(TeacherStoreError):
    pass


class StudentNotInClassError(TeacherStoreError):
    pass


class TeacherJobNotFoundError(TeacherStoreError):
    pass


class SQLiteTeacherStore:
    """Teacher-side SQLite store scoped by teacher_id and class_id."""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path).expanduser() if path is not None else default_teacher_store_path()
        self._ensure_schema()
        self._seed_defaults()

    def get_dashboard(self, teacher_id: str, class_id: str | None = None) -> TeacherDashboard:
        teacher = self.get_teacher(teacher_id)
        classes = self.list_classes(teacher_id)
        if not classes:
            raise ClassNotFoundError(f"teacher {teacher_id!r} has no classes")

        active_class = self.get_class(teacher_id, class_id or classes[0].class_id)
        return TeacherDashboard(
            teacher_context=teacher,
            classes=classes,
            active_class=active_class,
            attention_queue=self.list_attention_queue(teacher_id, active_class.class_id),
            recent_packages=self.list_recent_packages(teacher_id, active_class.class_id),
            review_items=self.list_review_items(teacher_id, active_class.class_id),
        )

    def get_teacher(self, teacher_id: str) -> TeacherContext:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM teacher_contexts WHERE teacher_id = ?",
                (teacher_id,),
            ).fetchone()
        if row is None:
            raise TeacherNotFoundError(f"teacher {teacher_id!r} not found")
        return self._teacher_from_row(row)

    def list_classes(self, teacher_id: str) -> list[ClassProfile]:
        self.get_teacher(teacher_id)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM class_profiles
                WHERE teacher_id = ?
                ORDER BY risk DESC, progress ASC, class_id ASC
                """,
                (teacher_id,),
            ).fetchall()
        return [self._class_from_row(row) for row in rows]

    def get_class(self, teacher_id: str, class_id: str) -> ClassProfile:
        self.get_teacher(teacher_id)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM class_profiles
                WHERE teacher_id = ? AND class_id = ?
                """,
                (teacher_id, class_id),
            ).fetchone()
        if row is None:
            raise ClassNotFoundError(f"class {class_id!r} not found for teacher {teacher_id!r}")
        return self._class_from_row(row)

    def list_attention_queue(self, teacher_id: str, class_id: str) -> list[TeacherStudentSnapshot]:
        self.get_class(teacher_id, class_id)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM teacher_student_snapshots
                WHERE teacher_id = ? AND class_id = ?
                ORDER BY
                    CASE risk WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                    mastery ASC,
                    student_id ASC
                """,
                (teacher_id, class_id),
            ).fetchall()
        return [self._student_from_row(row) for row in rows]

    def get_student_snapshot(
        self,
        teacher_id: str,
        class_id: str,
        student_id: str,
    ) -> TeacherStudentSnapshot:
        self.get_class(teacher_id, class_id)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM teacher_student_snapshots
                WHERE teacher_id = ? AND class_id = ? AND student_id = ?
                """,
                (teacher_id, class_id, student_id),
            ).fetchone()
        if row is None:
            raise StudentNotInClassError(
                f"student {student_id!r} is not in class {class_id!r} for teacher {teacher_id!r}"
            )
        return self._student_from_row(row)

    def get_prior_profile(
        self,
        teacher_id: str,
        class_id: str,
        student_id: str | None,
        *,
        teaching_goal: str,
        target_knowledge_id: str,
    ) -> Profile:
        if student_id:
            snapshot = self.get_student_snapshot(teacher_id, class_id, student_id)
            profile_json = dict(snapshot.profile_json)
            profile_json.setdefault("goal", teaching_goal)
            return Profile.model_validate(profile_json)

        active_class = self.get_class(teacher_id, class_id)
        return Profile(
            major="计算机科学与技术",
            knowledge_levels={target_knowledge_id: max(0.0, min(1.0, active_class.progress / 100))},
            goal=teaching_goal,
            style=["diagram", "step_by_step"],
            weakness=[f"{active_class.name} 当前需要关注：{active_class.status}"],
            preference=["document", "exercise", "animation", "code_sample"],
            pace="medium",
            progress=Progress(current_chapter=target_knowledge_id, completed=[]),
        )

    def create_job(
        self,
        *,
        job_id: str,
        teacher_id: str,
        class_id: str,
        payload: TeacherTeachingPackageCreateRequest,
        teaching_package_id: str,
        generate_task_id: str,
    ) -> TeacherGenerationJob:
        self.get_class(teacher_id, class_id)
        if payload.target_student_id:
            self.get_student_snapshot(teacher_id, class_id, payload.target_student_id)

        now = _utcnow()
        title = f"{payload.target_knowledge_name} · 教师教学包"
        request_json = _json_dumps(payload.model_dump())
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO teacher_packages (
                    package_id, teacher_id, class_id, target_student_id, title,
                    target_knowledge_id, target_knowledge_name, teaching_goal,
                    status, results_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'generating', NULL, ?, ?)
                """,
                (
                    teaching_package_id,
                    teacher_id,
                    class_id,
                    payload.target_student_id,
                    title,
                    payload.target_knowledge_id,
                    payload.target_knowledge_name,
                    payload.teaching_goal,
                    now,
                    now,
                ),
            )
            conn.execute(
                """
                INSERT INTO teacher_generation_jobs (
                    job_id, teacher_id, class_id, target_student_id,
                    teaching_package_id, generate_task_id, status, message,
                    request_json, results_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, NULL, ?, ?)
                """,
                (
                    job_id,
                    teacher_id,
                    class_id,
                    payload.target_student_id,
                    teaching_package_id,
                    generate_task_id,
                    "教师教学包生成中",
                    request_json,
                    now,
                    now,
                ),
            )
        return self.get_job(teacher_id, class_id, job_id)

    def complete_job(
        self,
        *,
        teacher_id: str,
        class_id: str,
        job_id: str,
        results: dict[str, Any],
    ) -> TeacherGenerationJob:
        job = self.get_job(teacher_id, class_id, job_id)
        now = _utcnow()
        results_json = _json_dumps(results)
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE teacher_generation_jobs
                SET status = 'succeeded', message = ?, results_json = ?, updated_at = ?
                WHERE teacher_id = ? AND class_id = ? AND job_id = ?
                """,
                ("教师教学包已生成，等待审核", results_json, now, teacher_id, class_id, job_id),
            )
            conn.execute(
                """
                UPDATE teacher_packages
                SET status = 'ready', results_json = ?, updated_at = ?
                WHERE teacher_id = ? AND class_id = ? AND package_id = ?
                """,
                (results_json, now, teacher_id, class_id, job.teaching_package_id),
            )
            conn.execute(
                "DELETE FROM teacher_review_items WHERE package_id = ?",
                (job.teaching_package_id,),
            )
            for item in self._build_review_items(job, results, now):
                conn.execute(
                    """
                    INSERT INTO teacher_review_items (
                        review_id, package_id, teacher_id, class_id, title, type,
                        student_id, status, agent, reason, rationale_json, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item.id,
                        item.package_id,
                        item.teacher_id,
                        item.class_id,
                        item.title,
                        item.type,
                        item.student,
                        item.status,
                        item.agent,
                        item.reason,
                        _json_dumps(item.rationale),
                        item.created_at.isoformat(),
                    ),
                )
        return self.get_job(teacher_id, class_id, job_id)

    def fail_job(self, *, teacher_id: str, class_id: str, job_id: str, message: str) -> TeacherGenerationJob:
        job = self.get_job(teacher_id, class_id, job_id)
        now = _utcnow()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE teacher_generation_jobs
                SET status = 'failed', message = ?, updated_at = ?
                WHERE teacher_id = ? AND class_id = ? AND job_id = ?
                """,
                (message, now, teacher_id, class_id, job_id),
            )
            conn.execute(
                """
                UPDATE teacher_packages
                SET status = 'failed', updated_at = ?
                WHERE teacher_id = ? AND class_id = ? AND package_id = ?
                """,
                (now, teacher_id, class_id, job.teaching_package_id),
            )
        return self.get_job(teacher_id, class_id, job_id)

    def get_job(self, teacher_id: str, class_id: str, job_id: str) -> TeacherGenerationJob:
        self.get_class(teacher_id, class_id)
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT * FROM teacher_generation_jobs
                WHERE teacher_id = ? AND class_id = ? AND job_id = ?
                """,
                (teacher_id, class_id, job_id),
            ).fetchone()
        if row is None:
            raise TeacherJobNotFoundError(
                f"job {job_id!r} not found for teacher {teacher_id!r} class {class_id!r}"
            )
        return self._job_from_row(row)

    def list_recent_packages(self, teacher_id: str, class_id: str) -> list[TeacherTeachingPackage]:
        self.get_class(teacher_id, class_id)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM teacher_packages
                WHERE teacher_id = ? AND class_id = ?
                ORDER BY updated_at DESC
                LIMIT 10
                """,
                (teacher_id, class_id),
            ).fetchall()
        return [self._package_from_row(row) for row in rows]

    def list_review_items(self, teacher_id: str, class_id: str) -> list[TeacherReviewItem]:
        self.get_class(teacher_id, class_id)
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM teacher_review_items
                WHERE teacher_id = ? AND class_id = ?
                ORDER BY created_at DESC
                LIMIT 20
                """,
                (teacher_id, class_id),
            ).fetchall()
        return [self._review_from_row(row) for row in rows]

    def _ensure_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS teacher_contexts (
                    teacher_id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    teaching_style_json TEXT NOT NULL,
                    resource_preferences_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS class_profiles (
                    class_id TEXT PRIMARY KEY,
                    teacher_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    students INTEGER NOT NULL,
                    risk INTEGER NOT NULL,
                    progress INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    mastery_trend_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_class_profiles_teacher ON class_profiles(teacher_id)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS teacher_student_snapshots (
                    student_id TEXT PRIMARY KEY,
                    teacher_id TEXT NOT NULL,
                    class_id TEXT NOT NULL,
                    focus TEXT NOT NULL,
                    mastery INTEGER NOT NULL,
                    risk TEXT NOT NULL,
                    evidence TEXT NOT NULL,
                    action TEXT NOT NULL,
                    knowledge_id TEXT NOT NULL,
                    knowledge_name TEXT NOT NULL,
                    profile_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_teacher_students_scope"
                " ON teacher_student_snapshots(teacher_id, class_id)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS teacher_packages (
                    package_id TEXT PRIMARY KEY,
                    teacher_id TEXT NOT NULL,
                    class_id TEXT NOT NULL,
                    target_student_id TEXT,
                    title TEXT NOT NULL,
                    target_knowledge_id TEXT NOT NULL,
                    target_knowledge_name TEXT NOT NULL,
                    teaching_goal TEXT NOT NULL,
                    status TEXT NOT NULL,
                    results_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_teacher_packages_scope"
                " ON teacher_packages(teacher_id, class_id, updated_at DESC)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS teacher_generation_jobs (
                    job_id TEXT PRIMARY KEY,
                    teacher_id TEXT NOT NULL,
                    class_id TEXT NOT NULL,
                    target_student_id TEXT,
                    teaching_package_id TEXT NOT NULL,
                    generate_task_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT NOT NULL,
                    request_json TEXT NOT NULL,
                    results_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_teacher_jobs_scope"
                " ON teacher_generation_jobs(teacher_id, class_id, updated_at DESC)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS teacher_review_items (
                    review_id TEXT PRIMARY KEY,
                    package_id TEXT NOT NULL,
                    teacher_id TEXT NOT NULL,
                    class_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    type TEXT NOT NULL,
                    student_id TEXT,
                    status TEXT NOT NULL,
                    agent TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    rationale_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_teacher_reviews_scope"
                " ON teacher_review_items(teacher_id, class_id, created_at DESC)"
            )

    def _seed_defaults(self) -> None:
        now = _utcnow()
        with self._connect() as conn:
            teacher_count = conn.execute("SELECT COUNT(*) AS n FROM teacher_contexts").fetchone()["n"]
            if not teacher_count:
                conn.execute(
                    """
                    INSERT INTO teacher_contexts (
                        teacher_id, display_name, subject, teaching_style_json,
                        resource_preferences_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "tch_001",
                        "林老师",
                        "数据结构与算法",
                        _json_dumps(["证据优先", "低负担干预", "可视化讲解"]),
                        _json_dumps(["讲解文档", "课堂测验", "步骤动画", "代码走查"]),
                        now,
                        now,
                    ),
                )
                for item in [
                    ("class-se-2301", "软件工程 2301", 42, 6, 78, "正常推进", [40, 55, 72, 78]),
                    ("class-ds-boost", "数据结构强化班", 36, 11, 64, "需要干预", [38, 48, 59, 64]),
                    ("class-ai-project", "AI 应用项目组", 18, 3, 83, "正常推进", [57, 68, 76, 83]),
                ]:
                    conn.execute(
                        """
                        INSERT INTO class_profiles (
                            class_id, teacher_id, name, students, risk, progress, status,
                            mastery_trend_json, created_at, updated_at
                        )
                        VALUES (?, 'tch_001', ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            item[0],
                            item[1],
                            item[2],
                            item[3],
                            item[4],
                            item[5],
                            _json_dumps(item[6]),
                            now,
                            now,
                        ),
                    )

                for student in [
                    (
                        "stu_001",
                        "class-se-2301",
                        "链表 / 指针修改顺序",
                        72,
                        "medium",
                        "链表插入最近 3 题错 1 题，资源停留时间偏短",
                        "补一组可视化步骤题",
                        "linked-list-basics",
                        "链表",
                    ),
                    (
                        "stu_018",
                        "class-ds-boost",
                        "二叉树遍历 / 递归栈",
                        51,
                        "high",
                        "递归调用顺序连续 2 次错误，EvaluationAgent 标记为高风险",
                        "生成低难度动画 + 安排代码走查",
                        "binary-tree-traversal",
                        "二叉树遍历",
                    ),
                    (
                        "stu_026",
                        "class-ds-boost",
                        "动态规划入门 / 状态转移",
                        67,
                        "medium",
                        "能写出递推式，但初始化边界漏写频繁",
                        "降低题目梯度，先推 2 道填空题",
                        "dynamic-programming",
                        "动态规划",
                    ),
                    (
                        "stu_033",
                        "class-ai-project",
                        "图算法 BFS / 队列过程",
                        86,
                        "low",
                        "掌握度稳定，适合进入挑战任务",
                        "推荐挑战任务",
                        "graph-algorithms",
                        "图算法 BFS",
                    ),
                ]:
                    profile = _profile_for_seed_student(
                        student_id=student[0],
                        focus=student[2],
                        mastery=student[3],
                        risk=student[4],
                        knowledge_id=student[7],
                    )
                    conn.execute(
                        """
                        INSERT INTO teacher_student_snapshots (
                            student_id, teacher_id, class_id, focus, mastery, risk,
                            evidence, action, knowledge_id, knowledge_name,
                            profile_json, updated_at
                        )
                        VALUES (?, 'tch_001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            student[0],
                            student[1],
                            student[2],
                            student[3],
                            student[4],
                            student[5],
                            student[6],
                            student[7],
                            student[8],
                            _json_dumps(profile.model_dump()),
                            now,
                        ),
                    )

            existing_seed_package = conn.execute(
                """
                SELECT COUNT(*) AS n
                FROM teacher_packages
                WHERE teacher_id = ? AND class_id = ? AND target_student_id = ? AND target_knowledge_id = ?
                """,
                ("tch_001", "class-ds-boost", "stu_018", "binary-tree-traversal"),
            ).fetchone()["n"]
            if existing_seed_package:
                return

            seed_results = _seed_teacher_results(
                student_id="stu_018",
                knowledge_id="binary-tree-traversal",
                knowledge_name="二叉树遍历",
            )
            seed_package_id = "pkg_seed_binary_tree"
            conn.execute(
                """
                INSERT INTO teacher_packages (
                    package_id, teacher_id, class_id, target_student_id, title,
                    target_knowledge_id, target_knowledge_name, teaching_goal,
                    status, results_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    seed_package_id,
                    "tch_001",
                    "class-ds-boost",
                    "stu_018",
                    "二叉树遍历 · 教师教学包",
                    "binary-tree-traversal",
                    "二叉树遍历",
                    "为高风险学生准备一套低负担、可视化优先、可审核的补救教学包",
                    "ready",
                    _json_dumps(seed_results),
                    now,
                    now,
                ),
            )

            seed_job = TeacherGenerationJob(
                job_id="job_seed_binary_tree",
                teacher_id="tch_001",
                class_id="class-ds-boost",
                target_student_id="stu_018",
                teaching_package_id=seed_package_id,
                generate_task_id="task_seed_binary_tree",
                status="succeeded",
                message="示例教学包已就绪，可直接进入老师审核台查看。",
                results=seed_results,
                created_at=_parse_dt(now),
                updated_at=_parse_dt(now),
            )
            for item in self._build_review_items(seed_job, seed_results, now):
                seeded = item.model_copy(update={"status": "ready"})
                conn.execute(
                    """
                    INSERT INTO teacher_review_items (
                        review_id, package_id, teacher_id, class_id, title, type,
                        student_id, status, agent, reason, rationale_json, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        seeded.id,
                        seeded.package_id,
                        seeded.teacher_id,
                        seeded.class_id,
                        seeded.title,
                        seeded.type,
                        seeded.student,
                        seeded.status,
                        seeded.agent,
                        seeded.reason,
                        _json_dumps(seeded.rationale),
                        seeded.created_at.isoformat(),
                    ),
                )

    def _teacher_from_row(self, row: sqlite3.Row) -> TeacherContext:
        return TeacherContext(
            teacher_id=row["teacher_id"],
            display_name=row["display_name"],
            subject=row["subject"],
            teaching_style=_json_loads(row["teaching_style_json"], []),
            resource_preferences=_json_loads(row["resource_preferences_json"], []),
            created_at=_parse_dt(row["created_at"]),
            updated_at=_parse_dt(row["updated_at"]),
        )

    def _class_from_row(self, row: sqlite3.Row) -> ClassProfile:
        return ClassProfile(
            class_id=row["class_id"],
            teacher_id=row["teacher_id"],
            name=row["name"],
            students=int(row["students"]),
            risk=int(row["risk"]),
            progress=int(row["progress"]),
            status=row["status"],
            mastery_trend=_json_loads(row["mastery_trend_json"], []),
            created_at=_parse_dt(row["created_at"]),
            updated_at=_parse_dt(row["updated_at"]),
        )

    def _student_from_row(self, row: sqlite3.Row) -> TeacherStudentSnapshot:
        return TeacherStudentSnapshot(
            id=row["student_id"],
            class_id=row["class_id"],
            focus=row["focus"],
            mastery=int(row["mastery"]),
            risk=row["risk"],
            evidence=row["evidence"],
            action=row["action"],
            knowledge_id=row["knowledge_id"],
            knowledge_name=row["knowledge_name"],
            profile_json=_json_loads(row["profile_json"], {}),
            updated_at=_parse_dt(row["updated_at"]),
        )

    def _package_from_row(self, row: sqlite3.Row) -> TeacherTeachingPackage:
        return TeacherTeachingPackage(
            id=row["package_id"],
            teacher_id=row["teacher_id"],
            class_id=row["class_id"],
            target_student_id=row["target_student_id"],
            title=row["title"],
            target_knowledge_id=row["target_knowledge_id"],
            target_knowledge_name=row["target_knowledge_name"],
            teaching_goal=row["teaching_goal"],
            status=row["status"],
            results=_json_loads(row["results_json"], None),
            created_at=_parse_dt(row["created_at"]),
            updated_at=_parse_dt(row["updated_at"]),
        )

    def _job_from_row(self, row: sqlite3.Row) -> TeacherGenerationJob:
        return TeacherGenerationJob(
            job_id=row["job_id"],
            teacher_id=row["teacher_id"],
            class_id=row["class_id"],
            target_student_id=row["target_student_id"],
            teaching_package_id=row["teaching_package_id"],
            generate_task_id=row["generate_task_id"],
            status=row["status"],
            message=row["message"],
            results=_json_loads(row["results_json"], None),
            review_items=self._review_items_for_package(row["teaching_package_id"]),
            created_at=_parse_dt(row["created_at"]),
            updated_at=_parse_dt(row["updated_at"]),
        )

    def _review_from_row(self, row: sqlite3.Row) -> TeacherReviewItem:
        return TeacherReviewItem(
            id=row["review_id"],
            package_id=row["package_id"],
            teacher_id=row["teacher_id"],
            class_id=row["class_id"],
            title=row["title"],
            type=row["type"],
            student=row["student_id"],
            status=row["status"],
            agent=row["agent"],
            reason=row["reason"],
            rationale=_json_loads(row["rationale_json"], {}),
            created_at=_parse_dt(row["created_at"]),
        )

    def _review_items_for_package(self, package_id: str) -> list[TeacherReviewItem]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM teacher_review_items
                WHERE package_id = ?
                ORDER BY created_at DESC
                """,
                (package_id,),
            ).fetchall()
        return [self._review_from_row(row) for row in rows]

    def _build_review_items(
        self,
        job: TeacherGenerationJob,
        results: dict[str, Any],
        created_at: str,
    ) -> list[TeacherReviewItem]:
        items: list[TeacherReviewItem] = []

        def add(kind: str, title: str, agent: str, rationale: dict[str, Any]) -> None:
            reason = _first_text(rationale.get("addressed_weakness")) or _first_text(
                rationale.get("matched_profile")
            ) or "根据教师目标与班级证据生成，等待老师审核。"
            items.append(
                TeacherReviewItem(
                    id=f"review_{job.job_id}_{kind.lower()}",
                    package_id=job.teaching_package_id,
                    teacher_id=job.teacher_id,
                    class_id=job.class_id,
                    title=title,
                    type=kind,
                    student=job.target_student_id,
                    status="pending",
                    agent=agent,
                    reason=reason,
                    rationale=rationale,
                    created_at=_parse_dt(created_at),
                )
            )

        document = results.get("document")
        if isinstance(document, dict):
            body = document.get("document") if isinstance(document.get("document"), dict) else {}
            rationale = document.get("rationale") if isinstance(document.get("rationale"), dict) else {}
            add("Document", str(body.get("title") or "教师讲解材料"), str(rationale.get("agent_name") or "DocumentAgent"), rationale)

        exercise = results.get("exercise")
        if isinstance(exercise, dict):
            questions = exercise.get("questions") if isinstance(exercise.get("questions"), list) else []
            rationale = exercise.get("rationale") if isinstance(exercise.get("rationale"), dict) else {}
            add("Exercise", f"课堂测验 · {len(questions)} 题", str(rationale.get("agent_name") or "ExerciseAgent"), rationale)

        visual = results.get("visual")
        if isinstance(visual, dict):
            rationale = visual.get("rationale") if isinstance(visual.get("rationale"), dict) else {}
            add("Visual", "思维导图与步骤动画", str(rationale.get("agent_name") or "VisualAgent"), rationale)

        code = results.get("code")
        if isinstance(code, dict):
            rationale = code.get("rationale") if isinstance(code.get("rationale"), dict) else {}
            add("Code", "双语代码走查案例", str(rationale.get("agent_name") or "CodeAgent"), rationale)

        supplemental = results.get("supplemental")
        if isinstance(supplemental, dict):
            rationale = supplemental.get("rationale") if isinstance(supplemental.get("rationale"), dict) else {}
            knowledge_name = str(supplemental.get("target_knowledge_name") or "当前知识点")
            videos = supplemental.get("videos") if isinstance(supplemental.get("videos"), list) else []
            readings = supplemental.get("readings") if isinstance(supplemental.get("readings"), list) else []
            if videos:
                add("Video", f"{knowledge_name} · B站视频补充资源", "ResourceScoutAgent", rationale)
            if readings:
                add("Reading", f"{knowledge_name} · 拓展阅读与本地演示", "ResourceScoutAgent", rationale)

        return items

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def _json_loads(value: str | None, default: Any) -> Any:
    if value is None:
        return default
    return json.loads(value)


def _first_text(value: Any) -> str:
    if isinstance(value, list) and value:
        return str(value[0])
    if isinstance(value, str):
        return value
    return ""


def _profile_for_seed_student(
    *,
    student_id: str,
    focus: str,
    mastery: int,
    risk: str,
    knowledge_id: str,
) -> Profile:
    pace = "slow" if risk == "high" else "medium"
    return Profile(
        major="计算机科学与技术",
        knowledge_levels={knowledge_id: max(0.0, min(1.0, mastery / 100))},
        goal=f"{student_id} 需要围绕 {focus} 完成补救学习",
        style=["diagram", "step_by_step"],
        weakness=[focus],
        preference=["animation", "exercise", "document", "code_sample"],
        pace=pace,
        progress=Progress(current_chapter=knowledge_id, completed=[]),
    )


def _seed_teacher_results(*, student_id: str, knowledge_id: str, knowledge_name: str) -> dict[str, Any]:
    weakness = ["递归栈顺序混乱", "无法稳定区分先序 / 中序 / 后序的访问时机"]
    document_rationale = _seed_rationale(
        agent_name="DocumentAgent",
        prompt_version="document_agent_v1",
        matched_profile=["学习偏好：图解 + 分步骤讲解", "课堂策略：先降负再回到代码层"],
        addressed_weakness=weakness,
    )
    exercise_rationale = _seed_rationale(
        agent_name="ExerciseAgent",
        prompt_version="exercise_agent_v1",
        matched_profile=["练后立刻回收，避免概念悬空", "优先使用低门槛检测题"],
        addressed_weakness=weakness,
    )
    visual_rationale = _seed_rationale(
        agent_name="VisualAgent",
        prompt_version="visual_agent_v1",
        matched_profile=["学生对步骤动画响应更好", "适合把递归栈拆成连续动作"],
        addressed_weakness=weakness,
    )
    code_rationale = _seed_rationale(
        agent_name="CodeAgent",
        prompt_version="code_agent_v1",
        matched_profile=["讲解后补代码最稳妥", "保留 Python / Java 双语对照"],
        addressed_weakness=weakness,
    )
    supplemental = build_supplemental_resources(
        knowledge_id=knowledge_id,
        knowledge_name=knowledge_name,
        student_id=student_id,
        weakness=weakness,
    )

    return {
        "profile": {
            "student_id": student_id,
            "goal": f"{student_id} 需要围绕 {knowledge_name} 完成一轮补救学习",
            "weakness": weakness,
            "preference": ["diagram", "animation", "code_sample"],
        },
        "plan": {
            "teaching_objective": "先通过图解建立遍历顺序感，再回到代码与检测题完成闭环。",
            "task_order": ["DocumentAgent", "VisualAgent", "CodeAgent", "ExerciseAgent", "EvaluationAgent"],
        },
        "document": {
            "document": {
                "title": "二叉树遍历补救讲义",
                "sections": [
                    {
                        "heading": "是什么",
                        "body_md": "二叉树遍历的核心不是背顺序，而是明确“什么时候访问当前节点”。",
                    },
                    {
                        "heading": "为什么会错",
                        "body_md": "学生会把进入左子树、回到父节点、再去右子树这三步混成同一个动作，导致递归栈顺序失真。",
                    },
                    {
                        "heading": "怎么讲",
                        "body_md": "先只讲一棵三层树，让学生口述每一步访问动作，再把动作映射到递归函数调用。",
                    },
                ],
                "key_diagrams": [{"type": "tree_recursion_stack", "data": {"root": "A", "left": "B", "right": "C"}}],
            },
            "rationale": document_rationale,
        },
        "exercise": {
            "questions": [
                {
                    "qid": "q1",
                    "type": "single_choice",
                    "stem": "关于「二叉树遍历」，下列哪种说法最准确地刻画了易错点：二叉树遍历 / 递归栈？",
                    "options": [
                        "先序遍历只要记住根左右即可，不需要关心函数返回时机",
                        "遍历顺序的混乱通常发生在“访问节点”和“返回父节点”的时机没有分清",
                        "所有遍历都可以用同一份打印代码，只是注释不同",
                    ],
                    "answer": "遍历顺序的混乱通常发生在“访问节点”和“返回父节点”的时机没有分清",
                    "explanation": "先序、中序、后序真正不同的不是走法，而是“访问当前节点”的时机。",
                    "tags": ["二叉树", "递归栈", "遍历顺序"],
                    "difficulty": 2,
                    "expected_time_sec": 45,
                },
                {
                    "qid": "q2",
                    "type": "short_answer",
                    "stem": "口述一棵根节点为 A 的二叉树先序遍历时，访问当前节点发生在什么时候？",
                    "options": [],
                    "answer": "在进入左右子树之前先访问当前节点。",
                    "explanation": "先序遍历的关键提醒是“先访问，再递归”。",
                    "tags": ["先序遍历"],
                    "difficulty": 2,
                    "expected_time_sec": 60,
                },
            ],
            "rationale": exercise_rationale,
        },
        "visual": {
            "mindmap_md": "- 二叉树遍历\n  - 访问时机\n    - 先序：根左右\n    - 中序：左根右\n    - 后序：左右根\n  - 递归栈\n    - 进入\n    - 返回\n",
            "animation": {
                "scene": "递归栈与访问时机演示",
                "initial_state": {"root": "A", "left": "B", "right": "C"},
                "steps": [
                    {
                        "action": "highlight",
                        "target": "root",
                        "narration": "先把根节点高亮，强调“访问当前节点”的动作要单独说出来。",
                        "duration_ms": 1200,
                        "links_to_doc_section": "是什么",
                    },
                    {
                        "action": "expand-left",
                        "target": "left-subtree",
                        "narration": "进入左子树时，只是继续递归，不代表已经完成当前节点的全部流程。",
                        "duration_ms": 1400,
                        "links_to_doc_section": "为什么会错",
                    },
                    {
                        "action": "return-parent",
                        "target": "stack-frame",
                        "narration": "回到父节点后再访问或转向右子树，学生最容易在这里跳步。",
                        "duration_ms": 1500,
                        "links_to_doc_section": "怎么讲",
                    },
                ],
            },
            "rationale": visual_rationale,
        },
        "code": {
            "code_samples": [
                {
                    "lang": "python",
                    "filename": "demo.py",
                    "code": "def preorder(node):\n    if node is None:\n        return\n    print(node.val)\n    preorder(node.left)\n    preorder(node.right)\n",
                    "step_comments": [
                        {"line_range": [1, 3], "explanation": "先判断空节点，保证递归终止条件清晰。"},
                        {"line_range": [4, 6], "explanation": "访问根节点后，再递归左右子树。"},
                    ],
                    "complexity": {"time": "O(n)", "space": "O(h)"},
                    "trace": [{"step": 1, "state": "visit root"}, {"step": 2, "state": "go left"}, {"step": 3, "state": "go right"}],
                },
                {
                    "lang": "java",
                    "filename": "DemoTraversal.java",
                    "code": "void preorder(TreeNode node) {\n    if (node == null) {\n        return;\n    }\n    System.out.println(node.val);\n    preorder(node.left);\n    preorder(node.right);\n}\n",
                    "step_comments": [
                        {"line_range": [1, 4], "explanation": "保持和 Python 版本一致，方便课堂对照讲解。"},
                        {"line_range": [5, 7], "explanation": "先访问，再递归左右。"},
                    ],
                    "complexity": {"time": "O(n)", "space": "O(h)"},
                    "trace": [{"step": 1, "state": "visit root"}, {"step": 2, "state": "expand children"}],
                },
            ],
            "rationale": code_rationale,
        },
        "evaluation": {
            "evaluation_delta": {
                "knowledge_id": knowledge_id,
                "observed_correct_rate": 0.78,
                "estimated_mastery": 0.66,
                "new_weakness": [],
                "resolved_weakness": ["能说清先序遍历的访问时机"],
                "next_difficulty_recommendation": 3,
                "next_focus": "继续巩固中序与后序的返回时机",
            },
            "narrative": "本轮答题与口述表现表明学生已经能区分“访问节点”和“递归返回”，适合进入下一轮巩固。",
            "rationale": {
                "evidence": [
                    {"qid": "q1", "verdict": "correct", "weight": 0.6},
                    {"qid": "q2", "verdict": "partially_correct", "weight": 0.4},
                ],
                "agent_name": "EvaluationAgent",
                "prompt_version": "evaluation_agent_v1",
            },
        },
        "supplemental": supplemental,
        "errors": {},
    }


def _seed_rationale(
    *,
    agent_name: str,
    prompt_version: str,
    matched_profile: list[str],
    addressed_weakness: list[str],
) -> dict[str, Any]:
    return {
        "matched_profile": matched_profile,
        "addressed_weakness": addressed_weakness,
        "difficulty_adjusted_from": 3,
        "difficulty_used": 2,
        "agent_name": agent_name,
        "prompt_version": prompt_version,
        "model_name": "teacher-seed-studio",
        "cited_sources": [
            {"title": "数据结构课程讲义：二叉树遍历", "page": "42-45", "similarity": 0.92},
            {"title": "教师补救课模板", "page": "lesson-plan", "similarity": 0.88},
        ],
    }
