"""
CodeAgent —— 代码案例生成 Agent。

输入：KnowledgeBreakdown + ResourceTaskParams + 学生画像摘要 + 语言列表
输出：CodeResult（含 python + java 双语示例 + step_comments + trace + rationale）
失败兜底：拼接最简单的 hello-world 风格示例，确保不空白。
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from ..schemas.profile import Rationale
from ..schemas.resource import (
    CodeComplexity,
    CodeResult,
    CodeSample,
    CodeTraceStep,
    KnowledgeBreakdown,
    ResourceTaskParams,
    StepComment,
)
from ..services.llm_service import LLMService
from .base import AgentRuntime, BaseAgent
from .document_agent import ProfileSummary
from .event_bus import EventBus

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "code_agent_v1.md"

CodeLang = Literal["python", "java"]


class CodeAgentInput(BaseModel):
    knowledge_breakdown: KnowledgeBreakdown
    params: ResourceTaskParams
    profile_summary: ProfileSummary = Field(default_factory=ProfileSummary)
    languages: list[CodeLang] = Field(default_factory=lambda: ["python", "java"])


class CodeAgent(BaseAgent[CodeAgentInput, CodeResult]):
    """代码案例生成 Agent。"""

    name = "CodeAgent"
    prompt_version = "v1"

    def __init__(self, event_bus: EventBus, llm_service: LLMService) -> None:
        super().__init__(event_bus)
        self.llm = llm_service
        self._system_prompt = _PROMPT_PATH.read_text(encoding="utf-8")

    async def _run_impl(
        self, runtime: AgentRuntime, payload: CodeAgentInput
    ) -> CodeResult:
        messages = [
            {"role": "system", "content": self._system_prompt},
            {"role": "user", "content": payload.model_dump_json(indent=2)},
        ]
        try:
            result, llm_response = await self.llm.generate_structured(
                messages,
                schema=CodeResult,
                temperature=0.2,
                max_retries=3,
            )
            runtime.token_used = llm_response.total_tokens
        except Exception as exc:
            logger.warning("CodeAgent LLM 三次失败，启用规则兜底：%s", exc)
            runtime.extra["fallback"] = True
            return _rule_based_code(payload)

        await self.emit_delta(
            runtime,
            {
                "stage": "code_finalized",
                "sample_count": len(result.code_samples),
                "languages": [s.lang for s in result.code_samples],
            },
        )
        return result


# ─────────────────────────────── 规则兜底 ───────────────────────────────


_PY_TEMPLATE = '''"""{title} —— 规则兜底示例。"""


def demo() -> None:
    # 1. {kp1}
    data = []
    # 2. {kp2}
    data.append("step")
    # 3. {kp3}
    print(data)


if __name__ == "__main__":
    demo()
'''

_JAVA_TEMPLATE = '''public class Demo {{
    // 1. {kp1}
    // 2. {kp2}
    // 3. {kp3}
    public static void main(String[] args) {{
        System.out.println("{title} demo");
    }}
}}
'''


def _rule_based_code(payload: CodeAgentInput) -> CodeResult:
    kb = payload.knowledge_breakdown
    title = kb.concept or "Knowledge"
    kps = (kb.key_points + ["", "", ""])[:3]

    samples: list[CodeSample] = []
    if "python" in payload.languages:
        code = _PY_TEMPLATE.format(title=title, kp1=kps[0], kp2=kps[1], kp3=kps[2])
        samples.append(
            CodeSample(
                lang="python",
                filename="demo.py",
                code=code,
                step_comments=[
                    StepComment(line_range=(5, 5), explanation=kps[0] or "step 1"),
                    StepComment(line_range=(7, 7), explanation=kps[1] or "step 2"),
                    StepComment(line_range=(9, 9), explanation=kps[2] or "step 3"),
                ],
                complexity=CodeComplexity(time="O(n)", space="O(n)"),
                trace=[
                    CodeTraceStep(step=1, state="data=[]"),
                    CodeTraceStep(step=2, state="data=['step']"),
                    CodeTraceStep(step=3, state="print → ['step']"),
                ],
            )
        )
    if "java" in payload.languages:
        code = _JAVA_TEMPLATE.format(title=title, kp1=kps[0], kp2=kps[1], kp3=kps[2])
        samples.append(
            CodeSample(
                lang="java",
                filename="Demo.java",
                code=code,
                step_comments=[
                    StepComment(line_range=(2, 2), explanation=kps[0] or "step 1"),
                    StepComment(line_range=(3, 3), explanation=kps[1] or "step 2"),
                    StepComment(line_range=(4, 4), explanation=kps[2] or "step 3"),
                ],
                complexity=CodeComplexity(time="O(1)", space="O(1)"),
                trace=[
                    CodeTraceStep(step=1, state="JVM 启动"),
                    CodeTraceStep(step=2, state="进入 main"),
                    CodeTraceStep(step=3, state=f"打印「{title} demo」"),
                ],
            )
        )

    return CodeResult(
        code_samples=samples,
        rationale=Rationale(
            matched_profile=["style:code"],
            addressed_weakness=payload.profile_summary.weakness,
            difficulty_adjusted_from=payload.params.difficulty,
            difficulty_used=payload.params.difficulty,
            agent_name="CodeAgent",
            prompt_version="v1",
            model_name="rule-based-fallback",
        ),
    )
