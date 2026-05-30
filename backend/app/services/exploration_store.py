"""Persistent storage for the professional exploration module."""

from __future__ import annotations

import json
import os
from pathlib import Path

from ..schemas.exploration import ExplorationWorkspace, FavoriteDirection


def default_store_path() -> Path:
    """Return the local JSON store path.

    The project is still lightweight, so a JSON store gives the module restart-safe
    state without introducing a database dependency. It can be replaced by SQL later.
    """

    configured = os.getenv("EDU_EXPLORATION_STORE_PATH")
    if configured:
        return Path(configured).expanduser()
    return Path(__file__).resolve().parents[2] / ".data" / "exploration_store.json"


class JsonExplorationStore:
    """Tiny JSON repository for favorites and exploration workspaces."""

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
