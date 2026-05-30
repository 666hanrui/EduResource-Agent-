/**
 * RationalePanel —— 杀手锏二：资源溯源四段式弹层。
 *
 * 用法：
 *   <RationalePanel rationale={doc.rationale} title="为什么生成这份讲解？" onClose={...} />
 *
 * 四段式与后端 schemas/profile.py::Rationale 对齐：
 *   1. matched_profile          画像匹配
 *   2. addressed_weakness       短板对应
 *   3. difficulty_adjusted_from → difficulty_used  难度自适应
 *   4. agent_name + prompt_version + model_name + cited_sources  生成参数
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
      ? '保持原难度'
      : diffDelta > 0
        ? `上调 ${diffDelta} 级`
        : `下调 ${Math.abs(diffDelta)} 级`;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title ?? '为什么生成这份资源？'}</h3>
          <button onClick={onClose} style={closeStyle} aria-label="关闭">×</button>
        </header>

        <Section
          n={1}
          title="画像匹配"
          subtitle="对应学生的哪些维度"
        >
          {rationale.matched_profile.length === 0 ? (
            <Empty>未声明</Empty>
          ) : (
            <ul style={listStyle}>
              {rationale.matched_profile.map((m, i) => (
                <li key={i} style={liStyle}>{m}</li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          n={2}
          title="短板对应"
          subtitle="本资源专门针对的薄弱点"
        >
          {rationale.addressed_weakness.length === 0 ? (
            <Empty>无明显短板，按通识生成</Empty>
          ) : (
            <ul style={listStyle}>
              {rationale.addressed_weakness.map((w, i) => (
                <li key={i} style={{ ...liStyle, color: '#cf1322' }}>{w}</li>
              ))}
            </ul>
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
          title="生成参数"
          subtitle="本次资源的生产指纹"
        >
          <div style={kvWrapStyle}>
            <Kv k="Agent" v={rationale.agent_name} />
            <Kv k="Prompt" v={rationale.prompt_version} />
            <Kv k="Model" v={rationale.model_name} />
          </div>
          {rationale.cited_sources.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>引用资料</div>
              <ul style={listStyle}>
                {rationale.cited_sources.map((s, i) => (
                  <li key={i} style={liStyle}>
                    {s.title}
                    {s.page && s.page !== 'unknown' ? ` · p.${s.page}` : ''}
                    {typeof s.similarity === 'number' && s.similarity > 0
                      ? ` · 相似度 ${(s.similarity * 100).toFixed(0)}%`
                      : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
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
    <section style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={badgeStyle}>{n}</span>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        {subtitle && (
          <span style={{ fontSize: 12, color: '#888' }}>{subtitle}</span>
        )}
      </div>
      <div style={{ marginTop: 6, paddingLeft: 28 }}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 12, color: '#bbb' }}>{children}</span>;
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <span style={{ fontSize: 12, color: '#444', marginRight: 14 }}>
      <span style={{ color: '#999' }}>{k}：</span>
      <code style={{ background: '#f5f5f5', padding: '1px 6px', borderRadius: 3 }}>{v}</code>
    </span>
  );
}

function DifficultyBar({ from, to }: { from: number; to: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const isFrom = i === from;
        const isTo = i === to;
        const inRange = (i >= Math.min(from, to)) && (i <= Math.max(from, to));
        const bg = isTo
          ? '#1677ff'
          : isFrom
            ? '#fa8c16'
            : inRange
              ? '#bae0ff'
              : '#f0f0f0';
        return (
          <div
            key={i}
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: bg,
              color: isTo || isFrom ? '#fff' : '#999',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: isTo || isFrom ? 700 : 400,
            }}
          >
            {i}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── 样式 ───────────────────────────

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.35)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const panelStyle: CSSProperties = {
  width: 480,
  maxHeight: '80vh',
  background: '#fff',
  borderRadius: 8,
  padding: 20,
  boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  overflowY: 'auto',
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 14,
  borderBottom: '1px solid #f0f0f0',
  paddingBottom: 8,
};

const closeStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 22,
  color: '#999',
  cursor: 'pointer',
  lineHeight: 1,
};

const badgeStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  borderRadius: '50%',
  background: '#1677ff',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  fontSize: 13,
  color: '#333',
};

const liStyle: CSSProperties = { marginBottom: 2 };

const kvWrapStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  rowGap: 6,
};
