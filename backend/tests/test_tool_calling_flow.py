from __future__ import annotations

from app.agents.generate_flow import GenerateOutputs, GenerateRequest, GenerateSelectionContext
from app.agents.main_agent_flow import MainAgentDecision, _rule_decision


def _state(req: GenerateRequest, outputs: GenerateOutputs | None = None, history: list | None = None) -> dict:
    return {
        "task_id": "task_test",
        "req": req,
        "outputs": outputs or GenerateOutputs(),
        "history": history or [],
        "iterations": 0,
        "max_tool_calls": 8,
        "started_at": 0.0,
        "finished": False,
    }


def test_main_agent_rule_prefers_teacher_package_tool() -> None:
    req = GenerateRequest(
        student_id="stu_018",
        knowledge_id="binary-tree-traversal",
        knowledge_name="二叉树遍历",
        selection_context=GenerateSelectionContext(
            source="teacher_console",
            reason="老师想生成补救课",
            suggested_difficulty=2,
        ),
        main_agent_args={
            "create_teacher_package": {
                "teacher_id": "tch_001",
                "class_id": "class-ds-boost",
                "job_id": "job_001",
            }
        },
    )

    decision = _rule_decision(_state(req))

    assert isinstance(decision, MainAgentDecision)
    assert decision.action == "call_tool"
    assert decision.tool_names == ["create_teacher_package"]


def test_main_agent_rule_prefers_openmaic_for_exploration() -> None:
    req = GenerateRequest(
        student_id="stu_001",
        knowledge_id="linked-list-basics",
        knowledge_name="链表",
        selection_context=GenerateSelectionContext(
            source="exploration",
            reason="探索路径推荐互动课堂验证",
            suggested_difficulty=3,
        ),
    )

    decision = _rule_decision(_state(req))

    assert decision.action == "call_tool"
    assert decision.tool_names == ["create_interactive_classroom"]


def test_main_agent_rule_uses_generate_flow_for_manual_lightweight_request() -> None:
    req = GenerateRequest(
        student_id="stu_001",
        knowledge_id="stack-basics",
        knowledge_name="栈",
        selection_context=GenerateSelectionContext(source="manual", reason="快速复习"),
    )

    decision = _rule_decision(_state(req))

    assert decision.action == "call_tool"
    assert decision.tool_names == ["run_generate_flow"]
