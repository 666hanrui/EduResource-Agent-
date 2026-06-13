# EduResource-Agent

> 第十五届“中国软件杯”A3 赛题 · 基于学习画像的多智能体个性化资源生成系统

面向高校计算机类课程，通过学习画像、专业探索、教师教学包生成、互动课堂验证与证据回写，构建一个 AI Native 的个性化学习资源生产系统。

## 它不是什么

不是教育聊天机器人，不是普通题库系统，也不是只给学生一个答案的问答工具。

系统的核心输出不是“答案”，而是 **在学生当前画像、学习阶段、教师目标和课堂反馈约束下，为此刻定制生产的学习资源与教学包**。

## 当前产品形态

系统已经形成学生端与老师端两条主链路：

### 学生端：个性化学习闭环

1. **画像与广度探索**：从专业、兴趣、年级和学习偏好出发，生成探索计划和 12 维能力画像。
2. **培养方案**：将方向拆成阶段化学习路径，明确基础、练习、进阶任务。
3. **课堂验证**：调用互动课堂生成链路，生成课堂资源、练习与验证任务。
4. **证据回写**：把课堂结果、测验反馈和路径状态回写到学生画像，修正下一阶段。

### 老师端：教学资源工作台

1. **班级洞察**：查看班级进度、风险学生、短板证据和掌握度趋势。
2. **教学包生成**：教师选择班级、学生、知识点和教学目标，触发多 Agent 生成教学包。
3. **资源审核**：对讲义、练习、代码、可视化资源进行溯源审核，查看画像匹配、短板对应、难度自适应和生产指纹。
4. **干预闭环**：将教师动作与学生后续画像更新连接起来，形成可解释的教学干预闭环。

## 双套多 Agent 系统

项目当前包含两套面向不同业务面的 Agent 系统：

### 学生端：专业探索 7-Agent

- MajorScopeAgent：专业范围与方向边界
- KnowledgeMapAgent：知识地图与能力结构
- Profile12Agent：12 维能力画像
- DirectionMatchAgent：方向匹配
- GapDiagnosisAgent：短板诊断
- SnailPathAgent：阶段化学习路径
- CoachReportAgent：成长报告与教练建议

### 老师端：资源生成 7-Agent

- ProfileAgent：读取学习画像与证据
- PlannerAgent：拆解生成任务并决定调用哪些资源 Agent
- DocumentAgent：生成讲解文档
- ExerciseAgent：生成自适应练习
- VisualAgent：生成图解与动画数据
- CodeAgent：生成 Python / Java 双语代码案例
- EvaluationAgent：汇总结果并输出画像更新建议

## 关键后端能力

| 能力 | 说明 |
|------|------|
| 固定流水线生成 | `POST /api/generate`，稳定演示用，由 GenerateFlow 编排 |
| Tool Calling 动态调度 | `POST /api/generate/tool-calling`，MainAgent Supervisor 动态决定工具调用；仅作为增强展示，不替代主演示链路 |
| SSE 事件流 | `GET /api/tasks/{task_id}/events`，前端实时展示 Agent 状态 |
| 生成结果持久化 | `GET /api/tasks/{task_id}/results`，SQLite 缓存与恢复 |
| 学生互动课堂 | `POST /api/students/{student_id}/interactive-classrooms`，对接 OpenMAIC 互动课堂生成，支持 `EDU_OPENMAIC_FALLBACK=1` 本地降级演示 |
| 学生仪表盘 | `GET /api/students/{student_id}/dashboard`，学习路径、评估和画像状态 |
| 教师仪表盘 | `GET /api/teachers/{teacher_id}/dashboard`，班级、风险队列、审核项和教学包 |
| 教师教学包 | `POST /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages`，教师业务边界下触发资源生成，是老师端正式演示主链路 |
| PPT 导出 | `GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{package_id}/pptx`；环境不完整时可走 `.md` 教案降级导出 |
| PPT 环境诊断 | `GET /api/teachers/export/pptx/status`，检查 PPT Master、python-pptx 与导出目录 |
| Markdown 教案导出 | `GET /api/teachers/{teacher_id}/classes/{class_id}/teaching-packages/{package_id}/lesson-plan.md`，不依赖 PPT Master |
| 数字人动作协议 | `GET /api/digital-human/actions` 与 `GET /api/digital-human/knowledge-shortcuts` |

## 代码导航

| 路径 | 说明 |
|------|------|
| `backend/app/api/routes.py` | HTTP API 路由，包含学生端、老师端、生成、SSE、OpenMAIC 接口 |
| `backend/app/agents/generate_flow.py` | 固定流水线 GenerateFlow，Planner 决定资源 Agent 调用 |
| `backend/app/agents/langgraph_tool_calling_flow.py` | ToolCallingFlow / MainAgent 动态调度链路 |
| `backend/app/agents/orchestrator.py` | 统一 Agent 调度入口 |
| `backend/app/agents/event_bus.py` | SSE NDJSON 事件总线 |
| `backend/app/services/student_learning_store.py` | 学生画像、学习路径、课堂验证和证据回写存储 |
| `backend/app/services/teacher_store.py` | 老师端班级、学生快照、教学包、审核队列 SQLite 存储 |
| `backend/app/services/openmaic_client.py` | OpenMAIC 互动课堂生成客户端与本地 fallback 构造器 |
| `backend/app/services/ppt_master_service.py` | 老师端教学包 PPTX 导出、环境诊断与 Markdown 教案降级导出 |
| `backend/app/schemas/student.py` | 学生端资源包、课堂任务、仪表盘 Schema |
| `backend/app/schemas/teacher.py` | 老师端上下文、班级、教学包、审核项 Schema |
| `frontend/src/main.tsx` | 角色入口与路由分发：学生端、老师端、首页、注册入口 |
| `frontend/src/App.tsx` | 学生端四阶段学习系统 |
| `frontend/src/components/TeacherPortal/` | 老师端工作台 |
| `frontend/src/components/AgentSystemsShowcase/` | 双套 Agent 系统展示 |
| `frontend/src/components/AgentFlowViz/` | Agent DAG 与 SSE 可视化组件 |
| `frontend/src/components/TutorFloatingBall/` | Live2D 数字人助教与前端操作入口 |
| `docs/14-toolcalling-demo-boundary.md` | ToolCallingFlow 演示边界说明 |

## 技术栈

- 后端：FastAPI + Python 3.13 + Pydantic v2 + SQLite
- 前端：React 19 + Vite/Umi 工程结构
- 大模型：讯飞星火 X2 / 4.0 Turbo（主）
- 课堂生成：OpenMAIC 互动课堂接口
- 事件流：SSE NDJSON
- 导出：PPTX 教学包生成 + Markdown 教案降级导出
- 本地资源：Live2D Cubism 运行时与 Haru 模型

## 当前进度

- [x] 学生端四阶段学习系统：画像与广度、培养方案、课堂验证、证据回写
- [x] 老师端教学资源工作台：班级洞察、生成、审核、干预
- [x] ProfileAgent / PlannerAgent / DocumentAgent / ExerciseAgent / CodeAgent / VisualAgent / EvaluationAgent
- [x] GenerateFlow 固定流水线
- [x] ToolCallingFlow 动态调度入口与演示边界文档
- [x] SSE Agent 运行事件流与可视化
- [x] 学生端 OpenMAIC 互动课堂生成链路与本地 fallback
- [x] 老师端 SQLite 业务边界与教学包生成链路
- [x] PPTX 环境诊断与 Markdown 教案降级导出
- [x] 资源溯源 RationalePanel
- [x] 数字人操作协议与 Live2D 助教
- [ ] 老师端前端完全接入教师业务接口后的细节联调
- [ ] 演示视频、答辩 PPT 与最终部署脚本

## AI 智能助教 Live2D 数字人集成与自定义指南

系统在前端右下角集成了基于 WebGL 的 Live2D 交互式数字人助教“小灵（Haru）”，具备以下特征：

- **鼠标跟随与自动眨眼**：角色眼睛、头部和视线会自动跟踪用户鼠标移动，并在随机间隔内自动眨眼。
- **发言口型同步 (LipSync)**：当助教在思考或输出生成回答时，模型嘴巴会自动按照语音振幅频率进行张合，生成结束后自动闭嘴。
- **拖拽与边界夹持**：用户可将数字人拖拽至屏幕任意位置，且具备窗口边界碰撞检测，不会拖出屏幕外。

### 1. 本地化资源结构

为了确保国内网络环境下 100% 稳定加载且不依赖外部 CDN，数字人核心库与资源已全部本地化：

- **SDK 核心引擎**：`frontend/public/live2dcubismcore.min.js`
- **默认模型目录**：`frontend/public/live2d/haru/`

### 2. 替换为自定义 Live2D 形象

1. 使用 Photoshop / CSP 将立绘角色按图层精细分层并导出 `.psd` 文件。
2. 导入 Live2D Cubism Editor 中进行网格变形、参数绑定和物理碰撞设置。
3. 导出运行时文件，确保包含 `*.model3.json`、`*.moc3` 和贴图文件夹。
4. 将模型放入 `frontend/public/live2d/my_avatar/`。
5. 在 `frontend/src/components/TutorLivePanel/TutorLive2D.tsx` 中修改模型路径：

```ts
const modelUrl = "/live2d/my_avatar/my_avatar.model3.json";
```

6. 在 `frontend/src/components/TutorFloatingBall/index.tsx` 中根据模型比例调整大小与偏移。
