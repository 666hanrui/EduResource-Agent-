/**
 * ResultsPanel —— 主区资源卡片。
 *
 * 把 GenerateFlow 产出按知识点解构、文档讲解、习题、代码、可视化、闭环评估顺序铺开。
 * 每张卡片右上角"为什么"按钮触发 RationalePanel —— 杀手锏二的入口。
 */

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  CodeResult,
  DocumentResult,
  EvaluationResult,
  ExerciseResult,
  GenerateResults,
  Rationale,
  VisualResult,
} from '../../types/resources';
import { RationalePanel } from '../RationalePanel';

interface Props {
  results: GenerateResults | null;
  loading: boolean;
}

export function ResultsPanel({ results, loading }: Props) {
  const [activeRationale, setActiveRationale] = useState<{
    rationale: Rationale;
    title: string;
  } | null>(null);

  if (loading && !results) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 14, color: '#999' }}>资源生成中…</div>
        <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>
          可以盯右侧 Agent 协作时序面板看进度
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: 14, color: '#999' }}>还没有生成任务</div>
        <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>
          填好上面的知识点和学生 ID，点"开始生成"
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      {results.document && (
        <DocumentCard
          data={results.document}
          onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })}
        />
      )}
      {results.exercise && (
        <ExerciseCard
          data={results.exercise}
          onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })}
        />
      )}
      {results.code && (
        <CodeCard
          data={results.code}
          onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })}
        />
      )}
      {results.visual && (
        <VisualCard
          data={results.visual}
          onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })}
        />
      )}
      {results.evaluation && <EvaluationCard data={results.evaluation} />}

      {Object.keys(results.errors).length > 0 && (
        <div style={errorBoxStyle}>
          部分 Agent 失败（已走兜底）：{Object.keys(results.errors).join(' / ')}
        </div>
      )}

      {activeRationale && (
        <RationalePanel
          rationale={activeRationale.rationale}
          title={activeRationale.title}
          onClose={() => setActiveRationale(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────── 资源卡片 ───────────────────────────

type AskWhy = (rationale: Rationale, title: string) => void;

function CardShell({
  title,
  badge,
  onAskWhy,
  whyTitle,
  rationale,
  children,
}: {
  title: string;
  badge: string;
  onAskWhy: AskWhy;
  whyTitle: string;
  rationale: Rationale;
  children: ReactNode;
}) {
  return (
    <section style={cardStyle}>
      <header style={cardHeaderStyle}>
        <div>
          <span style={badgePillStyle}>{badge}</span>
          <strong style={{ marginLeft: 8, fontSize: 15 }}>{title}</strong>
        </div>
        <button style={whyButtonStyle} onClick={() => onAskWhy(rationale, whyTitle)}>
          为什么生成这个？
        </button>
      </header>
      <div style={cardBodyStyle}>{children}</div>
    </section>
  );
}

function DocumentCard({ data, onAskWhy }: { data: DocumentResult; onAskWhy: AskWhy }) {
  return (
    <CardShell
      title={data.document.title}
      badge="讲解文档"
      onAskWhy={onAskWhy}
      whyTitle="为什么生成这份讲解？"
      rationale={data.rationale}
    >
      {data.document.sections.map((sec, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <h4 style={{ margin: '6px 0', fontSize: 14 }}>{sec.heading}</h4>
          <pre style={preStyle}>{sec.body_md}</pre>
        </div>
      ))}
      {data.document.key_diagrams.length > 0 && (
        <div style={metaStyle}>
          含 {data.document.key_diagrams.length} 个结构图
        </div>
      )}
    </CardShell>
  );
}

function ExerciseCard({ data, onAskWhy }: { data: ExerciseResult; onAskWhy: AskWhy }) {
  return (
    <CardShell
      title={`自适应题目 ×${data.questions.length}`}
      badge="题目"
      onAskWhy={onAskWhy}
      whyTitle="为什么是这套题？"
      rationale={data.rationale}
    >
      {data.questions.slice(0, 3).map((q, i) => (
        <div key={q.qid} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13 }}>
            <span style={qNumStyle}>{i + 1}</span>
            <span style={{ marginLeft: 6 }}>{q.stem}</span>
          </div>
          {q.options.length > 0 && (
            <ul style={{ ...listStyle, marginTop: 4 }}>
              {q.options.map((opt, j) => (
                <li key={j} style={{ fontSize: 12, color: '#555' }}>{opt}</li>
              ))}
            </ul>
          )}
          <div style={{ ...metaStyle, marginTop: 4 }}>
            难度 {q.difficulty} · {q.expected_time_sec}s · 答案 {q.answer}
          </div>
        </div>
      ))}
      {data.questions.length > 3 && (
        <div style={metaStyle}>… 共 {data.questions.length} 题</div>
      )}
    </CardShell>
  );
}

function CodeCard({ data, onAskWhy }: { data: CodeResult; onAskWhy: AskWhy }) {
  const [active, setActive] = useState(0);
  const sample = data.code_samples[active];
  if (!sample) return null;
  return (
    <CardShell
      title={`代码案例（${data.code_samples.length} 种语言）`}
      badge="代码"
      onAskWhy={onAskWhy}
      whyTitle="为什么这样写代码？"
      rationale={data.rationale}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {data.code_samples.map((s, i) => (
          <button
            key={s.lang}
            style={i === active ? tabActiveStyle : tabStyle}
            onClick={() => setActive(i)}
          >
            {s.lang}
          </button>
        ))}
      </div>
      <pre style={{ ...preStyle, background: '#0d1117', color: '#c9d1d9', padding: 10 }}>
        {sample.code}
      </pre>
      <div style={metaStyle}>
        复杂度 时间 {sample.complexity.time} · 空间 {sample.complexity.space} ·
        {sample.trace.length} 步执行轨迹
      </div>
    </CardShell>
  );
}

function VisualCard({ data, onAskWhy }: { data: VisualResult; onAskWhy: AskWhy }) {
  return (
    <CardShell
      title="思维导图 + 动画步骤"
      badge="可视化"
      onAskWhy={onAskWhy}
      whyTitle="为什么生成这个可视化？"
      rationale={data.rationale}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: '4px 0', fontSize: 13, color: '#666' }}>思维导图（markdown）</h4>
          <pre style={preStyle}>{data.mindmap_md}</pre>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 style={{ margin: '4px 0', fontSize: 13, color: '#666' }}>动画步骤</h4>
          <ol style={{ ...listStyle, paddingLeft: 18 }}>
            {data.animation.steps.map((s, i) => (
              <li key={i} style={{ fontSize: 12, marginBottom: 4 }}>
                <code>{s.action}</code> {s.target} — {s.narration}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </CardShell>
  );
}

function EvaluationCard({ data }: { data: EvaluationResult }) {
  const d = data.evaluation_delta;
  return (
    <section style={{ ...cardStyle, background: '#fffbe6', borderColor: '#ffe58f' }}>
      <header style={cardHeaderStyle}>
        <div>
          <span style={{ ...badgePillStyle, background: '#fa8c16' }}>闭环评估</span>
          <strong style={{ marginLeft: 8, fontSize: 15 }}>答题分析（模拟）</strong>
        </div>
      </header>
      <div style={cardBodyStyle}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>{data.narrative}</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#555' }}>
          <span>正确率 {(d.observed_correct_rate * 100).toFixed(0)}%</span>
          <span>掌握度 {(d.estimated_mastery * 100).toFixed(0)}%</span>
          <span>下一组难度 {d.next_difficulty_recommendation}</span>
        </div>
        {d.new_weakness.length > 0 && (
          <div style={{ ...metaStyle, marginTop: 6, color: '#cf1322' }}>
            新增短板：{d.new_weakness.join(' / ')}
          </div>
        )}
        {d.resolved_weakness.length > 0 && (
          <div style={{ ...metaStyle, marginTop: 4, color: '#389e0d' }}>
            已克服：{d.resolved_weakness.join(' / ')}
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────── 样式 ───────────────────────────

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 16,
  flex: 1,
  minWidth: 0,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const emptyStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 40,
  fontFamily: 'system-ui, -apple-system, sans-serif',
};

const cardStyle: CSSProperties = {
  border: '1px solid #f0f0f0',
  borderRadius: 8,
  background: '#fff',
  padding: 14,
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const cardBodyStyle: CSSProperties = {
  fontSize: 13,
  color: '#333',
};

const badgePillStyle: CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: 10,
  background: '#1677ff',
  color: '#fff',
  fontSize: 11,
  fontWeight: 600,
};

const whyButtonStyle: CSSProperties = {
  border: '1px solid #1677ff',
  color: '#1677ff',
  background: '#e6f4ff',
  fontSize: 12,
  padding: '4px 10px',
  borderRadius: 4,
  cursor: 'pointer',
};

const preStyle: CSSProperties = {
  margin: 0,
  background: '#fafafa',
  padding: 8,
  borderRadius: 4,
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 200,
  overflow: 'auto',
};

const metaStyle: CSSProperties = {
  fontSize: 11,
  color: '#999',
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 14,
};

const qNumStyle: CSSProperties = {
  display: 'inline-block',
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: '#1677ff',
  color: '#fff',
  textAlign: 'center',
  fontSize: 11,
  lineHeight: '18px',
};

const tabStyle: CSSProperties = {
  border: '1px solid #ddd',
  background: '#fafafa',
  fontSize: 12,
  padding: '4px 12px',
  borderRadius: 4,
  cursor: 'pointer',
};

const tabActiveStyle: CSSProperties = {
  ...tabStyle,
  border: '1px solid #1677ff',
  color: '#1677ff',
  background: '#e6f4ff',
};

const errorBoxStyle: CSSProperties = {
  background: '#fff1f0',
  border: '1px solid #ffa39e',
  borderRadius: 4,
  padding: 8,
  fontSize: 12,
  color: '#cf1322',
};
