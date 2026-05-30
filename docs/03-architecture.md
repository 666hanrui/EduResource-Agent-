# 03 · 系统架构与 Agent 协作图

---

## 整体架构（分层）

```
                          ┌─────────────────┐
                          │   学生客户端    │
                          │ React + Umi UI  │
                          └────────┬────────┘
                                   │ REST + SSE(NDJSON)
                          ┌────────▼────────┐
                          │   FastAPI 网关  │
                          │  鉴权·限流·路由 │
                          └────────┬────────┘
                                   │
                  ┌────────────────▼─────────────────┐
                  │       Agent 调度核心             │
                  │  · 任务队列  · Prompt 版本管理   │
                  │  · 调用日志  · SSE 事件总线      │
                  └──┬──────┬──────┬──────┬──────┬──┘
                     │      │      │      │      │
        ┌────────────┘      │      │      │      └──────────────┐
        │       ┌───────────┘      │      └──────────┐          │
        ▼       ▼                  ▼                 ▼          ▼
 ┌──────────┐ ┌──────────┐  ┌────────────┐  ┌──────────┐ ┌──────────────┐
 │ Profile  │ │ Planner  │  │  生成集群  │  │ Visual   │ │ Evaluation   │
 │  Agent   │ │  Agent   │  │            │  │  Agent   │ │   Agent      │
 │          │ │          │  │ ┌────────┐ │  │          │ │              │
 │ 画像构建 │ │ 任务编排 │  │ │Document│ │  │ 思维导图 │ │ 答题分析     │
 │ 维度抽取 │ │ 短板诊断 │  │ │ Agent  │ │  │ + 动画   │ │ 画像更新建议 │
 │ 滑动更新 │ │ 资源规划 │  │ ├────────┤ │  │ 数据生成 │ │              │
 │          │ │          │  │ │Exercise│ │  │          │ │              │
 │          │ │          │  │ │ Agent  │ │  │          │ │              │
 │          │ │          │  │ ├────────┤ │  │          │ │              │
 │          │ │          │  │ │  Code  │ │  │          │ │              │
 │          │ │          │  │ │ Agent  │ │  │          │ │              │
 │          │ │          │  │ └────────┘ │  │          │ │              │
 └─────┬────┘ └────┬─────┘  └──────┬─────┘  └────┬─────┘ └──────┬───────┘
       │           │               │             │              │
       └───────────┴───────┬───────┴─────────────┴──────────────┘
                           │ 共享上下文
                           ▼
              ┌────────────────────────────┐
              │       AI 能力层            │
              │  讯飞星火 X2 / 4.0 Turbo   │
              │  BGE-M3 Embedding          │
              │  SeeDance（预生成）        │
              └────────────┬───────────────┘
                           │
              ┌────────────▼───────────────┐
              │       数据持久层           │
              │  SQLite/PG  Qdrant  Redis  │
              │  Neo4j（知识图谱·决赛增强）│
              └────────────────────────────┘
```

---

## 闭环路径

```
  画像 ──→ Planner ──→ 资源生成 ──→ 学生使用 ──→ 答题
   ▲                                              │
   │                                              ▼
   └────── 画像更新 ◀── Evaluation ◀──── 答题记录
```

整个系统只关心一件事：**让这个闭环持续转动并对外可见**。

---

## Agent DAG 示例（一次完整生成任务）

以"为学生 A 生成链表知识点的全套资源"为例：

```
[T0]  ProfileAgent   (1.8s)  ─── done
[T1]  PlannerAgent   (2.1s)  ─── done   (依赖 T0)
[T2]  DocumentAgent  (12.3s) ─── done   (依赖 T1)
[T3]  ExerciseAgent  (8.4s)  ─── done   (依赖 T1，与 T2 并行)
[T4]  VisualAgent    (4.2s)  ─── done   (依赖 T1，与 T2/T3 并行)
[T5]  CodeAgent      (9.1s)  ─── done   (依赖 T2)
                                          ↓
                                       前端聚合
                                          ↓
                                       学生作答
                                          ↓
[T6]  EvaluationAgent(1.5s)  ─── done   (依赖答题结果)
                                          ↓
                                       画像更新
```

时间轴上：T0 → T1 → (T2 ‖ T3 ‖ T4) → T5 → 学生交互 → T6。
这正是前端时序面板要呈现的横向甘特图。

---

## 事件协议（沿用 career-planning-agent 仓库的 SSE NDJSON 三段式）

```
meta   →   delta   →   done | error
```

每条事件结构：

```json
{
  "type": "agent.start | agent.delta | agent.done | agent.error | task.summary",
  "task_id": "task_abc123",
  "agent": "ProfileAgent",
  "ts": 1727000000.123,
  "payload": { "..." }
}
```

前端按 `task_id` 维护一个 `Map<agent, AgentState>`，每条事件 reducer 更新即可。

---

## 数据流关键约定

| 共享对象 | 谁产出 | 谁消费 | 用途 |
|----------|--------|--------|------|
| `Profile` | ProfileAgent | 所有下游 Agent | 个性化的唯一来源 |
| `KnowledgeBreakdown` | PlannerAgent | Document/Exercise/Code/Visual | 跨模态一致性的锚点 |
| `Rationale` | 各生成 Agent | 前端溯源卡片 | 可解释性的唯一来源 |
| `EvaluationDelta` | EvaluationAgent | ProfileAgent | 闭环的唯一信号 |

不允许 Agent 之间私下传参。所有跨 Agent 通信走调度核心。
