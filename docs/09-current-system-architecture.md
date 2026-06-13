# 当前真实系统架构说明

> 本文档用于同步当前仓库的真实实现状态，避免 README、早期方案文档与代码实际进度脱节。

## 1. 当前系统定位

EduResource-Agent 当前已经从“单一多 Agent 资源生成 Demo”演进为一个双端教育资源生产系统：

- **学生端**：围绕学生画像、专业探索、培养方案、互动课堂和证据回写，形成个性化学习闭环。
- **老师端**：围绕班级洞察、教学包生成、资源审核和干预闭环，形成教师侧教学资源生产工作台。
- **底层 Agent**：保留稳定的 GenerateFlow 固定流水线，同时新增 ToolCallingFlow 动态调度入口，用于展示 MainAgent 自主决策能力。

## 2. 前端入口与路由

入口文件：`frontend/src/main.tsx`

当前前端采用角色入口路由：

| 路径 | 说明 |
|------|------|
| `/` | 根据 `localStorage.eduresource-role` 自动进入老师端或学生端；无角色时进入身份入口 |
| `/register` | 身份入口 |
| `/register/teacher` | 设置老师身份并进入老师端 |
| `/register/student` | 设置学生身份并进入学生端 |
| `/teacher` | 老师端工作台 |
| `/student/...` | 学生端学习系统 |
| `/landing` | 首页/展示页 |

注意：React 正式入口是 `frontend/index.html` + `frontend/src/main.tsx`。仓库根部 `html/` 目录下的静态页面属于实验草稿，不参与正式路由。

## 3. 学生端主链路

入口文件：`frontend/src/App.tsx`

学生端当前由四个阶段组成：

1. **画像与广度探索**：`MajorExplorationPanel`
2. **培养方案**：`TrainingPlanBoard`
3. **课堂验证**：`InteractiveClassroomStudio`
4. **证据回写**：`ProgressOverview`

辅助组件：

- `StudentContextRail`：学生画像、当前阶段、上下文侧栏
- `TutorFloatingBall`：Live2D 数字人助教和前端操作入口
- `student-workspace/model.ts`：学生端学习系统状态聚合

学生端核心接口：

| 接口 | 用途 |
|------|------|
| `GET /api/students/{student_id}/dashboard` | 读取学生仪表盘、学习路径、评估与画像状态 |
| `POST /api/students/{student_id}/interactive-classrooms` | 创建 OpenMAIC 互动课堂任务 |
| `GET /api/students/{student_id}/interactive-classrooms/{job_id}` | 轮询互动课堂生成状态 |
| `POST /api/generate` | 轻量资源生成兼容入口 |
| `GET /api/tasks/{task_id}/results` | 获取轻量生成结果 |

## 4. 老师端主链路

入口目录：`frontend/src/components/TeacherPortal/`

老师端当前包含四个模块：

1. **总览**：班级进度、风险学生、掌握度趋势、Attention Queue
2. **生成**：教师选择学生、知识点和教学目标，触发教学包生成
3. **审核**：查看生成资源、溯源依据、生产指纹和审核状态
4. **干预**：把风险信号、教师动作和画像更新串成闭环

老师端关键组件：

- `TeacherPortal/index.tsx`：老师端容器、路由状态、生成状态
- `TeacherPortal/panels.tsx`：总览、生成、审核、干预面板
- `TeacherPortal/model.ts`：本地展示模型与 Demo 数据
- `TeacherPortal/teacher-mesh.css`：老师端局部样式
- `RationalePanel`：资源生成依据与生产指纹弹层

老师端后端业务边界已经建立，但前端仍有部分本地 Demo 数据，需要后续逐步接入真实教师接口。

老师端核心接口：

| 接口 | 用途 |
|------|------|
| `GET /api/teachers/{teacher_id}/dashboard` | 获取教师上下文、班级、风险队列、教学包、审核项 |
| `POST /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages` | 在教师业务边界下创建教学包生成任务 |
| `GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{job_id}` | 查询教师教学包生成任务 |
| `GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{package_id}/pptx` | 导出教学包 PPTX |

## 5. 后端 Agent 生成架构

核心目录：`backend/app/agents/`

### 5.1 GenerateFlow 固定流水线

文件：`backend/app/agents/generate_flow.py`

GenerateFlow 是稳定演示主链路，当前执行逻辑为：

1. ProfileAgent 读取或构建学习画像
2. PlannerAgent 拆解生成任务
3. 根据 PlannerAgent 的任务计划决定是否调用：
   - DocumentAgent
   - ExerciseAgent
   - VisualAgent
4. CodeAgent 基于上游结果生成代码案例
5. EvaluationAgent 汇总结果，输出闭环反馈
6. EventBus 推送 SSE 运行事件
7. 生成结果写入 SQLite 缓存

### 5.2 ToolCallingFlow 动态调度

文件：`backend/app/agents/langgraph_tool_calling_flow.py`

接口：`POST /api/generate/tool-calling`

用于展示 MainAgent Supervisor 动态决策能力。与 `/api/generate` 的差异：

- `/api/generate`：稳定、可控、适合正式演示
- `/api/generate/tool-calling`：由 LLM 动态决定工具调用，适合展示 Agent 自主规划，但稳定性受模型输出影响

## 6. SSE 可观测性

事件总线：`backend/app/agents/event_bus.py`

接口：`GET /api/tasks/{task_id}/events`

前端通过 EventSource 订阅：

- `agent.start`
- `agent.delta`
- `agent.done`
- `agent.error`
- `task.summary`

相关前端组件：

- `AgentTracePanel`
- `AgentFlowViz`
- 老师端生成页 Runtime Monitor

## 7. 持久化与业务存储

当前主要使用 SQLite：

| 存储服务 | 文件 | 说明 |
|---------|------|------|
| GenerateStore | `backend/app/services/generate_store.py` | 生成结果持久化与恢复 |
| ResourcePackageStore | `backend/app/services/resource_package_store.py` | 资源包存储 |
| StudentLearningStore | `backend/app/services/student_learning_store.py` | 学生画像、学习路径、课堂任务与评估 |
| TeacherStore | `backend/app/services/teacher_store.py` | 老师、班级、学生快照、教学包与审核队列 |

## 8. OpenMAIC 互动课堂

学生端互动课堂链路通过 OpenMAIC 实现。

关键文件：

- `backend/app/services/openmaic_client.py`
- `backend/app/services/openmaic_import.py`
- `backend/app/services/openmaic_attempts.py`
- `backend/app/schemas/openmaic.py`

核心流程：

1. 学生端创建互动课堂任务
2. 后端构造 `eduResourceContext`
3. 调用 OpenMAIC 生成课堂
4. 轮询生成状态
5. 导入课堂资源包与练习记录
6. 更新学生学习路径和评估结果

## 9. 数字人助教

前端组件：`frontend/src/components/TutorFloatingBall/`

后端协议：

- `GET /api/digital-human/actions`
- `GET /api/digital-human/knowledge-shortcuts`
- `POST /api/chat`

数字人当前承担：

- 学生端导航
- 快捷知识点选择
- 触发课堂验证
- 触发轻量资源生成
- 打开互动课堂链接
- 通用 AI 助教问答

## 10. 当前主要风险

### 10.1 前端视觉系统不统一

仓库当前同时存在：

- Freddie 黄黑风
- Vercel Mesh 黑底工具风
- Cinematic 电影感风格

后续需要明确最终视觉方向，避免展示时像多个 Demo 拼接。

### 10.2 老师端前端尚未完全接入教师业务接口

后端已经提供教师 dashboard、教学包、审核队列和 PPTX 导出接口，但老师端前端仍有本地 Demo 数据残留。后续应将老师端生成和审核主链路迁移到教师专属接口。

### 10.3 静态实验页容易干扰正式结构

`html/` 目录中的静态实验页不是正式入口，建议移除或归档到设计实验目录，避免误认为当前产品页面。

## 11. 建议下一步

1. 统一首页与老师端视觉方向。
2. 老师端前端接入 `GET /api/teachers/{teacher_id}/dashboard`。
3. 老师端生成改用 `POST /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages`。
4. 清理静态实验页和过时设计草稿。
5. 为演示准备稳定路径：学生端用 OpenMAIC 互动课堂，老师端用 GenerateFlow 固定流水线。