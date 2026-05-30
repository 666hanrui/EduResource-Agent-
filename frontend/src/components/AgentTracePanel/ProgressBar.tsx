/**
 * ProgressBar —— Agent 自适应进度条。
 *
 * 渲染策略：
 * - waiting   : 空槽
 * - running   : 不定量条纹动画
 * - streaming : 同 running，但用更亮的呼吸蓝
 * - done      : 100% 实条 + elapsed 文本
 * - error     : 红条 + 错误信息提示
 */

import type { AgentState } from '../../types/agentTrace';

interface Props {
  state: AgentState;
  elapsedMs: number;
}

const TRACK_STYLE: React.CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 8,
  borderRadius: 4,
  backgroundColor: '#f0f0f0',
  overflow: 'hidden',
};

export function ProgressBar({ state, elapsedMs }: Props) {
  const filled =
    state === 'done' ? '100%' : state === 'error' ? '100%' : '40%';
  const colorByState: Record<AgentState, string> = {
    waiting: '#d9d9d9',
    running: '#69b1ff',
    streaming: '#1677ff',
    done: '#52c41a',
    error: '#ff4d4f',
  };

  return (
    <div style={TRACK_STYLE}>
      <div
        style={{
          width: filled,
          height: '100%',
          backgroundColor: colorByState[state],
          transition: 'width 200ms ease-out',
          animation:
            state === 'running' || state === 'streaming'
              ? 'agent-trace-stripe 1.6s linear infinite'
              : undefined,
          backgroundImage:
            state === 'running' || state === 'streaming'
              ? 'linear-gradient(90deg, rgba(255,255,255,0.4) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0.4) 75%, transparent 75%)'
              : undefined,
          backgroundSize: state === 'streaming' ? '24px 24px' : undefined,
        }}
      />
      {state === 'done' || state === 'error' ? (
        <span
          style={{
            position: 'absolute',
            right: 6,
            top: -16,
            fontSize: 11,
            color: '#666',
          }}
        >
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      ) : null}
    </div>
  );
}
