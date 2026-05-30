/**
 * AgentRow —— 单个 Agent 一行。
 * 状态徽标 + 进度条 + 最近一条 delta 摘要 + 元信息（token / model / version）。
 */

import type { AgentRow as RowState } from '../../types/agentTrace';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';

interface Props {
  row: RowState;
  /** 中文展示名，例如 ProfileAgent → "学生画像" */
  displayName?: string;
  /** Agent 行下面的一行任务说明，例如 "抽取 8 维画像，识别短板'指针修改顺序'" */
  caption?: string;
}

export function AgentRow({ row, displayName, caption }: Props) {
  return (
    <div
      style={{
        padding: '12px 0',
        borderBottom: '1px dashed #f0f0f0',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          {displayName ?? row.name}
        </span>
        <StatusBadge state={row.state} />
      </div>
      <ProgressBar state={row.state} elapsedMs={row.elapsedMs} />
      {(caption || row.latestDelta) && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: '#666',
            lineHeight: 1.5,
          }}
        >
          {caption ?? row.latestDelta}
        </div>
      )}
      <div
        style={{
          marginTop: 4,
          display: 'flex',
          gap: 12,
          fontSize: 11,
          color: '#999',
        }}
      >
        {row.promptVersion && <span>prompt {row.promptVersion}</span>}
        {row.tokenUsed > 0 && <span>{row.tokenUsed} token</span>}
        {row.error && <span style={{ color: '#ff4d4f' }}>{row.error}</span>}
      </div>
    </div>
  );
}
