"""SQLite store for EduResource resource packages imported from OpenMAIC."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from ..schemas.student import EvaluationRecord, ExerciseAttempt, ExerciseSet, ResourcePackage


def default_store_path() -> Path:
    configured = os.getenv("EDU_RESOURCE_DB_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / ".data" / "resource_packages.sqlite3"


class SQLiteResourcePackageStore:
    """Persist ResourcePackage and ExerciseSet payloads as JSON documents."""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path).expanduser() if path is not None else default_store_path()
        self._ensure_schema()

    def save(self, package: ResourcePackage, exercise_set: ExerciseSet | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        package_payload = json.dumps(package.model_dump(mode="json"), ensure_ascii=False)
        exercise_payload = (
            json.dumps(exercise_set.model_dump(mode="json"), ensure_ascii=False)
            if exercise_set is not None
            else None
        )
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO resource_packages (id, updated_at, payload)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    updated_at = excluded.updated_at,
                    payload = excluded.payload
                """,
                (package.id, now, package_payload),
            )
            if exercise_set is not None:
                conn.execute(
                    """
                    INSERT INTO exercise_sets (id, package_id, updated_at, payload)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        package_id = excluded.package_id,
                        updated_at = excluded.updated_at,
                        payload = excluded.payload
                    """,
                    (exercise_set.id, exercise_set.package_id, now, exercise_payload),
                )

    def get_package(self, package_id: str) -> ResourcePackage | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM resource_packages WHERE id = ?",
                (package_id,),
            ).fetchone()
        if row is None:
            return None
        return ResourcePackage.model_validate(json.loads(row["payload"]))

    def get_exercise_set_by_package(self, package_id: str) -> ExerciseSet | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM exercise_sets WHERE package_id = ?",
                (package_id,),
            ).fetchone()
        if row is None:
            return None
        return ExerciseSet.model_validate(json.loads(row["payload"]))

    def list_packages(
        self,
        *,
        owner_id: str | None = None,
        owner_role: str | None = None,
        limit: int = 10,
    ) -> list[ResourcePackage]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload FROM resource_packages ORDER BY updated_at DESC, id DESC"
            ).fetchall()
        packages = [ResourcePackage.model_validate(json.loads(row["payload"])) for row in rows]
        if owner_id is not None:
            packages = [package for package in packages if package.owner_id == owner_id]
        if owner_role is not None:
            packages = [package for package in packages if package.owner_role == owner_role]
        return packages[:limit]

    def save_attempts_and_evaluation(
        self,
        attempts: list[ExerciseAttempt],
        evaluation: EvaluationRecord,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            for attempt in attempts:
                conn.execute(
                    """
                    INSERT INTO exercise_attempts (id, student_id, package_id, updated_at, payload)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        student_id = excluded.student_id,
                        package_id = excluded.package_id,
                        updated_at = excluded.updated_at,
                        payload = excluded.payload
                    """,
                    (
                        attempt.id,
                        attempt.student_id,
                        attempt.package_id,
                        now,
                        json.dumps(attempt.model_dump(mode="json"), ensure_ascii=False),
                    ),
                )
            conn.execute(
                """
                INSERT INTO evaluation_records (id, student_id, package_id, updated_at, payload)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    student_id = excluded.student_id,
                    package_id = excluded.package_id,
                    updated_at = excluded.updated_at,
                    payload = excluded.payload
                """,
                (
                    evaluation.id,
                    evaluation.student_id,
                    evaluation.package_id,
                    now,
                    json.dumps(evaluation.model_dump(mode="json"), ensure_ascii=False),
                ),
            )

    def list_attempts(
        self,
        package_id: str,
        student_id: str | None = None,
    ) -> list[ExerciseAttempt]:
        query = "SELECT payload FROM exercise_attempts WHERE package_id = ?"
        params: tuple[str, ...] = (package_id,)
        if student_id:
            query += " AND student_id = ?"
            params = (package_id, student_id)
        query += " ORDER BY updated_at ASC, id ASC"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [ExerciseAttempt.model_validate(json.loads(row["payload"])) for row in rows]

    def list_evaluations(
        self,
        package_id: str,
        student_id: str | None = None,
    ) -> list[EvaluationRecord]:
        query = "SELECT payload FROM evaluation_records WHERE package_id = ?"
        params: tuple[str, ...] = (package_id,)
        if student_id:
            query += " AND student_id = ?"
            params = (package_id, student_id)
        query += " ORDER BY updated_at ASC, id ASC"
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [EvaluationRecord.model_validate(json.loads(row["payload"])) for row in rows]

    def list_evaluations_for_student(
        self,
        student_id: str,
        *,
        limit: int = 10,
    ) -> list[EvaluationRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT payload FROM evaluation_records
                WHERE student_id = ?
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
                """,
                (student_id, limit),
            ).fetchall()
        return [EvaluationRecord.model_validate(json.loads(row["payload"])) for row in rows]

    def _ensure_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS resource_packages (
                    id TEXT PRIMARY KEY,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS exercise_sets (
                    id TEXT PRIMARY KEY,
                    package_id TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_exercise_sets_package"
                " ON exercise_sets(package_id)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS exercise_attempts (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    package_id TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_exercise_attempts_package_student"
                " ON exercise_attempts(package_id, student_id)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS evaluation_records (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    package_id TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_evaluation_records_package_student"
                " ON evaluation_records(package_id, student_id)"
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn
