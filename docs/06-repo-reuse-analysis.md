# 06 · career-planning-agent 仓库复用分析

> 仓库：`https://github.com/innovationpuls-creator/career-planning-agent/tree/feature-agentic`
> 分析角度：哪些可以**直接搬**，哪些必须**重写**，哪些是**反面教材**。

---

## 仓库定位（看完 README 与 AGENTS.md 后的结论）

`career-planning-agent` 是一个**职业规划场景的多智能体应用**，feature-agentic 分支引入了真正的 Agent 编排（替代单 Prompt 包装）。技术栈：

- 后端：FastAPI + SQLAlchemy + Pydantic + Dify Workflow
- 前端：UmiJS 4 + React + Ant Design Pro + AntV G6 + TipTap
- LLM：可配置（OpenAI / DeepSeek / 国产模型）
- 任务流：依赖 Dify 提供的 Workflow 编排能力

它和我们的 EduResource-Agent **场景完全不同（职业 vs 教育）**，但**工程骨架几乎重叠 90%**，是非常理想的复用基底。

---

## ✅ 可以直接搬运的部分

### 1. 前端工程脚手架（重点复用）

| 路径 | 用途 | 我们的处理 |
|------|------|-----------|
| `myapp/.umirc.ts` | Umi 配置 | 直接搬 + 改 `proxy` / `routes` |
| `myapp/src/services/` | API 客户端封装 | 直接搬，重命名 endpoint |
| `myapp/src/components/SSE*` | SSE 客户端组件 | **关键复用**，事件协议同款 |
| `myapp/src/hooks/use*` | 通用 hooks | 直接搬 |
| `myapp/package.json` | 依赖 | 直接搬，删除职业规划专属包 |
| TipTap 编辑器封装 | 富文本 | 文档展示直接复用 |
| AntV G6 知识图谱 | 图谱可视化 | 决赛"完整溯源链"直接复用 |

### 2. 后端工程脚手架

| 路径 | 用途 | 我们的处理 |
|------|------|-----------|
| `backend/main.py` | FastAPI 启动 | 直接搬 |
| `backend/app/core/config.py` | 配置加载 | 直接搬 + 加讯飞 key |
| `backend/app/db/` | SQLAlchemy 基础 | 直接搬 |
| `backend/app/api/deps.py` | 依赖注入（鉴权、DB 会话） | 直接搬 |
| 中间件、CORS、错误处理 | | 直接搬 |
| `Dockerfile` / `docker-compose.yml` | 部署 | 直接搬 + 改服务名 |

### 3. 调用日志与 Prompt 版本管理

career-planning-agent 已经在 `agents/` 目录下做了 Prompt 文件化管理，命名风格 `xxx_agent_v1.md`。我们 100% 沿用，仅替换内容。

### 4. SSE NDJSON 三段式协议

career-planning-agent 已经使用 `meta → delta → done | error` 的协议。我们的 7 个 Agent **完全沿用**，连前端解析逻辑都不用改。

---

## ⚠️ 必须重写的部分

### 1. Agent 调度器（最关键的取舍）

career-planning-agent 用 **Dify Workflow** 做编排。这对我们是 **致命短板**：

- Dify 是黑盒，前端拿不到细粒度的「ProfileAgent.start → DocumentAgent.streaming」事件
- 我们的杀手锏一（时序面板）需要直接在调度器侧打日志、推 SSE，**Dify 拦不住这个口子**
- 决赛若被问"为什么不用 LangGraph"，说不出"因为我们要更细的可见性"是个加分项

**结论**：自研 `Orchestrator`（不到 200 行 Python），直接在每个 Agent 的 `run()` 前后发事件。详见 `backend/app/agents/orchestrator.py`。

### 2. Agent 业务逻辑

career-planning-agent 的 7 个 Agent 全是职业规划逻辑（行业分析、职位匹配、简历优化等），我们**全部重写**。但**Agent 基类、状态机、事件接口可以沿用 80%**。

### 3. 数据 Schema

8 维学习画像、知识点解构、Rationale —— 这些 career-planning-agent 没有，我们从零写（已在 `04-ui-sketch.md` 给出 Rationale 草图）。

### 4. 资源生成的具体实现

文档 / 题目 / 代码 / 动画 这 4 类资源的生成逻辑、模板、渲染组件全是新写。但 **Markdown 渲染、Monaco Editor、SVG 动画** 的组件框架可以沿用。

---

## ❌ 反面教材（career-planning-agent 暴露的风险）

通过阅读其 AGENTS.md，识别出 3 个**我们不能犯的错**：

### 反面教材 1：Agent 数量膨胀

career-planning-agent 在 feature-agentic 分支为了"显得 Agent 多"，把一个 LLM 调用拆成 3 个 Agent（"行业研究 Agent" / "公司研究 Agent" / "岗位匹配 Agent"），实际三者职责重叠。这种做法会被评委一眼识破。

**我们的对策**：7 个 Agent 每个职责互不重叠，文档里明写"为什么需要这个 Agent"，删掉即出现的功能缺口必须是真实的。

### 反面教材 2：前端缺乏"协作可见"

career-planning-agent 前端只展示最终结果，看不到 Agent 协作过程。这正是我们要做的差异化（杀手锏一）。

**我们的对策**：右侧 1/3 区域**永久驻留** AgentTracePanel，不是隐藏在某个二级菜单里。

### 反面教材 3："个性化"无溯源

career-planning-agent 输出报告时只写一句"基于您的画像，我们推荐..."，没有任何具体追溯。

**我们的对策**：每张资源卡片下方四段式溯源，UI 强制不可隐藏（折叠态也保留入口）。

---

## 复用策略总结

```
              ┌─── 前端骨架（90% 复用） ───┐
              │   Umi 配置、AntD Pro 路由   │
              │   SSE Hook、G6、Markmap    │
              │   Monaco、TipTap、布局      │
              └─────────────┬───────────────┘
                            │
              ┌─── 后端骨架（80% 复用） ───┐
              │   FastAPI 配置、SQLAlchemy │
              │   依赖注入、Dockerfile      │
              │   Prompt 版本管理目录       │
              └─────────────┬───────────────┘
                            │
              ┌─── 必须重写（40% 工作量） ───┐
              │   ✗ Dify Workflow → 自研调度│
              │   ✗ 业务 Agent 全部新写     │
              │   ✗ 8 维画像 / Rationale    │
              │   ✗ 资源渲染 4 类组件        │
              │   ✗ 闭环路径与评估逻辑       │
              └──────────────────────────────┘
```

**净工作量预估**：相比从零开始，复用让初赛工程量从 6 周降到 **3 周**。差异化设计（杀手锏 1+2）占整个工程的关键 20%，但贡献了几乎全部的创新分。

---

## 操作清单

1. `git clone -b feature-agentic <repo>`
2. `mv career-planning-agent eduresource-agent`
3. 删除：`backend/app/agents/career_*` 全部
4. 删除：`myapp/src/pages/Career*` 全部
5. 替换：`agents/__init__.py` 注册的 Agent 列表 → 我们的 7 个
6. 改写：`backend/app/services/llm_service.py` 默认调用讯飞星火
7. 新增：`backend/app/agents/orchestrator.py`（自研调度核心）
8. 新增：`myapp/src/components/AgentTracePanel/`、`ResourceCard/`
9. 改 `.env.example`：删 OpenAI / DeepSeek，加 SPARK_APP_ID / SPARK_API_KEY / SPARK_API_SECRET
10. 改 `README.md`：替换为我们的项目说明

完成上述 10 步后，工程骨架即可对齐，下一步进入业务实现。
