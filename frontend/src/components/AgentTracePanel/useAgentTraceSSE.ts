/**
 * useAgentTraceSSE —— 订阅后端 /api/tasks/{taskId}/events 的 React Hook。
 *
 * 用法：
 *   const { trace, connected } = useAgentTraceSSE(taskId);
 *   trace.agents['ProfileAgent'].state // 'running' | 'streaming' | 'done' | ...
 *
 * 关键点：
 * - 不依赖任何状态库，单 useReducer 解析事件
 * - 后端 EventBus 的 ring buffer 保证晚订阅也拿得到 agent.start
 * - 任务结束（agent.done / agent.error / task.summary）后服务端关流，本 Hook 自然清理
 */

import { useEffect, useReducer, useRef } from 'react';
import type {
  AgentEvent,
  AgentRow,
  TaskTrace,
} from '../../types/agentTrace';

interface State {
  trace: TaskTrace;
  connected: boolean;
}

const defaultTraceEndpoint = (id: string) => `/api/tasks/${id}/events`;

type Action =
  | { kind: 'event'; event: AgentEvent }
  | { kind: 'connected'; connected: boolean }
  | { kind: 'reset'; taskId: string };

function emptyRow(name: string): AgentRow {
  return { name, state: 'waiting', elapsedMs: 0, tokenUsed: 0 };
}

function reducer(state: State, action: Action): State {
  if (action.kind === 'reset') {
    return {
      trace: { taskId: action.taskId, agents: {} },
      connected: false,
    };
  }

  if (action.kind === 'connected') {
    return { ...state, connected: action.connected };
  }

  const event = action.event;
  const prev = state.trace.agents[event.agent] ?? emptyRow(event.agent);
  const next: AgentRow = { ...prev };
  const tsMs = event.ts * 1000;

  switch (event.type) {
    case 'agent.start':
      next.state = 'running';
      next.startedAt = tsMs;
      next.promptVersion = event.payload.prompt_version as string | undefined;
      break;
    case 'agent.delta': {
      next.state = 'streaming';
      const stage = event.payload.stage;
      next.latestDelta = typeof stage === 'string' ? stage : '生成中…';
      break;
    }
    case 'agent.done': {
      next.state = 'done';
      next.finishedAt = tsMs;
      const elapsed = event.payload.elapsed_ms;
      const token = event.payload.token_used;
      if (typeof elapsed === 'number') next.elapsedMs = elapsed;
      if (typeof token === 'number') next.tokenUsed = token;
      break;
    }
    case 'agent.error': {
      next.state = 'error';
      next.finishedAt = tsMs;
      const err = event.payload.error;
      if (typeof err === 'string') next.error = err;
      break;
    }
    case 'task.summary':
      return {
        ...state,
        trace: {
          ...state.trace,
          summary: {
            status: String(event.payload.status ?? 'unknown'),
            elapsedMs: Number(event.payload.elapsed_ms ?? 0),
            error: event.payload.error as string | undefined,
          },
        },
      };
    default:
      return state;
  }

  return {
    ...state,
    trace: {
      ...state.trace,
      agents: { ...state.trace.agents, [event.agent]: next },
    },
  };
}

export interface UseAgentTraceSSEOptions {
  /** 默认 '/api/tasks/{taskId}/events'，可注入测试 mock。 */
  endpoint?: (taskId: string) => string;
}

export function useAgentTraceSSE(
  taskId: string | null,
  options: UseAgentTraceSSEOptions = {},
) {
  const endpoint = options.endpoint ?? defaultTraceEndpoint;

  const [state, dispatch] = useReducer(reducer, {
    trace: { taskId: taskId ?? '', agents: {} },
    connected: false,
  });

  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!taskId) return undefined;
    dispatch({ kind: 'reset', taskId });

    const es = new EventSource(endpoint(taskId));
    sourceRef.current = es;

    es.onopen = () => dispatch({ kind: 'connected', connected: true });
    es.onerror = () => dispatch({ kind: 'connected', connected: false });
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const event = JSON.parse(e.data) as AgentEvent;
        dispatch({ kind: 'event', event });
        if (event.type === 'task.summary') es.close();
      } catch (err) {
        // 单条事件 JSON 解析失败不影响后续，记日志即可
        // eslint-disable-next-line no-console
        console.warn('[useAgentTraceSSE] 事件解析失败', err);
      }
    };

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [taskId, endpoint]);

  return state;
}

/** 仅用于演示模式（无后端时）的 mock 事件回放。 */
export function replayMockEvents(
  events: AgentEvent[],
  onEvent: (event: AgentEvent) => void,
  intervalMs = 600,
): () => void {
  let cancelled = false;
  let idx = 0;

  const tick = () => {
    if (cancelled || idx >= events.length) return;
    onEvent(events[idx++]);
    setTimeout(tick, intervalMs);
  };
  setTimeout(tick, intervalMs);

  return () => {
    cancelled = true;
  };
}
