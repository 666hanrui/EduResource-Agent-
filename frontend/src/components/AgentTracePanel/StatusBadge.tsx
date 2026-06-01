import type { AgentState } from '../../types/agentTrace';

interface Props {
  state: AgentState;
}

const COLOR_MAP: Record<AgentState, { bg: string; label: string; icon: string }> = {
  waiting: { bg: '#FFFDF6', label: '等一等', icon: '◷' },
  running: { bg: '#FFE01B', label: '开工中', icon: '⚙' },
  streaming: { bg: '#FFE01B', label: '正在写', icon: '⠋' },
  done: { bg: '#DFF6DD', label: '搞定', icon: '✓' },
  error: { bg: '#FFD8DF', label: '摔跤了', icon: '✗' },
};

export function StatusBadge({ state }: Props) {
  const cfg = COLOR_MAP[state];
  const isStreaming = state === 'streaming';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 9px',
        border: '2px solid #241C15',
        borderRadius: 999,
        backgroundColor: cfg.bg,
        color: '#241C15',
        boxShadow: '2px 2px 0 #241C15',
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: 'nowrap',
        animation: isStreaming ? 'agent-trace-breathe 1.2s ease-in-out infinite' : undefined,
      }}
    >
      <span aria-hidden>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}
