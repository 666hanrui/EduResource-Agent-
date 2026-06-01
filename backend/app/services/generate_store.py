"""SQLite persistence for GenerateFlow outputs.

Keeps generated results restart-safe instead of relying on a process-only cache.
最多保留最近 100 条记录（LRU），避免无限增长。
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def default_store_path() -> Path:
    configured = os.getenv("EDU_GENERATE_DB_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / ".data" / "generate_store.sqlite3"


MAX_RECORDS = 100


class SQLiteGenerateStore:
    """持久化 task_id -> generate outputs 的 SQLite 仓库。"""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path).expanduser() if path is not None else default_store_path()
        self._ensure_schema()

    def save(self, task_id: str, outputs: dict) -> None:
        """持久化 generate outputs，并自动清理旧记录保持 MAX_RECORDS 上限。"""
        now = datetime.now(timezone.utc).isoformat()
        payload = json.dumps(outputs, ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO generate_outputs (task_id, created_at, payload)
                VALUES (?, ?, ?)
                ON CONFLICT(task_id) DO UPDATE SET
                    created_at = excluded.created_at,
                    payload = excluded.payload
                """,
                (task_id, now, payload),
            )
            # 超出上限时删除最旧记录
            conn.execute(
                """
                DELETE FROM generate_outputs
                WHERE task_id NOT IN (
                    SELECT task_id FROM generate_outputs
                    ORDER BY created_at DESC
                    LIMIT ?
                )
                """,
                (MAX_RECORDS,),
            )

    def get(self, task_id: str) -> dict | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM generate_outputs WHERE task_id = ?",
                (task_id,),
            ).fetchone()
        if row is None:
            return None
        return json.loads(row["payload"])

    def load_all(self) -> dict[str, dict]:
        """启动时把所有已有记录加载到内存 dict。"""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT task_id, payload FROM generate_outputs ORDER BY created_at DESC"
            ).fetchall()
        return {row["task_id"]: json.loads(row["payload"]) for row in rows}

    def _ensure_schema(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS generate_outputs (
                    task_id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_generate_outputs_created"
                " ON generate_outputs(created_at DESC)"
            )

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn
