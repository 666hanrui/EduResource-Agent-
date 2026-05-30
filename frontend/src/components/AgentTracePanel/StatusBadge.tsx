/**
 * StatusBadge —— Agent 状态徽标。
 * 与 docs/04-ui-sketch.md 的状态机视觉语言对齐：
 *   waiting   ◷ 灰
 *   running   ⚙ 蓝
 *   streaming ⠋ 蓝色呼吸
 *   done      ✓ 绿
 *   error     ✗ 红
 */

import type { AgentState } from '../../types/agentTrace';

interface Props {
  state: AgentState;
}

const COLOR_MAP: Record<AgentState, { color: string; bg: string; label: string; icon: string }> = {
  waiting: { color: '#999', bg: '#f0f0f0', label: '等待', icon: '◷' },
  running: { color: '#1677ff', bg: '#e6f4ff', label: '运行中', icon: '⚙' },
  streaming: { color: '#1677ff', bg: '#e6f4ff', label: '流式生成', icon: '⠋' },
  done: { color: '#52c41a', bg: '#f6ffed', label: '完成', icon: '✓' },
  error: { color: '#ff4d4f', bg: '#fff1f0', label: '失败', icon: '✗' },
};

export function StatusBadge({ state }: Props) {
  const cfg = COLOR_MAP[state];
  const isStreaming = state === 'streaming';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        color: cfg.color,
        backgroundColor: cfg.bg,
        animation: isStreaming ? 'agent-trace-breathe 1.2s ease-in-out infinite' : undefined,
      }}
    >
      <span aria-hidden>{cfg.icon}</span>
      <span>{cfg.label}</span>
    </span>
  );
}
