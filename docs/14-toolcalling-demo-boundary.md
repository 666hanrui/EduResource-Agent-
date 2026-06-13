# ToolCallingFlow 演示边界说明

> 本文档用于明确 `/api/generate/tool-calling` 在当前项目中的定位，避免把实验性动态调度链路误当成正式主演示链路。

## 1. 当前系统有两条生成链路

### 1.1 正式演示主链路：GenerateFlow / 教师教学包接口

正式演示默认使用：

```http
POST /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages
```

该接口内部会构造 `GenerateRequest`，并调用：

```py
ctx.orchestrator.run_generate(generate_task_id, generate_payload)
```

也就是稳定的 `GenerateFlow`。

这条链路的特点：

- 调用顺序清晰
- SSE 事件可观察
- 结果可持久化到 GenerateStore
- 生成结果会写入 TeacherStore
- 会自动拆分 TeacherReviewItem
- 可继续导出 PPTX / Markdown 教案
- 适合答辩、录屏、现场演示

### 1.2 增强展示链路：ToolCallingFlow

增强展示接口为：

```http
POST /api/generate/tool-calling
```

它用于展示 MainAgent Supervisor 动态决策能力。不同于固定流水线，它可以由模型决定下一步调用哪个工具或 Agent。

这条链路适合展示：

- MainAgent 自主规划
- 多轮工具调用
- 动态选择 Agent
- Agentic 系统的扩展能力

但它不适合作为主演示链路，因为它更依赖模型输出稳定性和 prompt 约束效果。

## 2. 演示时的推荐说法

答辩时建议这样讲：

> 系统当前同时保留稳定流水线和动态主控两种模式。比赛演示默认使用稳定的教师教学包链路，保证输出可控、可追踪、可导出；ToolCallingFlow 用于展示系统具备向 MainAgent 动态调度演进的能力，不影响主业务闭环稳定性。

## 3. 降级行为

`Orchestrator.run_tool_calling(...)` 当前设计为：

- 如果注入了 `llm_service`，走 ToolCallingFlow
- 如果没有注入 `llm_service`，自动降级到 GenerateFlow

这意味着：

- ToolCallingFlow 不会阻断主演示链路
- 缺少动态调度依赖时，系统仍能通过固定流水线产出资源
- 演示时不应把 ToolCalling 的输出稳定性作为唯一证明点

## 4. 前端接入原则

如果未来在前端展示 ToolCallingFlow，建议满足以下原则：

1. 入口标注为“实验模式”或“Advanced”。
2. 不替换老师端默认生成按钮。
3. 失败时展示降级说明，而不是让用户误以为教师教学包生成失败。
4. ToolCalling 结果可以展示在 AgentFlowViz 或高级调度面板中。

## 5. 当前推荐演示路径

### 老师端主演示

```text
GET  /api/teachers/tch_001/dashboard
POST /api/teachers/tch_001/classes/class-ds-boost/teaching-packages
GET  /api/tasks/{generate_task_id}/events
GET  /api/teachers/tch_001/classes/class-ds-boost/teaching-packages/{job_id}
GET  /api/teachers/tch_001/classes/class-ds-boost/teaching-packages/{package_id}/lesson-plan.md
```

### 学生端主演示

```text
GET  /api/students/stu_001/dashboard
POST /api/students/stu_001/interactive-classrooms
GET  /api/resource-packages/{package_id}
POST /api/integrations/openmaic/exercise-attempts
GET  /api/students/stu_001/dashboard
```

### 增强展示

```text
POST /api/generate/tool-calling
GET  /api/tasks/{task_id}/events
GET  /api/tasks/{task_id}/results
```

## 6. 验收标准

- README 与架构文档都明确：主演示使用 GenerateFlow / 教师教学包接口。
- ToolCallingFlow 被描述为增强展示，不是主路径依赖。
- 教师教学包生成失败不应该归因到 ToolCallingFlow。
- 前端如果未来添加 ToolCalling 按钮，应放在高级模式而非默认生成按钮。
