import type { CSSProperties } from 'react';
import type { AgentState } from '../../types/agentTrace';

interface Props {
  state: AgentState;
  elapsedMs: number;
}

const TRACK_STYLE: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: 12,
  border: '2px solid #241C15',
  borderRadius: 999,
  backgroundColor: '#FFFDF6',
  overflow: 'hidden',
};

export function ProgressBar({ state, elapsedMs }: Props) {
  const filled = state === 'waiting' ? '18%' : state === 'done' || state === 'error' ? '100%' : '46%';
  const colorByState: Record<AgentState, string> = {
    waiting: '#FBEFE3',
    running: '#FFE01B',
    streaming: '#FFE01B',
    done: '#DFF6DD',
    error: '#FFD8DF',
  };

  return (
    <div style={TRACK_STYLE}>
      <div
        style={{
          width: filled,
          height: '100%',
          backgroundColor: colorByState[state],
          borderRight: state === 'waiting' ? undefined : '2px solid #241C15',
          transition: 'width 200ms ease-out',
          animation: state === 'running' || state === 'streaming' ? 'agent-trace-stripe 1.6s linear infinite' : undefined,
          backgroundImage: state === 'running' || state === 'streaming'
            ? 'linear-gradient(90deg, rgba(36,28,21,0.16) 25%, transparent 25%, transparent 50%, rgba(36,28,21,0.16) 50%, rgba(36,28,21,0.16) 75%, transparent 75%)'
            : undefined,
          backgroundSize: '24px 24px',
        }}
      />
      {state === 'done' || state === 'error' ? (
        <span style={elapsedStyle}>{(elapsedMs / 1000).toFixed(1)}s</span>
      ) : null}
    </div>
  );
}

const elapsedStyle: CSSProperties = {
  position: 'absolute',
  right: 7,
  top: -2,
  fontSize: 10,
  color: '#241C15',
  fontWeight: 900,
};
