"""
应用配置。

从环境变量加载讯飞星火与服务参数。
"""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    """全局配置。生产中可换成 pydantic-settings。"""

    spark_api_key: str = os.getenv("SPARK_API_KEY", "")
    spark_base_url: str = os.getenv(
        "SPARK_BASE_URL",
        "https://spark-api-open.xf-yun.com/v1",
    )
    spark_model: str = os.getenv("SPARK_MODEL", "generalv3.5")

    cors_origins: tuple[str, ...] = (
        "http://localhost:8000",
        "http://localhost:5173",
    )


def get_settings() -> Settings:
    return Settings()
