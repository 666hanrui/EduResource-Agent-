# 06 · career-planning-agent 仓库复用分析

> 仓库：`https://github.com/innovationpuls-creator/career-planning-agent/tree/feature-agentic`
> 分析角度：哪些可以**完整保留**，哪些需要**场景迁移**，哪些必须**重写**。

---

## 仓库定位（更新口径）

`career-planning-agent` 不是一个简单的职业规划 Demo，而是一个已经接近产品形态的**多智能体应用底座**。feature-agentic 分支同时具备：

- 后端：FastAPI + SQLAlchemy + Pydantic + Dify / OpenAI 兼容工作流
- 前端：UmiJS 4 + React + Ant Design Pro + AntV G6 + TipTap
- 数据：SQLite + Qdrant + Neo4j
- AI 交互：AI Coach、流式对话、运行轨迹、工具调用、记忆、会话恢复
- 产品能力：登录注册、管理端、首页、画像、匹配、学习路径、报告导出

它和我们的 EduResource-Agent **场景不同（职业规划 vs 教育资源生成）**，但工程骨架、UI 体系和 Agentic 交互高度重合。更准确的策略不是“参考”，而是：

> 以 career-planning-agent 作为完整产品底座，保留 UI、AI Coach、管理端、用户体系、知识图谱、向量检索和部署结构，再把 EduResource-Agent 的教育 Agent 链路嵌入为新业务模块。

---

## ✅ 应完整保留的部分

### 1. 前端 UI 与工程骨架（重点）

| 路径 / 能力 | 用途 | 我们的处理 |
|------|------|-----------|
| `myapp/` | Umi + Ant Design Pro 主前端 | 完整保留，后续将当前 Vite 演示页迁入为新页面 |
| `docs/Design.md` | 全站设计语言 | 完整保留，避免重新发明 UI 风格 |
| `myapp/src/styles/claude-tokens.ts` | 类 Claude 的色彩、玻璃、阴影、字体 token | 完整保留 |
| 登录 / 注册 / 首页 / 管理端 | 产品壳与用户入口 | 完整保留，只改业务文案 |
| TipTap 编辑器封装 | 报告与学习材料编辑 | 迁移为学习报告 / 学习资源编辑器 |
| AntV G6 知识图谱 | 图谱可视化 | 迁移为知识点关系 / 推荐溯源图谱 |

### 2. AI Coach / 类 Claude Code 工作台

这是原项目最应该保留的亮点之一。它已经不是普通聊天框，而是具备：

- 流式对话；
- 会话侧栏与历史恢复；
- 斜杠能力列表；
- 附件上传；
- 停止生成、错误提示、重试；
- 路由、上下文、工具、记忆、Agent 切换、回答生成等运行轨迹展示。

我们的处理：

> 保留 AI Coach 作为 EduResource 的“智能体操作台”，让用户能通过自然语言操作资源生成、解释推荐依据、查看任务轨迹、调整学习路径。

当前仓库已先行接入轻量版接口：`POST /api/coach/workbench/stream`，用于过渡到完整 UI。

### 3. 后端工程骨架

| 路径 / 能力 | 用途 | 我们的处理 |
|------|------|-----------|
| FastAPI 应用入口 | API 服务 | 保留 |
| `core/config.py` | 配置加载 | 加入讯飞星火 / 教育资源配置 |
| `db/` + SQLAlchemy | 关系数据 | 保留，扩展学习画像、资源、答题记录 |
| 鉴权与用户体系 | 登录、权限 | 保留 |
| Docker / Nginx / Compose | 部署 | 保留，改服务名和环境变量 |

### 4. 事件流协议

原项目已有流式 AI 输出和运行轨迹事件。EduResource-Agent 当前的 `EventBus` / `AgentTracePanel` 继续沿用类似协议，但扩展为教育资源生成 DAG：

```text
ProfileAgent → PlannerAgent → Document / Exercise / Visual → Code → Evaluation
```

---

## ⚠️ 必须重写 / 深度改造的部分

### 1. 业务 Agent 逻辑

career-planning-agent 的 Agent 主要服务职业规划，包括简历解析、岗位匹配、行业对比、报告生成等。EduResource-Agent 的核心任务是学习画像、知识点拆解、资源生成、答题评估，所以业务 Agent 必须重写。

保留：Agent 事件接口、Prompt 版本化、工具注册思路。  
重写：ProfileAgent / PlannerAgent / DocumentAgent / ExerciseAgent / CodeAgent / VisualAgent / EvaluationAgent 的教育逻辑。

### 2. 数据 Schema

职业画像的 12 维能力结构可以作为“专业探索 / 就业方向”模块参考，但主链路必须使用 EduResource 的 8 维学习画像：

- 专业背景
- 知识掌握度
- 学习目标
- 学习风格
- 易错点
- 资源偏好
- 学习节奏
- 当前进度

### 3. 资源生成与评价闭环

职业规划报告不能直接迁移为教育资源输出。需要新写：

- 讲解文档生成；
- 自适应题目生成；
- Python / Java 代码案例；
- 思维导图与动画数据；
- 答题评估；
- 画像滑动更新；
- 推荐溯源卡片。

### 4. 前端迁移方式

当前 EduResource-Agent 仓库已经有 Vite 演示前端和 AgentTracePanel，但它不是最终产品底座。正确迁移方式是：

> 不在 Vite 演示壳上继续无限堆功能，而是把当前已有教育模块迁移到 career-planning-agent 的 `myapp/` 中，作为 `/edu-resource`、`/major-exploration`、`/agent-workbench` 等新页面。

---

## ❌ 需要避免的风险

### 风险 1：把“完整复用”写成“参考项目”

错误说法：参考 career-planning-agent 做一个职业规划相关模块。  
正确说法：完整复用 career-planning-agent 的产品底座，并完成教育资源生成场景迁移。

### 风险 2：把 AI Coach 和 AgentTracePanel 混为一谈

两者应该分工明确：

| 模块 | 作用 |
|---|---|
| AI Coach / 工作台 | 类 Claude Code 的对话式操作入口，解释、调度、修改任务 |
| AgentTracePanel | 展示一次资源生成 DAG 中 7 个 Agent 的实时执行状态 |

### 风险 3：继续说原项目前端没有协作可见

这个判断已经过时。feature-agentic 分支已经有 AI Coach 运行轨迹。我们的差异化不是“从无到有”，而是：

> 原项目展示的是职业规划对话智能体的运行轨迹；EduResource-Agent 进一步把轨迹扩展为教育资源生成 DAG，让资源生产过程也变得可见。

### 风险 4：一次性大迁移导致不可运行

完整迁入 Umi / Ant Design Pro 会影响构建、路由、样式和依赖。当前策略应分两步：

1. 在当前仓库先接通轻量 AI 工作台接口，保证演示可见；
2. 再把教育模块迁入 career-planning-agent 完整产品壳。

---

## 复用策略总结

```text
              ┌─── 完整保留 ───┐
              │   Umi + AntD UI │
              │   AI Coach      │
              │   管理端/登录   │
              │   图谱/向量/部署│
              └────────┬───────┘
                       │
              ┌────────▼────────┐
              │  教育场景迁移    │
              │  学习画像        │
              │  资源生成 DAG    │
              │  推荐溯源        │
              └────────┬────────┘
                       │
              ┌────────▼────────┐
              │  必须重写        │
              │  7 个教育 Agent  │
              │  8 维画像 Schema │
              │  资源/题目/动画  │
              │  评估闭环        │
              └─────────────────┘
```

---

## 操作清单（更新版）

### 阶段一：当前仓库先接通可展示能力

1. 保留当前 `backend/app/agents/*` 的 7-Agent 教育链路。
2. 保留 `AgentTracePanel`，作为资源生成 DAG 的可视化证据。
3. 新增 `POST /api/coach/workbench/stream`，先接入轻量版 AI 工作台。
4. 前端增加 AI 工作台悬浮入口，避免破坏现有演示页。
5. 文档同步修正复用口径。

### 阶段二：迁入 career-planning-agent 完整产品壳

1. 以 `career-planning-agent/myapp` 为前端主壳。
2. 新增 `/edu-resource`、`/major-exploration`、`/agent-workbench` 页面。
3. 将当前 `frontend/src/components/AgentTracePanel` 迁入 `myapp/src/components/AgentTracePanel`。
4. 将当前 `MajorExplorationPanel`、`ResultsPanel` 拆入对应页面组件。
5. 保留原项目 `/coach` 页面，并接入 EduResource 工具。
6. 将教育 Agent 后端拆分为 `edu_generate.py`、`edu_tasks.py`、`major_exploration.py`、`coach_workbench.py` 等 router。

完成后，项目不再是“职业规划项目改名”，而是“成熟智能体平台底座 + 教育资源生成业务内核”。
