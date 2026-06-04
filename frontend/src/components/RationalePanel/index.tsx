/**
 * RationalePanel —— 资源溯源四段式弹层。
 *
 * 进行了完全的系统级视觉重构，深度匹配 Vercel-Mesh 极客暗黑毛玻璃风格！
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Rationale } from '../../types/resources';

interface Props {
  rationale: Rationale;
  title?: string;
  onClose: () => void;
}

export function RationalePanel({ rationale, title, onClose }: Props) {
  const diffDelta = rationale.difficulty_used - rationale.difficulty_adjusted_from;
  const diffLabel =
    diffDelta === 0
      ? '保持难度'
      : diffDelta > 0
        ? `上调 ${diffDelta} 级`
        : `下调 ${Math.abs(diffDelta)} 级`;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div style={headerTitleStyle}>
            <span style={pulseDotStyle} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: '"Outfit", sans-serif' }}>
              {title ?? '为什么生成这份资源？'}
            </h3>
          </div>
          <button onClick={onClose} style={closeStyle} aria-label="关闭">×</button>
        </header>

        <div style={scrollContentStyle}>
          <Section
            n={1}
            title="画像匹配"
            subtitle="对应学生的哪些特征维度"
          >
            {rationale.matched_profile.length === 0 ? (
              <Empty>未声明画像匹配参数</Empty>
            ) : (
              <div style={chipContainerStyle}>
                {rationale.matched_profile.map((m, i) => (
                  <span key={i} style={profileChipStyle}>{m}</span>
                ))}
              </div>
            )}
          </Section>

          <Section
            n={2}
            title="短板对应"
            subtitle="针对的核心薄弱点"
          >
            {rationale.addressed_weakness.length === 0 ? (
              <Empty>无明显短板，推荐系统按通识进行生成</Empty>
            ) : (
              <div style={chipContainerStyle}>
                {rationale.addressed_weakness.map((w, i) => (
                  <span key={i} style={weaknessChipStyle}>{w}</span>
                ))}
              </div>
            )}
          </Section>

          <Section
            n={3}
            title="难度自适应"
            subtitle={`${rationale.difficulty_adjusted_from} → ${rationale.difficulty_used}（${diffLabel}）`}
          >
            <DifficultyBar from={rationale.difficulty_adjusted_from} to={rationale.difficulty_used} />
          </Section>

          <Section
            n={4}
            title="生产指纹"
            subtitle="本次生成链路的 Agent 参数"
          >
            <div style={fingerprintGridStyle}>
              <FingerprintItem label="Agent Node" value={rationale.agent_name} glowColor="rgba(0, 112, 243, 0.15)" />
              <FingerprintItem label="Prompt Hash" value={rationale.prompt_version} glowColor="rgba(255, 0, 128, 0.12)" />
              <FingerprintItem label="Model Runtime" value={rationale.model_name} glowColor="rgba(245, 166, 35, 0.12)" />
            </div>

            {rationale.cited_sources.length > 0 && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                <div style={citedHeaderStyle}>引用学术/教研资料来源</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {rationale.cited_sources.map((s, i) => (
                    <div key={i} style={sourceCardStyle}>
                      <div style={sourceTitleStyle}>📖 {s.title}</div>
                      <div style={sourceMetaStyle}>
                        {s.page && s.page !== 'unknown' ? <span style={sourceBadgeStyle}>Page {s.page}</span> : null}
                        {typeof s.similarity === 'number' && s.similarity > 0 ? (
                          <span style={{ ...sourceBadgeStyle, color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.2)', background: 'rgba(16, 185, 129, 0.05)' }}>
                            向量匹配度 {(s.similarity * 100).toFixed(0)}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── 子组件 ───────────────────────────

function Section({
  n,
  title,
  subtitle,
  children,
}: {
  n: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginBottom: 20, borderBottom: '1px solid rgba(255, 255, 255, 0.04)', paddingBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={badgeStyle}>{String(n).padStart(2, '0')}</span>
        <div style={{ display: 'grid' }}>
          <strong style={{ fontSize: 14, color: '#f4f4f5', fontWeight: 650, letterSpacing: '-0.01em' }}>{title}</strong>
          {subtitle && (
            <span style={{ fontSize: 11.5, color: '#888888', fontFamily: '"Geist Mono", monospace', marginTop: 2 }}>{subtitle}</span>
          )}
        </div>
      </div>
      <div style={{ marginTop: 12, paddingLeft: 34 }}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 12, color: '#52525b', fontStyle: 'italic', fontFamily: '"Geist Mono", monospace' }}>{children}</span>;
}

function FingerprintItem({ label, value, glowColor }: { label: string; value: string; glowColor: string }) {
  return (
    <div style={{ ...fingerprintCardStyle, boxShadow: `0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 0 12px ${glowColor}` }}>
      <div style={fingerprintLabelStyle}>{label}</div>
      <code style={fingerprintValueStyle}>{value}</code>
    </div>
  );
}

function DifficultyBar({ from, to }: { from: number; to: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const isFrom = i === from;
        const isTo = i === to;
        const inRange = (i >= Math.min(from, to)) && (i <= Math.max(from, to));
        
        let bg = 'rgba(255, 255, 255, 0.03)';
        let border = '1px solid rgba(255, 255, 255, 0.06)';
        let color = '#52525b';
        let boxShadow = 'none';

        if (isTo) {
          bg = '#0070f3';
          border = '1px solid rgba(0, 112, 243, 0.5)';
          color = '#ffffff';
          boxShadow = '0 0 14px rgba(0, 112, 243, 0.4)';
        } else if (isFrom) {
          bg = '#f5a623';
          border = '1px solid rgba(245, 166, 35, 0.5)';
          color = '#ffffff';
          boxShadow = '0 0 14px rgba(245, 166, 35, 0.3)';
        } else if (inRange) {
          bg = 'rgba(0, 112, 243, 0.12)';
          border = '1px solid rgba(0, 112, 243, 0.2)';
          color = '#0070f3';
        }

        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: bg,
                border: border,
                color: color,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: isTo || isFrom ? 700 : 500,
                fontFamily: '"Geist Mono", monospace',
                boxShadow: boxShadow,
                transition: 'all 200ms ease',
              }}
            >
              {i}
            </div>
            <span style={{ fontSize: 9, fontFamily: '"Geist Mono", monospace', color: isTo ? '#0070f3' : isFrom ? '#f5a623' : '#3f3f46' }}>
              {isTo ? 'Target' : isFrom ? 'From' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── 样式表 ───────────────────────────

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.65)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  animation: 'fadeIn 250ms cubic-bezier(0.16, 1, 0.3, 1)',
};

const panelStyle: CSSProperties = {
  width: 500,
  maxHeight: '85vh',
  background: 'linear-gradient(180deg, rgba(20, 20, 25, 0.95) 0%, rgba(10, 10, 12, 0.98) 100%)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 16,
  padding: 24,
  boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 40px rgba(0, 112, 243, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: '"Geist", "Outfit", system-ui, -apple-system, sans-serif',
  color: '#f4f4f5',
};

const scrollContentStyle: CSSProperties = {
  overflowY: 'auto',
  flex: 1,
  paddingRight: 4,
  marginTop: 10,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingBottom: 14,
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
};

const headerTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
};

const pulseDotStyle: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#ff0080',
  boxShadow: '0 0 8px #ff0080',
};

const closeStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 24,
  color: '#a1a1aa',
  cursor: 'pointer',
  lineHeight: 1,
  transition: 'color 200ms ease',
};

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 6,
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: '#f4f4f5',
  fontFamily: '"Geist Mono", monospace',
  fontSize: 11,
  fontWeight: 700,
};

const chipContainerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const profileChipStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(0, 112, 243, 0.05)',
  border: '1px solid rgba(0, 112, 243, 0.15)',
  color: '#0070f3',
  fontSize: 12,
  fontWeight: 500,
};

const weaknessChipStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255, 0, 128, 0.04)',
  border: '1px solid rgba(255, 0, 128, 0.15)',
  color: '#ff0080',
  fontSize: 12,
  fontWeight: 500,
};

const fingerprintGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
};

const fingerprintCardStyle: CSSProperties = {
  padding: 10,
  borderRadius: 8,
  background: 'rgba(255, 255, 255, 0.01)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  display: 'grid',
  gap: 4,
};

const fingerprintLabelStyle: CSSProperties = {
  fontSize: 9.5,
  color: '#a1a1aa',
  fontFamily: '"Geist Mono", monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const fingerprintValueStyle: CSSProperties = {
  fontSize: 11.5,
  color: '#f4f4f5',
  fontFamily: '"Geist Mono", monospace',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const citedHeaderStyle: CSSProperties = {
  fontSize: 11.5,
  color: '#a1a1aa',
  fontFamily: '"Geist Mono", monospace',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 8,
};

const sourceCardStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  background: 'rgba(255, 255, 255, 0.015)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const sourceTitleStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 550,
  color: '#f4f4f5',
};

const sourceMetaStyle: CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
};

const sourceBadgeStyle: CSSProperties = {
  padding: '1px 6px',
  borderRadius: 4,
  border: '1px solid rgba(255, 255, 255, 0.06)',
  background: 'rgba(255, 255, 255, 0.02)',
  fontSize: 9.5,
  color: '#a1a1aa',
  fontFamily: '"Geist Mono", monospace',
};
