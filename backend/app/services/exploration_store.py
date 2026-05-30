"""Persistent storage for the professional exploration module."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

from ..schemas.exploration import ExplorationWorkspace, FavoriteDirection


def default_store_path() -> Path:
    """Return the local SQLite store path."""

    configured = os.getenv("EDU_EXPLORATION_DB_PATH") or os.getenv("EDU_EXPLORATION_STORE_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / ".data" / "exploration_store.sqlite3"


class SQLiteExplorationStore:
    """SQLite repository for favorites and exploration workspaces.

    Complex nested pydantic models are stored as JSON payloads while key columns
    remain queryable. This keeps the module dependency-free and ready for a
    later move to a full relational schema.
    """

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path).expanduser() if path is not None else default_store_path()
        self._ensure_schema()

    def list_favorites(self) -> list[FavoriteDirection]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT payload
                FROM exploration_favorites
                ORDER BY created_at DESC
                """
            ).fetchall()
        return [FavoriteDirection.model_validate(json.loads(row["payload"])) for row in rows]

    def save_favorite(self, favorite: FavoriteDirection) -> None:
        payload = favorite.model_dump(mode="json")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO exploration_favorites (
                    favorite_id,
                    student_id,
                    direction_id,
                    created_at,
                    payload
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(favorite_id) DO UPDATE SET
                    student_id = excluded.student_id,
                    direction_id = excluded.direction_id,
                    created_at = excluded.created_at,
                    payload = excluded.payload
                """,
                (
                    favorite.favorite_id,
                    favorite.student_id,
                    favorite.direction.id,
                    favorite.created_at.isoformat(),
                    json.dumps(payload, ensure_ascii=False),
                ),
            )

    def get_workspace(self, workspace_id: str) -> ExplorationWorkspace | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT payload
                FROM exploration_workspaces
                WHERE workspace_id = ?
                """,
                (workspace_id,),
            ).fetchone()
        if row is None:
            return None
        return ExplorationWorkspace.model_validate(json.loads(row["payload"]))

    def save_workspace(self, workspace: ExplorationWorkspace) -> None:
        payload = workspace.model_dump(mode="json")
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO exploration_workspaces (
                    workspace_id,
                    favorite_id,
                    student_id,
                    updated_at,
                    payload
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(workspace_id) DO UPDATE SET
                    favorite_id = excluded.favorite_id,
                    student_id = excluded.student_id,
                    updated_at = excluded.updated_at,
                    payload = excluded.payload
                """,
                (
                    workspace.workspace_id,
                    workspace.favorite.favorite_id,
                    workspace.favorite.student_id,
                    workspace.updated_at.isoformat(),
                    json.dumps(payload, ensure_ascii=False),
                ),
            )

    def clear(self) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM exploration_workspaces")
            conn.execute("DELETE FROM exploration_favorites")

    def _ensure_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS exploration_favorites (
                    favorite_id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    direction_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_exploration_favorites_student
                ON exploration_favorites(student_id, created_at DESC)
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS exploration_workspaces (
                    workspace_id TEXT PRIMARY KEY,
                    favorite_id TEXT NOT NULL,
                    student_id TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_exploration_workspaces_student
                ON exploration_workspaces(student_id, updated_at DESC)
                """
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn


class JsonExplorationStore:
    """Tiny JSON repository kept for migration and narrow tests."""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path).expanduser() if path is not None else default_store_path()

    def list_favorites(self) -> list[FavoriteDirection]:
        data = self._read()
        return [
            FavoriteDirection.model_validate(item)
            for item in data.get("favorites", {}).values()
        ]

    def save_favorite(self, favorite: FavoriteDirection) -> None:
        data = self._read()
        favorites = data.setdefault("favorites", {})
        favorites[favorite.favorite_id] = favorite.model_dump(mode="json")
        self._write(data)

    def get_workspace(self, workspace_id: str) -> ExplorationWorkspace | None:
        data = self._read()
        raw = data.get("workspaces", {}).get(workspace_id)
        if raw is None:
            return None
        return ExplorationWorkspace.model_validate(raw)

    def save_workspace(self, workspace: ExplorationWorkspace) -> None:
        data = self._read()
        workspaces = data.setdefault("workspaces", {})
        workspaces[workspace.workspace_id] = workspace.model_dump(mode="json")
        self._write(data)

    def clear(self) -> None:
        self._write({"favorites": {}, "workspaces": {}})

    def _read(self) -> dict:
        if not self.path.exists():
            return {"favorites": {}, "workspaces": {}}
        with self.path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict):
            return {"favorites": {}, "workspaces": {}}
        data.setdefault("favorites", {})
        data.setdefault("workspaces", {})
        return data

    def _write(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        with tmp_path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
        tmp_path.replace(self.path)
