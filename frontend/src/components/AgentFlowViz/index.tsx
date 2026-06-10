/**
 * AgentFlowViz — 多 Agent 协作流程可视化组件
 *
 * 设计：完全对齐 Freddie 设计体系
 *   - 黄色 #FFE01B + 墨色 #241C15 + 奶油 #FBEFE3
 *   - 粗黑边框 3px solid ink + 硬阴影 8px 8px 0 ink
 *   - 圆润但有力的卡片风格
 *
 * 功能：
 *   - SVG 节点流程图：7 个 Agent 的 DAG（Profile→Planner→并行三件套→Code→Eval）
 *   - 节点状态动画：waiting / running / done / error
 *   - 实时日志控制台：复用 useAgentTraceSSE
 *   - 无 taskId 时播放内置演示动画
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRow } from '../../types/agentTrace';
import { useAgentTraceSSE, replayMockEvents } from '../AgentTracePanel/useAgentTraceSSE';
import type { AgentEvent } from '../../types/agentTrace';

/* ─── Design tokens ─── */
const C = {
  yellow:  '#FFE01B',
  ink:     '#241C15',
  cream:   '#FBEFE3',
  paper:   '#FFFDF6',
  muted:   '#88837C',
  coral:   '#FF4D74',
  green:   '#2b7a4b',
  greenBg: '#d4f7e5',
  redBg:   '#ffd8df',
};

/* ─── Agent metadata ─── */
interface AgentMeta {
  name: string;
  label: string;
  icon: string;
  caption: string;
  // SVG layout
  x: number; y: number; w: number; h: number;
  // which edges flow FROM this node (list of target agent names)
  edgesTo: string[];
}

const AGENTS: AgentMeta[] = [
  { name: 'ProfileAgent',    label: '学生画像', icon: '👤', caption: '分析学情',   x: 10,  y: 96,  w: 118, h: 52, edgesTo: ['PlannerAgent'] },
  { name: 'PlannerAgent',    label: '任务规划', icon: '🗺', caption: '编排任务',   x: 168, y: 96,  w: 118, h: 52, edgesTo: ['DocumentAgent', 'ExerciseAgent', 'VisualAgent'] },
  { name: 'DocumentAgent',   label: '讲解文档', icon: '📄', caption: '生成文档',   x: 346, y: 20,  w: 118, h: 52, edgesTo: ['CodeAgent'] },
  { name: 'ExerciseAgent',   label: '题目生成', icon: '✏️', caption: '出题练习',   x: 346, y: 96,  w: 118, h: 52, edgesTo: ['CodeAgent'] },
  { name: 'VisualAgent',     label: '可视化',   icon: '🎨', caption: '图解动画',   x: 346, y: 172, w: 118, h: 52, edgesTo: ['CodeAgent'] },
  { name: 'CodeAgent',       label: '代码案例', icon: '💻', caption: '双语代码',   x: 524, y: 96,  w: 118, h: 52, edgesTo: ['EvaluationAgent'] },
  { name: 'EvaluationAgent', label: '学习评估', icon: '📊', caption: '闭环反馈',   x: 702, y: 96,  w: 118, h: 52, edgesTo: [] },
];

const AGENT_MAP = Object.fromEntries(AGENTS.map(a => [a.name, a]));

/* ─── Edge list ─── */
interface Edge { from: string; to: string; }
const EDGES: Edge[] = AGENTS.flatMap(a => a.edgesTo.map(to => ({ from: a.name, to })));

/* ─── State colors ─── */
const STATE_COLORS: Record<string, { fill: string; stroke: string; dot: string }> = {
  waiting:   { fill: C.paper,    stroke: C.ink,   dot: '#c8c0b8' },
  running:   { fill: '#fffbe0',  stroke: C.yellow, dot: C.yellow },
  streaming: { fill: '#fffbe0',  stroke: C.yellow, dot: C.yellow },
  done:      { fill: C.greenBg,  stroke: C.green,  dot: C.green  },
  error:     { fill: C.redBg,    stroke: C.coral,  dot: C.coral  },
};

/* ─── Log entry ─── */
interface LogEntry { id: number; agent: string; text: string; type: string; }

/* ─── Mock demo events ─── */
const DEMO_EVENTS: AgentEvent[] = [
  { type: 'agent.start', task_id: 'demo', agent: 'ProfileAgent',    ts: 0,   payload: {} },
  { type: 'agent.delta', task_id: 'demo', agent: 'ProfileAgent',    ts: 0.6, payload: { stage: 'profile_finalized' } },
  { type: 'agent.done',  task_id: 'demo', agent: 'ProfileAgent',    ts: 1.2, payload: { elapsed_ms: 1200, token_used: 210 } },
  { type: 'agent.start', task_id: 'demo', agent: 'PlannerAgent',    ts: 1.3, payload: {} },
  { type: 'agent.delta', task_id: 'demo', agent: 'PlannerAgent',    ts: 2.0, payload: { stage: 'plan_finalized' } },
  { type: 'agent.done',  task_id: 'demo', agent: 'PlannerAgent',    ts: 3.1, payload: { elapsed_ms: 1800, token_used: 480 } },
  { type: 'agent.start', task_id: 'demo', agent: 'DocumentAgent',   ts: 3.2, payload: {} },
  { type: 'agent.start', task_id: 'demo', agent: 'ExerciseAgent',   ts: 3.2, payload: {} },
  { type: 'agent.start', task_id: 'demo', agent: 'VisualAgent',     ts: 3.2, payload: {} },
  { type: 'agent.delta', task_id: 'demo', agent: 'DocumentAgent',   ts: 4.2, payload: { stage: 'document_finalized' } },
  { type: 'agent.delta', task_id: 'demo', agent: 'ExerciseAgent',   ts: 4.6, payload: { stage: 'exercise_finalized' } },
  { type: 'agent.delta', task_id: 'demo', agent: 'VisualAgent',     ts: 5.0, payload: { stage: 'visual_finalized' } },
  { type: 'agent.done',  task_id: 'demo', agent: 'DocumentAgent',   ts: 5.8, payload: { elapsed_ms: 2600, token_used: 890 } },
  { type: 'agent.done',  task_id: 'demo', agent: 'ExerciseAgent',   ts: 6.2, payload: { elapsed_ms: 3000, token_used: 720 } },
  { type: 'agent.done',  task_id: 'demo', agent: 'VisualAgent',     ts: 6.6, payload: { elapsed_ms: 3400, token_used: 340 } },
  { type: 'agent.start', task_id: 'demo', agent: 'CodeAgent',       ts: 6.7, payload: {} },
  { type: 'agent.delta', task_id: 'demo', agent: 'CodeAgent',       ts: 7.8, payload: { stage: 'code_finalized' } },
  { type: 'agent.done',  task_id: 'demo', agent: 'CodeAgent',       ts: 8.9, payload: { elapsed_ms: 2200, token_used: 960 } },
  { type: 'agent.start', task_id: 'demo', agent: 'EvaluationAgent', ts: 9.0, payload: {} },
  { type: 'agent.delta', task_id: 'demo', agent: 'EvaluationAgent', ts: 9.5, payload: { stage: 'evaluation_finalized' } },
  { type: 'agent.done',  task_id: 'demo', agent: 'EvaluationAgent', ts: 10.1,payload: { elapsed_ms: 1100, token_used: 310 } },
  { type: 'task.summary',task_id: 'demo', agent: 'GenerateFlow',    ts: 10.2,payload: { status: 'ok', elapsed_ms: 10200 } },
];

const AGENT_LOG_COPY: Record<string, {
  tag: string;
  start: string;
  delta: string;
  done: string;
}> = {
  ProfileAgent: {
    tag: '画像',
    start: '读取学生画像与历史错因，确认当前学习偏好。',
    delta: '画像结构已收敛，主要薄弱点与偏好证据已锁定。',
    done: '学习画像整理完成。',
  },
  PlannerAgent: {
    tag: '规划',
    start: '拆解知识点目标，编排讲解、练习、图解与代码任务。',
    delta: '任务图已确认，准备进入并行生成阶段。',
    done: '学习任务图生成完成。',
  },
  DocumentAgent: {
    tag: '讲解',
    start: '展开讲解主线，组织更低负担的理解顺序。',
    delta: '讲解骨架已完成，正在等待整体收敛。',
    done: '讲解资源生成完成。',
  },
  ExerciseAgent: {
    tag: '练习',
    start: '按当前难度生成练习题，并准备即时反馈锚点。',
    delta: '练习集已完成，难度与反馈点已经绑定。',
    done: '练习资源生成完成。',
  },
  VisualAgent: {
    tag: '图解',
    start: '整理关键步骤图，准备动画与可视化资源。',
    delta: '图解资源已经就位，正在等待与讲解内容对齐。',
    done: '图解资源生成完成。',
  },
  CodeAgent: {
    tag: '代码',
    start: '收敛上游结果，输出 Python / Java 双语案例。',
    delta: '代码案例已完成，准备进入评估收尾。',
    done: '代码案例生成完成。',
  },
  EvaluationAgent: {
    tag: '评估',
    start: '汇总过程证据，准备回写学习画像与建议。',
    delta: '评估反馈已完成，闭环更新准备写回。',
    done: '评估建议生成完成。',
  },
  System: {
    tag: '系统',
    start: '开始调度本轮多 Agent 生成任务。',
    delta: '所有阶段都在稳定执行。',
    done: '整条链路执行完成，结果已经同步到面板。',
  },
};

/* ════════════════════════════════════════════
   Main Component
════════════════════════════════════════════ */
interface Props {
  taskId: string | null;
}

export function AgentFlowViz({ taskId }: Props) {
  const { trace } = useAgentTraceSSE(taskId);
  const [demoAgents, setDemoAgents] = useState<Record<string, AgentRow>>({});
  const [demoSummary, setDemoSummary] = useState<{ status: string; elapsedMs: number; error?: string } | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);

  // Log accumulator
  const logRef = useRef<LogEntry[]>([]);
  const logIdRef = useRef(0);
  const logElRef = useRef<HTMLDivElement | null>(null);

  // Build rows from trace
  const rows = useMemo<Record<string, AgentRow>>(() => {
    const source = taskId ? trace.agents : demoAgents;
    const result: Record<string, AgentRow> = {};
    for (const meta of AGENTS) {
      result[meta.name] = source[meta.name] ?? {
        name: meta.name, state: 'waiting', elapsedMs: 0, tokenUsed: 0,
      };
    }
    return result;
  }, [demoAgents, taskId, trace.agents]);

  // Demo mode: replay events when no taskId
  const demoCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (taskId) {
      demoCleanupRef.current?.();
      setDemoAgents({});
      setDemoSummary(null);
      return;
    }
    // clear and restart demo loop
    logRef.current = [];
    setLogEntries([]);
    setDemoAgents({});
    setDemoSummary(null);
    const cancel = replayMockEvents(
      DEMO_EVENTS,
      (evt) => {
        setDemoAgents((prev) => applyDemoEvent(prev, evt));
        if (evt.type === 'task.summary') {
          setDemoSummary({
            status: String(evt.payload.status ?? 'ok'),
            elapsedMs: Number(evt.payload.elapsed_ms ?? 0),
          });
          appendLog('System', formatSummaryMessage(evt.payload), evt.type);
        }
        // We don't actually dispatch here since useAgentTraceSSE won't pick it up
        // in demo mode; we mirror state locally and add log entries.
        if (evt.type === 'agent.start' || evt.type === 'agent.done' || evt.type === 'agent.delta') {
          appendLog(evt.agent, formatEventMessage(evt), evt.type);
        }
      },
      700
    );
    demoCleanupRef.current = cancel;
    return cancel;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  function appendLog(agent: string, text: string, type: string) {
    const next = [...logRef.current, { id: logIdRef.current++, agent, text, type }].slice(-40);
    logRef.current = next;
    setLogEntries(next);
  }

  useEffect(() => {
    const container = logElRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [logEntries]);

  // Also sync SSE-driven events to the log renderer
  const prevAgentsRef = useRef<Record<string, AgentRow>>({});
  useEffect(() => {
    if (!taskId) {
      prevAgentsRef.current = { ...rows };
      return;
    }
    const prev = prevAgentsRef.current;
    for (const [name, row] of Object.entries(rows)) {
      const was = prev[name];
      if (!was) continue;
      if (was.state !== row.state) {
        let text = '';
        if (row.state === 'running') text = formatStateMessage(name, 'agent.start', row);
        else if (row.state === 'done') text = formatStateMessage(name, 'agent.done', row);
        else if (row.state === 'error') text = formatStateMessage(name, 'agent.error', row);
        else if (row.state === 'streaming') text = formatStateMessage(name, 'agent.delta', row);
        if (text) appendLog(name, text, row.state === 'done' ? 'agent.done' : row.state === 'running' ? 'agent.start' : row.state === 'error' ? 'agent.error' : 'agent.delta');
      } else if (row.state === 'streaming' && row.latestDelta && row.latestDelta !== was.latestDelta) {
        appendLog(name, formatStateMessage(name, 'agent.delta', row), 'agent.delta');
      }
    }
    prevAgentsRef.current = { ...rows };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const totalDone = Object.values(rows).filter(r => r.state === 'done').length;
  const totalAgents = AGENTS.length;
  const pct = Math.round((totalDone / totalAgents) * 100);
  const summary = taskId ? trace.summary : demoSummary;
  const summarySignature = summary ? `${summary.status}:${summary.elapsedMs}:${summary.error ?? ''}` : '';
  const prevSummaryRef = useRef('');
  useEffect(() => {
    if (!summary || !taskId) return;
    if (prevSummaryRef.current === summarySignature) return;
    prevSummaryRef.current = summarySignature;
    appendLog('System', formatSummaryMessage(summary), 'task.summary');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, summarySignature, taskId]);

  return (
    <div style={wrapStyle}>
      <style>{KEYFRAMES}</style>

      {/* ── Header ── */}
      <div style={sectionHeaderStyle}>
        <span style={eyebrowStyle}>Agent Flow</span>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 800, marginLeft: 'auto' }}>
          {totalDone}/{totalAgents} 完成
        </span>
      </div>

      {/* ── Progress bar ── */}
      <div style={progressTrackStyle}>
        <div style={{ ...progressFillStyle, width: `${pct}%` }} />
      </div>

      {/* ── SVG Flow Diagram ── */}
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <svg
          viewBox="0 0 840 244"
          style={{ width: '100%', minWidth: 600, height: 'auto', display: 'block', overflow: 'visible' }}
        >
          <defs>
            <marker id="fviz-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={C.muted} />
            </marker>
            <marker id="fviz-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={C.yellow} />
            </marker>
            <marker id="fviz-arrow-done" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={C.green} />
            </marker>
          </defs>

          {/* Edges */}
          {EDGES.map(({ from, to }) => {
            const src = AGENT_MAP[from];
            const dst = AGENT_MAP[to];
            if (!src || !dst) return null;
            const fromState = rows[from]?.state ?? 'waiting';
            const isActive = fromState === 'running' || fromState === 'streaming';
            const isDone = fromState === 'done';
            const x1 = src.x + src.w;
            const y1 = src.y + src.h / 2;
            const x2 = dst.x;
            const y2 = dst.y + dst.h / 2;
            const mx = (x1 + x2) / 2;
            const stroke = isDone ? C.green : isActive ? C.yellow : '#c8c0b8';
            const markerId = isDone ? 'fviz-arrow-done' : isActive ? 'fviz-arrow-active' : 'fviz-arrow';
            return (
              <path
                key={`${from}-${to}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={stroke}
                strokeWidth={isDone ? 2 : isActive ? 2.5 : 1.5}
                strokeDasharray={isDone || isActive ? 'none' : '5 4'}
                markerEnd={`url(#${markerId})`}
                style={isActive ? { animation: 'fviz-flow 1s linear infinite' } : {}}
              />
            );
          })}

          {/* Nodes */}
          {AGENTS.map((meta) => {
            const row = rows[meta.name];
            const state = row?.state ?? 'waiting';
            const sc = STATE_COLORS[state] ?? STATE_COLORS.waiting;
            const isActive = state === 'running' || state === 'streaming';
            const shadow = isActive
              ? `drop-shadow(4px 4px 0 ${C.yellow}) drop-shadow(0 0 12px rgba(255,224,27,0.4))`
              : state === 'done'
                ? `drop-shadow(3px 3px 0 ${C.green})`
                : state === 'error'
                  ? `drop-shadow(3px 3px 0 ${C.coral})`
                  : `drop-shadow(3px 3px 0 ${C.ink})`;

            return (
              <g key={meta.name} style={{ filter: shadow }}>
                {/* Card */}
                <rect
                  x={meta.x} y={meta.y}
                  width={meta.w} height={meta.h}
                  rx={12} ry={12}
                  fill={sc.fill}
                  stroke={sc.stroke}
                  strokeWidth={isActive ? 2.5 : 2}
                  style={isActive ? { animation: 'fviz-breathe 1.4s ease-in-out infinite' } : {}}
                />

                {/* Icon */}
                <text x={meta.x + 12} y={meta.y + 22} fontSize={14}>{meta.icon}</text>

                {/* Label */}
                <text
                  x={meta.x + 12} y={meta.y + 36}
                  fontSize={11} fontWeight={900}
                  fontFamily="'Inter Tight', Helvetica, sans-serif"
                  fill={C.ink}
                >{meta.label}</text>

                {/* Caption / status */}
                <text
                  x={meta.x + 12} y={meta.y + 48}
                  fontSize={9.5} fontWeight={700}
                  fontFamily="'Inter Tight', Helvetica, sans-serif"
                  fill={state === 'done' ? C.green : C.muted}
                >
                  {state === 'done'
                    ? `✓ ${(row.elapsedMs / 1000).toFixed(1)}s`
                    : state === 'running' || state === 'streaming'
                      ? (row.latestDelta ? row.latestDelta.slice(0, 14) : '运行中…')
                      : state === 'error'
                        ? '✗ 错误'
                        : meta.caption}
                </text>

                {/* Status dot */}
                <circle
                  cx={meta.x + meta.w - 12} cy={meta.y + 14} r={5}
                  fill={sc.dot}
                  style={isActive ? { animation: 'fviz-pulse 1s ease-in-out infinite' } : {}}
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Console log ── */}
      <div style={consoleWrapStyle}>
        <div style={consoleHeaderStyle}>
          <span style={tlStyle('#ff5f57')} />
          <span style={tlStyle('#febc2e')} />
          <span style={tlStyle('#28c840')} />
          <span style={{ fontSize: 10, color: '#888', fontWeight: 700, marginLeft: 6, letterSpacing: 0.5 }}>
            agent.log · 运行日志
          </span>
          {summary && (
            <span style={{
              marginLeft: 'auto', fontSize: 10, fontWeight: 900,
              color: summary.status === 'ok' ? C.green : C.coral,
            }}>
              {summary.status === 'ok' ? `✓ 完成 · ${(summary.elapsedMs / 1000).toFixed(1)}s` : '✗ 出错'}
            </span>
          )}
        </div>
        <div
          ref={logElRef}
          style={consoleBodyStyle}
        >
          {logEntries.map((entry) => (
            <div key={entry.id} style={logLineStyle}>
              <span style={logTagStyle(entry.agent, entry.type)}>{getLogTag(entry.agent)}</span>
              <span style={logTextStyle}>{entry.text}</span>
            </div>
          ))}
          {logEntries.length === 0 && (
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.muted, opacity: 0.6 }}>
              {taskId ? '等待 Agent 事件流…' : '演示模式 — 日志将在此处实时滚动…'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function applyDemoEvent(
  prev: Record<string, AgentRow>,
  event: AgentEvent,
): Record<string, AgentRow> {
  if (event.type === 'task.summary') return prev;
  const row = prev[event.agent] ?? { name: event.agent, state: 'waiting', elapsedMs: 0, tokenUsed: 0 };
  const next: AgentRow = { ...row };

  if (event.type === 'agent.start') {
    next.state = 'running';
  } else if (event.type === 'agent.delta') {
    next.state = 'streaming';
    const stage = event.payload.stage;
    next.latestDelta = typeof stage === 'string' ? stage : '生成中…';
  } else if (event.type === 'agent.done') {
    next.state = 'done';
    const elapsed = event.payload.elapsed_ms;
    const token = event.payload.token_used;
    if (typeof elapsed === 'number') next.elapsedMs = elapsed;
    if (typeof token === 'number') next.tokenUsed = token;
  } else if (event.type === 'agent.error') {
    next.state = 'error';
    const error = event.payload.error;
    if (typeof error === 'string') next.error = error;
  }

  return { ...prev, [event.agent]: next };
}

function getLogTag(agent: string): string {
  return AGENT_LOG_COPY[agent]?.tag ?? agent;
}

function formatEventMessage(event: AgentEvent): string {
  if (event.type === 'agent.start') {
    return AGENT_LOG_COPY[event.agent]?.start ?? `${event.agent} 已启动。`;
  }
  if (event.type === 'agent.delta') {
    return formatStageMessage(event.agent, event.payload.stage);
  }
  if (event.type === 'agent.done') {
    return formatDoneMessage(event.agent, Number(event.payload.elapsed_ms ?? 0), Number(event.payload.token_used ?? 0));
  }
  if (event.type === 'agent.error') {
    return `执行异常：${String(event.payload.error ?? '未知错误')}`;
  }
  return '';
}

function formatStateMessage(
  agent: string,
  type: 'agent.start' | 'agent.delta' | 'agent.done' | 'agent.error',
  row: AgentRow,
): string {
  if (type === 'agent.start') {
    return AGENT_LOG_COPY[agent]?.start ?? `${agent} 已启动。`;
  }
  if (type === 'agent.delta') {
    return formatStageMessage(agent, row.latestDelta);
  }
  if (type === 'agent.done') {
    return formatDoneMessage(agent, row.elapsedMs, row.tokenUsed);
  }
  return `执行异常：${row.error ?? '未知错误'}`;
}

function formatStageMessage(agent: string, stage: unknown): string {
  const normalized = typeof stage === 'string' ? stage : '';
  const knownStage = STAGE_MESSAGE_MAP[normalized];
  if (knownStage) return knownStage;
  if (!normalized) return AGENT_LOG_COPY[agent]?.delta ?? '阶段更新已到达。';
  return `阶段更新：${normalized.replaceAll('_', ' ')}。`;
}

function formatDoneMessage(agent: string, elapsedMs: number, tokenUsed: number): string {
  const base = AGENT_LOG_COPY[agent]?.done ?? `${agent} 执行完成。`;
  const seconds = elapsedMs > 0 ? `${(elapsedMs / 1000).toFixed(1)}s` : '0.0s';
  const tokens = tokenUsed > 0 ? ` · tokens ${tokenUsed}` : '';
  return `${base} 用时 ${seconds}${tokens}。`;
}

function formatSummaryMessage(summary: { status?: unknown; elapsed_ms?: unknown; elapsedMs?: unknown; error?: unknown }): string {
  const status = String(summary.status ?? 'unknown');
  const elapsedMs = Number(summary.elapsed_ms ?? summary.elapsedMs ?? 0);
  if (status !== 'ok') {
    return `本轮任务结束于异常状态：${String(summary.error ?? '未知错误')}。`;
  }
  return `整条链路执行完成，资源包与评估建议已经就绪。总耗时 ${(elapsedMs / 1000).toFixed(1)}s。`;
}

const STAGE_MESSAGE_MAP: Record<string, string> = {
  profile_finalized: AGENT_LOG_COPY.ProfileAgent.delta,
  plan_finalized: AGENT_LOG_COPY.PlannerAgent.delta,
  document_finalized: AGENT_LOG_COPY.DocumentAgent.delta,
  exercise_finalized: AGENT_LOG_COPY.ExerciseAgent.delta,
  visual_finalized: AGENT_LOG_COPY.VisualAgent.delta,
  code_finalized: AGENT_LOG_COPY.CodeAgent.delta,
  evaluation_finalized: AGENT_LOG_COPY.EvaluationAgent.delta,
};

/* ─── Styles ─── */
const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  padding: 20,
  border: `3px solid ${C.ink}`,
  borderRadius: 20,
  background: C.paper,
  boxShadow: `6px 6px 0 ${C.ink}`,
  overflow: 'hidden',
};

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 10,
};

const eyebrowStyle: React.CSSProperties = {
  display: 'inline-flex',
  padding: '5px 11px',
  border: `2px solid ${C.ink}`,
  borderRadius: 999,
  background: C.yellow,
  boxShadow: `2px 2px 0 ${C.ink}`,
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '0.04em',
};

const progressTrackStyle: React.CSSProperties = {
  height: 6,
  background: C.cream,
  border: `1.5px solid ${C.ink}`,
  borderRadius: 6,
  overflow: 'hidden',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  background: `linear-gradient(90deg, ${C.yellow}, #ffd84a)`,
  borderRadius: 6,
  transition: 'width 0.5s ease',
};

const consoleWrapStyle: React.CSSProperties = {
  marginTop: 16,
  border: `2px solid ${C.ink}`,
  borderRadius: 14,
  background: '#1a1614',
  boxShadow: `4px 4px 0 ${C.ink}`,
  overflow: 'hidden',
};

const consoleHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '10px 14px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  background: '#141210',
};

const consoleBodyStyle: React.CSSProperties = {
  padding: '12px 16px',
  minHeight: 130,
  maxHeight: 180,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const logLineStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  animation: 'fviz-in 0.2s ease',
  fontSize: 11,
  lineHeight: 1.75,
  fontFamily: "'JetBrains Mono', monospace",
};

const logTextStyle: React.CSSProperties = {
  color: C.paper,
  opacity: 0.82,
};

function logTagStyle(agent: string, type: string): React.CSSProperties {
  return {
    flexShrink: 0,
    padding: '1px 6px',
    borderRadius: 5,
    fontSize: 10,
    fontWeight: 900,
    marginTop: 2,
    border: `1.5px solid ${C.ink}`,
    background: type === 'agent.done' ? C.green : type === 'agent.start' ? C.yellow : C.cream,
    color: type === 'agent.done' ? 'white' : C.ink,
    minWidth: AGENT_MAP[agent] ? undefined : 72,
  };
}

function tlStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-block',
    width: 10, height: 10,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  };
}

/* ─── Keyframes ─── */
const KEYFRAMES = `
@keyframes fviz-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}
@keyframes fviz-pulse {
  0%, 100% { r: 5; opacity: 1; }
  50% { r: 4; opacity: 0.5; }
}
@keyframes fviz-flow {
  0% { stroke-dashoffset: 0; }
  100% { stroke-dashoffset: -20; }
}
@keyframes fviz-in {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}
`;
