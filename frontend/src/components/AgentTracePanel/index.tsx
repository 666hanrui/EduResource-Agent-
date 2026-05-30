/**
 * AgentTracePanel —— 杀手锏一：Agent 协作时序面板。
 *
 * 用法：
 *   <AgentTracePanel taskId={taskId} />
 *
 * 展示固定 7 行（即使后端还没 emit 也保留 waiting 占位），让评委一眼看出系统结构。
 */

import { useMemo } from 'react';
import type { AgentRow as RowState } from '../../types/agentTrace';
import { AgentRow } from './AgentRow';
import { useAgentTraceSSE } from './useAgentTraceSSE';

const FIXED_AGENTS: { name: string; displayName: string; caption: string }[] = [
  { name: 'ProfileAgent',    displayName: '学生画像 Profile',   caption: '抽取 8 维画像，识别短板' },
  { name: 'PlannerAgent',    displayName: '任务编排 Planner',   caption: '拆解知识点，决定生成什么' },
  { name: 'DocumentAgent',   displayName: '讲解文档 Document',  caption: '生成图解 + 分步骤讲解' },
  { name: 'ExerciseAgent',   displayName: '题目生成 Exercise',  caption: '难度自适应题目 + 解析' },
  { name: 'CodeAgent',       displayName: '代码案例 Code',      caption: 'Python + Java 双语示例' },
  { name: 'VisualAgent',     displayName: '可视化 Visual',      caption: '思维导图 + 动画步骤' },
  { name: 'EvaluationAgent', displayName: '答题评估 Evaluation', caption: '评估 + 画像更新建议' },
];

interface Props {
  taskId: string | null;
  /** 任务标题，例如 "链表知识点 · 学生 stu_001" */
  title?: string;
}

export function AgentTracePanel({ taskId, title }: Props) {
  const { trace, connected } = useAgentTraceSSE(taskId);

  const rows = useMemo<RowState[]>(() => {
    return FIXED_AGENTS.map(
      ({ name }) =>
        trace.agents[name] ?? {
          name,
          state: 'waiting' as const,
          elapsedMs: 0,
          tokenUsed: 0,
        },
    );
  }, [trace.agents]);

  const totalElapsed = trace.summary?.elapsedMs ?? 0;
  const totalToken = rows.reduce((sum, r) => sum + r.tokenUsed, 0);

  return (
    <aside
      style={{
        width: 360,
        padding: 16,
        borderLeft: '1px solid #f0f0f0',
        backgroundColor: '#fafafa',
        height: '100%',
        overflowY: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <style>{KEYFRAMES}</style>

      <header style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Agent 协作时序</h3>
        <div style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
          {title ?? '当前任务'} · {connected ? '运行中' : taskId ? '已结束' : '未启动'}
        </div>
        {(totalElapsed > 0 || totalToken > 0) && (
          <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>
            已用 {(totalElapsed / 1000).toFixed(1)}s · {totalToken} token
          </div>
        )}
      </header>

      <section>
        {rows.map((row, i) => (
          <AgentRow
            key={row.name}
            row={row}
            displayName={FIXED_AGENTS[i].displayName}
            caption={row.latestDelta ?? FIXED_AGENTS[i].caption}
          />
        ))}
      </section>

      {trace.summary && (
        <footer
          style={{
            marginTop: 16,
            padding: 8,
            borderRadius: 6,
            backgroundColor: trace.summary.status === 'ok' ? '#f6ffed' : '#fff1f0',
            fontSize: 12,
            color: trace.summary.status === 'ok' ? '#389e0d' : '#cf1322',
          }}
        >
          任务{trace.summary.status === 'ok' ? '完成' : '失败'} · {(trace.summary.elapsedMs / 1000).toFixed(1)}s
          {trace.summary.error && <div>{trace.summary.error}</div>}
        </footer>
      )}
    </aside>
  );
}

const KEYFRAMES = `
@keyframes agent-trace-stripe {
  0% { background-position: 0 0; }
  100% { background-position: 24px 0; }
}
@keyframes agent-trace-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
`;
