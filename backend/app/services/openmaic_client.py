"""Backend client for the isolated OpenMAIC interactive-classroom subsystem."""

from __future__ import annotations

from typing import Any

import httpx


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
