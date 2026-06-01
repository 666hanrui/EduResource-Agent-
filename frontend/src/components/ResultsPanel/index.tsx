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

type AskWhy = (rationale: Rationale, title: string) => void;

const C = {
  yellow: '#FFE01B',
  ink: '#241C15',
  cream: '#FBEFE3',
  paper: '#FFFDF6',
  muted: '#88837C',
  coral: '#FF4D74',
};

export function ResultsPanel({ results, loading }: Props) {
  const [activeRationale, setActiveRationale] = useState<{
    rationale: Rationale;
    title: string;
  } | null>(null);

  if (loading && !results) {
    return (
      <EmptyState
        title="Agent 们正在排队干活"
        body="右侧剧场会实时亮起。等它们跑完，这里会自动贴出讲解、题目、代码和可视化。"
      />
    );
  }

  if (!results) {
    return (
      <EmptyState
        title="还没开始生成"
        body="填好知识点和学生 ID，点“开始生成”。别怕，系统会把为什么生成这个也一起交代清楚。"
      />
    );
  }

  const producedCount = [results.document, results.exercise, results.code, results.visual, results.evaluation].filter(Boolean).length;

  return (
    <div style={wrapStyle}>
      <section style={summaryStyle}>
        <div>
          <span style={eyebrowStyle}>Resource Pack</span>
          <h2 style={{ margin: '8px 0 0', fontSize: 28 }}>这一轮产出了 {producedCount} 组学习材料</h2>
          <p style={summaryTextStyle}>每张卡片都保留“为什么生成这个”的入口，展示画像匹配、短板、难度调整和生成指纹。</p>
        </div>
        <div style={stampStyle}>可追溯</div>
      </section>

      <div style={gridStyle}>
        {results.document && (
          <DocumentCard data={results.document} onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })} />
        )}
        {results.exercise && (
          <ExerciseCard data={results.exercise} onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })} />
        )}
        {results.code && (
          <CodeCard data={results.code} onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })} />
        )}
        {results.visual && (
          <VisualCard data={results.visual} onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })} />
        )}
        {results.evaluation && <EvaluationCard data={results.evaluation} />}
      </div>

      {Object.keys(results.errors).length > 0 && (
        <div style={errorBoxStyle}>有 Agent 摔了一跤，但系统已兜底：{Object.keys(results.errors).join(' / ')}</div>
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div style={emptyStyle}>
      <div style={emptyMascotStyle} />
      <h2 style={{ margin: '14px 0 8px', fontSize: 34 }}>{title}</h2>
      <p style={{ margin: 0, maxWidth: 520, color: C.muted, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

function CardShell({
  title,
  badge,
  kicker,
  onAskWhy,
  whyTitle,
  rationale,
  children,
}: {
  title: string;
  badge: string;
  kicker: string;
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
          <h3 style={{ margin: '8px 0 4px', fontSize: 22 }}>{title}</h3>
          <div style={kickerStyle}>{kicker}</div>
        </div>
        <button style={whyButtonStyle} onClick={() => onAskWhy(rationale, whyTitle)}>为什么？</button>
      </header>
      <div style={cardBodyStyle}>{children}</div>
    </section>
  );
}

function DocumentCard({ data, onAskWhy }: { data: DocumentResult; onAskWhy: AskWhy }) {
  return (
    <CardShell
      title={data.document.title}
      badge="讲解"
      kicker="先讲清楚，再上题。"
      onAskWhy={onAskWhy}
      whyTitle="为什么生成这份讲解？"
      rationale={data.rationale}
    >
      {data.document.sections.slice(0, 3).map((sec, i) => (
        <div key={i} style={miniSectionStyle}>
          <strong>{sec.heading}</strong>
          <pre style={preStyle}>{sec.body_md}</pre>
        </div>
      ))}
      {data.document.key_diagrams.length > 0 && <div style={metaStyle}>附带 {data.document.key_diagrams.length} 个结构图线索</div>}
    </CardShell>
  );
}

function ExerciseCard({ data, onAskWhy }: { data: ExerciseResult; onAskWhy: AskWhy }) {
  return (
    <CardShell
      title={`自适应题目 × ${data.questions.length}`}
      badge="题目"
      kicker="不是刷题堆量，是按短板补洞。"
      onAskWhy={onAskWhy}
      whyTitle="为什么是这套题？"
      rationale={data.rationale}
    >
      {data.questions.slice(0, 3).map((q, i) => (
        <div key={q.qid} style={questionStyle}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={qNumStyle}>{i + 1}</span>
            <strong style={{ lineHeight: 1.45 }}>{q.stem}</strong>
          </div>
          {q.options.length > 0 && <ul style={listStyle}>{q.options.map((opt, j) => <li key={j}>{opt}</li>)}</ul>}
          <div style={metaStyle}>难度 {q.difficulty} · {q.expected_time_sec}s · 答案 {q.answer}</div>
        </div>
      ))}
    </CardShell>
  );
}

function CodeCard({ data, onAskWhy }: { data: CodeResult; onAskWhy: AskWhy }) {
  const [active, setActive] = useState(0);
  const sample = data.code_samples[active];
  if (!sample) return null;
  return (
    <CardShell
      title="代码案例"
      badge="代码"
      kicker="把概念落到 Python / Java，而不是停在 PPT。"
      onAskWhy={onAskWhy}
      whyTitle="为什么这样写代码？"
      rationale={data.rationale}
    >
      <div style={tabRowStyle}>{data.code_samples.map((s, i) => (
        <button key={s.lang} style={i === active ? tabActiveStyle : tabStyle} onClick={() => setActive(i)}>{s.lang}</button>
      ))}</div>
      <pre style={codeStyle}>{sample.code}</pre>
      <div style={metaStyle}>复杂度：时间 {sample.complexity.time} · 空间 {sample.complexity.space} · {sample.trace.length} 步轨迹</div>
    </CardShell>
  );
}

function VisualCard({ data, onAskWhy }: { data: VisualResult; onAskWhy: AskWhy }) {
  return (
    <CardShell
      title="思维导图 + 动画步骤"
      badge="可视化"
      kicker="用图和动作把抽象步骤拽回地面。"
      onAskWhy={onAskWhy}
      whyTitle="为什么生成这个可视化？"
      rationale={data.rationale}
    >
      <div style={visualGridStyle}>
        <pre style={preStyle}>{data.mindmap_md}</pre>
        <ol style={listStyle}>{data.animation.steps.slice(0, 5).map((s, i) => <li key={i}><code>{s.action}</code> {s.target} — {s.narration}</li>)}</ol>
      </div>
    </CardShell>
  );
}

function EvaluationCard({ data }: { data: EvaluationResult }) {
  const d = data.evaluation_delta;
  return (
    <section style={{ ...cardStyle, background: C.yellow }}>
      <header style={cardHeaderStyle}>
        <div>
          <span style={{ ...badgePillStyle, background: C.coral }}>闭环</span>
          <h3 style={{ margin: '8px 0 4px', fontSize: 22 }}>答题评估</h3>
          <div style={kickerStyle}>生成不是终点，反馈才是闭环。</div>
        </div>
      </header>
      <div style={cardBodyStyle}>
        <p style={{ marginTop: 0, lineHeight: 1.6 }}>{data.narrative}</p>
        <div style={metricRowStyle}>
          <Metric label="正确率" value={`${(d.observed_correct_rate * 100).toFixed(0)}%`} />
          <Metric label="掌握度" value={`${(d.estimated_mastery * 100).toFixed(0)}%`} />
          <Metric label="下一组难度" value={String(d.next_difficulty_recommendation)} />
        </div>
        {d.new_weakness.length > 0 && <div style={metaStyle}>新增短板：{d.new_weakness.join(' / ')}</div>}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={metricStyle}><strong>{value}</strong><span>{label}</span></div>;
}

const wrapStyle: CSSProperties = { display: 'grid', gap: 18, padding: 0, minWidth: 0 };
const summaryStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center', padding: 20, border: `3px solid ${C.ink}`, borderRadius: 24, background: C.cream, boxShadow: `6px 6px 0 ${C.ink}` };
const eyebrowStyle: CSSProperties = { display: 'inline-flex', padding: '5px 10px', border: `2px solid ${C.ink}`, borderRadius: 999, background: C.yellow, fontSize: 12, fontWeight: 900 };
const summaryTextStyle: CSSProperties = { margin: '8px 0 0', color: C.muted, lineHeight: 1.6 };
const stampStyle: CSSProperties = { display: 'grid', placeItems: 'center', width: 86, height: 86, border: `3px solid ${C.ink}`, borderRadius: '50%', background: C.paper, boxShadow: `5px 5px 0 ${C.ink}`, fontWeight: 900, transform: 'rotate(8deg)' };
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 };
const emptyStyle: CSSProperties = { minHeight: 420, display: 'grid', placeItems: 'center', alignContent: 'center', textAlign: 'center', padding: 40, border: `3px dashed ${C.ink}`, borderRadius: 28, background: C.cream };
const emptyMascotStyle: CSSProperties = { width: 104, height: 78, border: `3px solid ${C.ink}`, borderRadius: '55% 45% 50% 50%', background: `radial-gradient(circle at 32% 44%, ${C.ink} 0 4px, transparent 5px), radial-gradient(circle at 62% 40%, ${C.ink} 0 4px, transparent 5px), radial-gradient(ellipse at 50% 68%, transparent 0 14px, ${C.ink} 15px 17px, transparent 18px), ${C.yellow}`, boxShadow: `5px 5px 0 ${C.ink}`, transform: 'rotate(-4deg)' };
const cardStyle: CSSProperties = { border: `3px solid ${C.ink}`, borderRadius: 24, background: C.paper, padding: 18, boxShadow: `6px 6px 0 ${C.ink}` };
const cardHeaderStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 14 };
const cardBodyStyle: CSSProperties = { color: C.ink, fontSize: 14 };
const badgePillStyle: CSSProperties = { display: 'inline-flex', width: 'fit-content', padding: '4px 10px', border: `2px solid ${C.ink}`, borderRadius: 999, background: C.yellow, color: C.ink, fontSize: 12, fontWeight: 900 };
const kickerStyle: CSSProperties = { color: C.muted, fontSize: 13, fontWeight: 700 };
const whyButtonStyle: CSSProperties = { padding: '8px 13px', border: `2px solid ${C.ink}`, borderRadius: 999, background: C.cream, color: C.ink, boxShadow: `3px 3px 0 ${C.ink}`, cursor: 'pointer', fontWeight: 900, whiteSpace: 'nowrap' };
const miniSectionStyle: CSSProperties = { display: 'grid', gap: 8, marginBottom: 12 };
const preStyle: CSSProperties = { margin: 0, padding: 12, border: `2px solid ${C.ink}`, borderRadius: 16, background: C.cream, color: C.ink, fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' };
const codeStyle: CSSProperties = { ...preStyle, background: '#241C15', color: '#FFFDF6' };
const metaStyle: CSSProperties = { marginTop: 8, color: C.muted, fontSize: 12, fontWeight: 800 };
const questionStyle: CSSProperties = { display: 'grid', gap: 8, padding: 12, marginBottom: 10, border: `2px dashed ${C.ink}`, borderRadius: 18, background: C.cream };
const qNumStyle: CSSProperties = { display: 'inline-grid', placeItems: 'center', flex: '0 0 auto', width: 24, height: 24, border: `2px solid ${C.ink}`, borderRadius: '50%', background: C.yellow, fontSize: 12, fontWeight: 900 };
const listStyle: CSSProperties = { margin: 0, paddingLeft: 20, lineHeight: 1.65 };
const tabRowStyle: CSSProperties = { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' };
const tabStyle: CSSProperties = { padding: '6px 14px', border: `2px solid ${C.ink}`, borderRadius: 999, background: C.paper, color: C.ink, boxShadow: `3px 3px 0 ${C.ink}`, cursor: 'pointer', fontWeight: 900 };
const tabActiveStyle: CSSProperties = { ...tabStyle, background: C.yellow };
const visualGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 };
const metricRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 };
const metricStyle: CSSProperties = { display: 'grid', gap: 2, padding: 10, border: `2px solid ${C.ink}`, borderRadius: 16, background: C.paper, textAlign: 'center' };
const errorBoxStyle: CSSProperties = { padding: 12, border: `3px solid ${C.ink}`, borderRadius: 18, background: '#ffd8df', boxShadow: `4px 4px 0 ${C.ink}`, fontWeight: 900 };
