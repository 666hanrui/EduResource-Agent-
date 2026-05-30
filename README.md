# EduResource-Agent

> 第十五届"中国软件杯"A3 赛题 · 基于学习画像的多智能体个性化资源生成系统

面向高校计算机类课程，通过对话构建学习画像，由多个专业 Agent 协同生成个性化学习资源、规划学习路径并闭环优化的 AI Native 教育系统。

## 它不是什么

不是教育聊天机器人，不是题库系统，不是职业规划工具。

## 它解决的核心问题

学生面对海量教学资源时，无法找到匹配自己知识基础、学习风格和短板的内容。系统的输出不是"答案"，而是 **为这个学生此刻定制生产的学习材料**。

## 文档导航

| 文件 | 内容 |
|------|------|
| [docs/01-solution-overview.md](docs/01-solution-overview.md) | 精简版总体方案 |
| [docs/02-innovation.md](docs/02-innovation.md) | 第十四章 · 项目创新点（扩写版） |
| [docs/03-architecture.md](docs/03-architecture.md) | 系统架构与 Agent 协作图 |
| [docs/04-ui-sketch.md](docs/04-ui-sketch.md) | 杀手锏一/二的 UI 草图 |
| [docs/05-agent-prompts.md](docs/05-agent-prompts.md) | 7 个 Agent 的 Prompt 模板 |
| [docs/06-repo-reuse-analysis.md](docs/06-repo-reuse-analysis.md) | career-planning-agent 复用分析 |

## 代码

| 路径 | 说明 |
|------|------|
| `backend/app/agents/orchestrator.py` | Agent 调度核心 |
| `backend/app/agents/profile_agent.py` | 学习画像 Agent（完整实现） |
| `backend/app/agents/base.py` | Agent 基类、事件、状态机 |
| `backend/app/agents/registry.py` | Agent 注册表 |
| `backend/app/agents/event_bus.py` | SSE NDJSON 事件总线 |
| `backend/app/schemas/profile.py` | 8 维学习画像 Pydantic Schema |
| `backend/app/services/llm_service.py` | LLM 调用与 JSON 修复 |
| `backend/app/agents/prompts/profile_agent_v1.md` | ProfileAgent Prompt v1 |

## 技术栈

- 后端：FastAPI + Python 3.13 + Pydantic v2 + SQLAlchemy
- 前端：UmiJS 4 + React 19 + AntV G6 + TipTap（复用 career-planning-agent feature-agentic 工程骨架）
- 大模型：讯飞星火 X2 / 4.0 Turbo（主） + SeeDance（多模态预生成）
- 数据：SQLite（初赛）/ PostgreSQL（决赛）+ Qdrant + Redis + Neo4j（增强）

## 当前进度

- [x] 总体方案、创新点、架构图、UI 草图、Prompt 模板
- [x] Orchestrator 调度核心骨架
- [x] ProfileAgent 完整实现
- [ ] PlannerAgent / DocumentAgent / ExerciseAgent / CodeAgent / VisualAgent / EvaluationAgent
- [ ] 前端 Agent 时序面板组件
- [ ] 前端资源溯源卡片组件
- [ ] 数据结构课程预置数据
- [ ] 演示视频与 PPT

## AI 智能助教 Live2D 数字人集成与自定义指南

系统在前端右下角集成了基于 WebGL 的 Live2D 交互式数字人助教“小灵（Haru）”，具备以下特征：
- **鼠标跟随与自动眨眼**：角色眼睛、头部和视线会自动跟踪用户鼠标移动，并在随机间隔内自动眨眼。
- **发言口型同步 (LipSync)**：当助教在思考或输出生成回答时，模型嘴巴会自动按照语音振幅频率进行张合，生成结束后自动闭嘴。
- **拖拽与边界夹持**：用户可将数字人拖拽至屏幕任意位置，且具备窗口边界碰撞检测，不会拖出屏幕外。

### 1. 本地化资源结构
为了确保国内网络环境下 100% 稳定加载且不依赖外部 CDN，数字人核心库与资源已全部本地化：
- **SDK 核心引擎**：位于 `frontend/public/live2dcubismcore.min.js`（官方 Cubism 4 SDK 运行时）。
- **默认模型目录**：位于 `frontend/public/live2d/haru/`（官方测试模型 Haru 骨骼及贴图）。

### 2. 替换为自己建模的专属形象
如果你想使用自己画图并建模的 Live2D 形象，只需按以下步骤操作：

1. **制作模型**：
   - 使用 Photoshop / CSP 将立绘角色按图层精细分层并导出 `.psd` 文件。
   - 导入 **Live2D Cubism Editor** 中进行网格变形、参数绑定和物理碰撞设置。
   - 导出为运行时文件（Moc3 格式），确保生成 `*.model3.json`、`*.moc3` 以及包含贴图 png 文件的文件夹。
2. **替换资源**：
   - 将导出的整套模型文件夹放入到前端公共目录中，例如：`frontend/public/live2d/my_avatar/`。
3. **更改加载路径**：
   - 打开 [frontend/src/components/TutorLivePanel/TutorLive2D.tsx](frontend/src/components/TutorLivePanel/TutorLive2D.tsx)，将加载路径指向你的新 JSON 文件：
     ```typescript
     const modelUrl = "/live2d/my_avatar/my_avatar.model3.json";
     ```
4. **微调大小与位置**：
   - 打开 [frontend/src/components/TutorFloatingBall/index.tsx](frontend/src/components/TutorFloatingBall/index.tsx)，根据自制模型的比例，微调 `<TutorLive2D>` 的缩放及偏移量：
     ```tsx
     <TutorLive2D 
       isSpeaking={loading} 
       width={240} 
       height={320} 
       scale={0.065}    // 调整此数值以缩放模型大小
       xOffset={25}     // 水平偏移微调
       yOffset={25}     // 垂直偏移微调
     />
     ```
