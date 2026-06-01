import type { AgentRow as RowState } from '../../types/agentTrace';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';

interface Props {
  row: RowState;
  displayName?: string;
  caption?: string;
}

const C = { ink: '#241C15', yellow: '#FFE01B', cream: '#FBEFE3', paper: '#FFFDF6', muted: '#88837C' };

export function AgentRow({ row, displayName, caption }: Props) {
  const active = row.state === 'running';
  const done = row.state === 'done';
  return (
    <div style={{ ...rowStyle, transform: active ? 'rotate(-0.6deg)' : done ? 'rotate(0.4deg)' : undefined, background: active ? C.yellow : C.paper }}>
      <div style={topStyle}>
        <div>
          <span style={agentNameStyle}>{displayName ?? row.name}</span>
          <div style={agentRawNameStyle}>{row.name}</div>
        </div>
        <StatusBadge state={row.state} />
      </div>
      <ProgressBar state={row.state} elapsedMs={row.elapsedMs} />
      {(caption || row.latestDelta) && <div style={captionStyle}>{caption ?? row.latestDelta}</div>}
      <div style={metaStyle}>
        {row.promptVersion && <span>prompt {row.promptVersion}</span>}
        {row.tokenUsed > 0 && <span>{row.tokenUsed} token</span>}
        {row.error && <span style={{ color: '#b00020' }}>{row.error}</span>}
      </div>
    </div>
  );
}

const rowStyle = {
  padding: 12,
  border: `2px solid ${C.ink}`,
  borderRadius: 18,
  boxShadow: `3px 3px 0 ${C.ink}`,
} as const;

const topStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 8,
} as const;

const agentNameStyle = { display: 'block', color: C.ink, fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em' } as const;
const agentRawNameStyle = { marginTop: 2, color: C.muted, fontSize: 11, fontWeight: 800 } as const;
const captionStyle = { marginTop: 8, color: C.ink, fontSize: 12, lineHeight: 1.55, fontWeight: 700 } as const;
const metaStyle = { marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 8, color: C.muted, fontSize: 11, fontWeight: 800 } as const;
