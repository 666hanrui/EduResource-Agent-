/**
 * Agent 时序面板的类型定义。
 * 与后端 backend/app/agents/event_bus.py 的 AgentEvent 结构对齐。
 */

export type EventType =
  | 'agent.start'
  | 'agent.delta'
  | 'agent.done'
  | 'agent.error'
  | 'task.summary';

export type AgentState =
  | 'waiting'
  | 'running'
  | 'streaming'
  | 'done'
  | 'error';

/** 后端推送的 SSE 事件结构（与 NDJSON 一行对应）。 */
export interface AgentEvent {
  type: EventType;
  task_id: string;
  agent: string;
  ts: number;
  payload: Record<string, unknown>;
}

/** 单个 Agent 在前端 reducer 中累积的状态。 */
export interface AgentRow {
  name: string;
  state: AgentState;
  startedAt?: number;
  finishedAt?: number;
  elapsedMs: number;
  tokenUsed: number;
  promptVersion?: string;
  modelName?: string;
  /** 最近一条 delta 的摘要（前端展示"正在做什么"）。 */
  latestDelta?: string;
  error?: string;
}

/** 整个任务在前端的状态。 */
export interface TaskTrace {
  taskId: string;
  agents: Record<string, AgentRow>;
  summary?: { status: string; elapsedMs: number; error?: string };
}
