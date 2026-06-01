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
| [docs/08-digital-human-operator-plan.md](docs/08-digital-human-operator-plan.md) | 数字人操作全功能规划 |

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
