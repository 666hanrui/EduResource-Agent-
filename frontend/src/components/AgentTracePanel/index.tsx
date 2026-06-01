import { useMemo } from 'react';
import type { AgentRow as RowState } from '../../types/agentTrace';
import { AgentRow } from './AgentRow';
import { useAgentTraceSSE } from './useAgentTraceSSE';

const FIXED_AGENTS: { name: string; displayName: string; caption: string }[] = [
  { name: 'ProfileAgent', displayName: '学生画像', caption: '先看看学生是谁、卡在哪里' },
  { name: 'PlannerAgent', displayName: '任务编排', caption: '把知识点拆成可执行小任务' },
  { name: 'DocumentAgent', displayName: '讲解文档', caption: '用人话把概念讲清楚' },
  { name: 'ExerciseAgent', displayName: '题目生成', caption: '按短板出题，不乱刷量' },
  { name: 'CodeAgent', displayName: '代码案例', caption: 'Python + Java 双语落地' },
  { name: 'VisualAgent', displayName: '可视化', caption: '思维导图和动画步骤' },
  { name: 'EvaluationAgent', displayName: '答题评估', caption: '把结果回写到画像里' },
];

interface Props {
  taskId: string | null;
  title?: string;
}

const C = { yellow: '#FFE01B', ink: '#241C15', cream: '#FBEFE3', paper: '#FFFDF6', muted: '#88837C' };

export function AgentTracePanel({ taskId, title }: Props) {
  const { trace, connected } = useAgentTraceSSE(taskId);

  const rows = useMemo<RowState[]>(() => FIXED_AGENTS.map(({ name }) => trace.agents[name] ?? {
    name,
    state: 'waiting' as const,
    elapsedMs: 0,
    tokenUsed: 0,
  }), [trace.agents]);

  const totalElapsed = trace.summary?.elapsedMs ?? 0;
  const totalToken = rows.reduce((sum, r) => sum + r.tokenUsed, 0);

  return (
    <aside style={asideStyle}>
      <style>{KEYFRAMES}</style>
      <header style={headerStyle}>
        <span style={eyebrowStyle}>Agent Theatre</span>
        <h3 style={{ margin: '10px 0 4px', fontSize: 24 }}>协作时序</h3>
        <div style={subStyle}>{title ?? '当前任务'} · {connected ? '正在跑' : taskId ? '已收工' : '未启动'}</div>
        {(totalElapsed > 0 || totalToken > 0) && (
          <div style={meterStyle}>用时 {(totalElapsed / 1000).toFixed(1)}s · {totalToken} token</div>
        )}
      </header>

      <section style={{ display: 'grid', gap: 10 }}>
        {rows.map((row, i) => (
          <AgentRow key={row.name} row={row} displayName={FIXED_AGENTS[i].displayName} caption={row.latestDelta ?? FIXED_AGENTS[i].caption} />
        ))}
      </section>

      {trace.summary && (
        <footer style={trace.summary.status === 'ok' ? footerOkStyle : footerBadStyle}>
          任务{trace.summary.status === 'ok' ? '完成' : '失败'} · {(trace.summary.elapsedMs / 1000).toFixed(1)}s
          {trace.summary.error && <div>{trace.summary.error}</div>}
        </footer>
      )}
    </aside>
  );
}

const asideStyle = {
  width: 376,
  padding: 22,
  border: `3px solid ${C.ink}`,
  borderRadius: 30,
  backgroundColor: C.cream,
  height: '100%',
  overflowY: 'auto',
  boxShadow: `8px 8px 0 ${C.ink}`,
  color: C.ink,
} as const;
const headerStyle = { marginBottom: 16, paddingBottom: 16, borderBottom: `2px dashed ${C.ink}` } as const;
const eyebrowStyle = { display: 'inline-flex', padding: '6px 11px', border: `2px solid ${C.ink}`, borderRadius: 999, background: C.yellow, boxShadow: `3px 3px 0 ${C.ink}`, fontSize: 12, fontWeight: 900 } as const;
const subStyle = { marginTop: 6, fontSize: 13, color: C.muted, fontWeight: 800 } as const;
const meterStyle = { marginTop: 8, fontSize: 12, color: C.ink, fontWeight: 900 } as const;
const footerBase = { marginTop: 16, padding: 10, border: `2px solid ${C.ink}`, borderRadius: 16, fontSize: 12, color: C.ink, fontWeight: 900 } as const;
const footerOkStyle = { ...footerBase, background: C.yellow } as const;
const footerBadStyle = { ...footerBase, background: '#ffd8df' } as const;

const KEYFRAMES = `
@keyframes agent-trace-stripe { 0% { background-position: 0 0; } 100% { background-position: 24px 0; } }
@keyframes agent-trace-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
`;
