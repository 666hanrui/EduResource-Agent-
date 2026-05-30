"""
LLM 调用封装。

职责：
- 统一不同模型供应商的调用接口（讯飞星火 X2 / 4.0 Turbo 主力，OpenAI 兼容协议备份）
- JSON 输出修复（处理 markdown code fence、尾随逗号等常见 LLM 顽疾）
- 流式输出（async iterator）
- token 计量（用于演示面板的"已花 token"展示）

设计要点：
- 默认走 OpenAI 兼容协议，因为讯飞星火 X2 已支持
- 单独一层 _repair_json() 让所有 Agent 共享 JSON 抗错能力
- 失败重试在 LLMService.generate_structured() 中实现，最多 3 次
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, AsyncIterator, Type, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


@dataclass
class LLMConfig:
    """LLM 调用配置。"""

    base_url: str = "https://spark-api-open.xf-yun.com/v1"
    api_key: str = ""
    model: str = "generalv3.5"  # 讯飞星火 X2 对应 model 名
    temperature: float = 0.2
    max_tokens: int = 2048
    timeout_sec: float = 60.0


@dataclass
class LLMResponse:
    """LLM 调用结果。"""

    content: str
    prompt_tokens: int = 0
    completion_tokens: int = 0

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


class LLMService:
    """LLM 调用服务。"""

    def __init__(self, config: LLMConfig) -> None:
        self.config = config
        # mounts={} 显式禁用环境代理（避免 SOCKS 代理误拦截 LLM 调用）
        # trust_env=False 防止 httpx 自动读取 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY
        self._client = httpx.AsyncClient(
            timeout=config.timeout_sec,
            trust_env=False,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    def _auth_headers(self) -> dict[str, str]:
        api_key = self.config.api_key.strip()
        if not api_key:
            raise RuntimeError("SPARK_API_KEY is not configured")
        return {"Authorization": f"Bearer {api_key}"}

    # ─────────────────────────────── 基础调用 ───────────────────────────────

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        response_format_json: bool = False,
    ) -> LLMResponse:
        """非流式 chat completion，返回完整内容和 token 计数。"""
        body: dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else self.config.temperature,
            "max_tokens": self.config.max_tokens,
        }
        if response_format_json:
            body["response_format"] = {"type": "json_object"}

        resp = await self._client.post(
            f"{self.config.base_url}/chat/completions",
            json=body,
            headers=self._auth_headers(),
        )
        resp.raise_for_status()
        data = resp.json()

        choice = data["choices"][0]
        content = choice["message"]["content"]
        usage = data.get("usage", {})

        return LLMResponse(
            content=content,
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
        )

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
    ) -> AsyncIterator[str]:
        """流式 chat completion，逐 token yield 文本片段。

        前端 SSE 直接转发这些 delta 即可实现"打字机效果"。
        """
        body = {
            "model": self.config.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": True,
        }
        async with self._client.stream(
            "POST",
            f"{self.config.base_url}/chat/completions",
            json=body,
            headers=self._auth_headers(),
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    return
                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                if delta:
                    yield delta

    # ─────────────────────────────── 结构化输出 ───────────────────────────────

    async def generate_structured(
        self,
        messages: list[dict[str, str]],
        schema: Type[T],
        *,
        temperature: float | None = None,
        max_retries: int = 3,
    ) -> tuple[T, LLMResponse]:
        """生成符合给定 Pydantic Schema 的结构化输出。

        失败时自动追加修复指令重试，最多 max_retries 次。
        三次失败后由调用方决定是否走模板兜底（见各 Agent 实现）。
        """
        history = list(messages)
        last_error: Exception | None = None

        for attempt in range(1, max_retries + 1):
            response = await self.chat(history, temperature=temperature, response_format_json=True)
            raw = _repair_json(response.content)
            try:
                parsed = schema.model_validate_json(raw)
                return parsed, response
            except ValidationError as exc:
                last_error = exc
                logger.warning(
                    "结构化输出校验失败 (attempt=%d/%d): %s",
                    attempt,
                    max_retries,
                    exc.errors()[:2],
                )
                # 把上次的错误反馈给模型，让它修
                history.append({"role": "assistant", "content": response.content})
                history.append(
                    {
                        "role": "user",
                        "content": (
                            "上一条 JSON 输出未通过 Schema 校验，请按下面的错误信息修正后重输：\n"
                            f"{exc.errors()[:5]}\n"
                            "只输出修正后的 JSON，不要任何解释。"
                        ),
                    }
                )

        raise RuntimeError(f"结构化输出连续 {max_retries} 次失败: {last_error}")


# ─────────────────────────────── JSON 修复 ───────────────────────────────


_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*\n(.*?)\n```\s*$", re.DOTALL)
_TRAILING_COMMA_RE = re.compile(r",(\s*[}\]])")


def _repair_json(raw: str) -> str:
    """常见 LLM JSON 缺陷修复。

    处理：
    - markdown code fence 包裹
    - 尾随逗号（GPT 系列偶发）
    - 前后多余的解释性文字（取第一个 {/[ 到最后一个 }/]）
    """
    text = raw.strip()

    fence = _CODE_FENCE_RE.match(text)
    if fence:
        text = fence.group(1).strip()

    # 截取第一个 { 或 [ 到最后一个 } 或 ]
    start = min(
        (i for i in (text.find("{"), text.find("[")) if i != -1),
        default=-1,
    )
    end = max(text.rfind("}"), text.rfind("]"))
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]

    text = _TRAILING_COMMA_RE.sub(r"\1", text)

    return text
