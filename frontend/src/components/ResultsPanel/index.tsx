import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  CodeResult,
  DocumentResult,
  EvaluationResult,
  ExerciseResult,
  GenerateResults,
  Rationale,
  SupplementalResourcesResult,
  SupplementalVideoResource,
  VisualResult,
} from '../../types/resources';
import { buildLearningResourceSet } from '../../utils/learningResources';
import { RationalePanel } from '../RationalePanel';

interface Props {
  results: GenerateResults | null;
  loading: boolean;
  knowledgeId?: string;
  knowledgeName?: string;
  studentId?: string;
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

export function ResultsPanel({ results, loading, knowledgeId = 'unknown', knowledgeName = '当前知识点', studentId = 'stu_001' }: Props) {
  const [activeRationale, setActiveRationale] = useState<{
    rationale: Rationale;
    title: string;
  } | null>(null);

  if (loading && !results) {
    return (
      <EmptyState
        title="轻量 Agent 们正在排队干活"
        body="右侧剧场会实时亮起。等它们跑完，这里会自动贴出讲解、题目、代码和可视化。"
      />
    );
  }

  if (!results) {
    return (
      <EmptyState
        title="还没开始生成"
        body="需要旧版 7-Agent 卡片时，点“生成轻量资源”。互动课堂的生成状态会显示在上方卡片。"
      />
    );
  }

  const supplemental =
    results.supplemental ??
    buildLearningResourceSet({
      knowledgeId,
      knowledgeName,
      studentId,
      weakness: profileWeakness(results.profile),
    });
  const producedCount = [results.document, results.exercise, results.code, results.visual, results.evaluation, supplemental].filter(Boolean).length;

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
        {supplemental && (
          <SupplementalCard
            data={supplemental}
            onAskWhy={(r, t) => setActiveRationale({ rationale: r, title: t })}
          />
        )}
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

function SupplementalCard({ data, onAskWhy }: { data: SupplementalResourcesResult; onAskWhy: AskWhy }) {
  const [expandedVideo, setExpandedVideo] = useState<SupplementalVideoResource | null>(null);

  return (
    <>
      <CardShell
        title={`${data.target_knowledge_name} · 补充学习资源`}
        badge="资源"
        kicker="视频、动画和图文入口，不替代生成内容，只补齐学习场景。"
        onAskWhy={onAskWhy}
        whyTitle="为什么推荐这些补充资源？"
        rationale={data.rationale}
      >
        <div style={resourceBlockStyle}>
          <strong>视频小窗</strong>
          <div style={videoGridStyle}>
            {data.videos.slice(0, 3).map((video) => (
              <VideoMiniPlayer key={`${video.bvid ?? video.url}-${video.title}`} video={video} onExpand={() => setExpandedVideo(video)} />
            ))}
          </div>
        </div>
        <div style={resourceBlockStyle}>
          <strong>其他资源</strong>
          {data.readings.slice(0, 3).map((item) => (
            <a key={item.title} style={resourceLinkStyle} href={item.url} target="_blank" rel="noreferrer">
              <span>{item.title}</span>
              <small>{item.tags.slice(0, 2).join(' / ')}</small>
            </a>
          ))}
        </div>
      </CardShell>
      {expandedVideo && <VideoLightbox video={expandedVideo} onClose={() => setExpandedVideo(null)} />}
    </>
  );
}

function VideoMiniPlayer({ video, onExpand }: { video: SupplementalVideoResource; onExpand: () => void }) {
  const embedUrl = resolveBilibiliEmbedUrl(video);

  return (
    <article style={videoCardStyle}>
      <div style={videoFrameStyle}>
        {embedUrl ? (
          <iframe
            title={video.title}
            src={embedUrl}
            style={iframeStyle}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <a style={videoFallbackStyle} href={video.url} target="_blank" rel="noreferrer">去 B站选择视频</a>
        )}
      </div>
      <div style={videoInfoStyle}>
        <strong>{video.title}</strong>
        <small>{video.up_name} · {video.duration}</small>
        <span>{video.fit_reason}</span>
      </div>
      <div style={videoActionRowStyle}>
        <button type="button" style={videoActionButtonStyle} onClick={onExpand} disabled={!embedUrl}>放大</button>
        <a style={videoActionLinkStyle} href={video.url} target="_blank" rel="noreferrer">B站原页</a>
      </div>
    </article>
  );
}

function VideoLightbox({ video, onClose }: { video: SupplementalVideoResource; onClose: () => void }) {
  const embedUrl = resolveBilibiliEmbedUrl(video);

  return (
    <div style={videoLightboxOverlayStyle} role="dialog" aria-modal="true" aria-label={`${video.title} 放大播放`}>
      <section style={videoLightboxStyle}>
        <header style={videoLightboxHeaderStyle}>
          <div>
            <strong>{video.title}</strong>
            <small>{video.up_name} · {video.duration}</small>
          </div>
          <button type="button" style={closeButtonStyle} onClick={onClose}>关闭</button>
        </header>
        {embedUrl && (
          <iframe
            title={`${video.title} 放大播放`}
            src={embedUrl}
            style={videoLightboxFrameStyle}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        )}
        <p style={videoLightboxReasonStyle}>{video.fit_reason}</p>
      </section>
    </div>
  );
}

function resolveBilibiliEmbedUrl(video: SupplementalVideoResource): string {
  if (video.embed_url) return video.embed_url;
  if (!video.bvid) return '';
  const page = video.page && video.page > 1 ? video.page : 1;
  return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(video.bvid)}&page=${page}&as_wide=1&high_quality=1&danmaku=0&autoplay=0`;
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

function profileWeakness(profile: unknown): string[] {
  if (!profile || typeof profile !== 'object') return [];
  const value = (profile as { weakness?: unknown }).weakness;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
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
const resourceBlockStyle: CSSProperties = { display: 'grid', gap: 8, marginBottom: 14 };
const resourceLinkStyle: CSSProperties = { display: 'grid', gap: 4, padding: 12, border: `2px solid ${C.ink}`, borderRadius: 18, background: C.cream, color: C.ink, textDecoration: 'none', boxShadow: `3px 3px 0 ${C.ink}`, fontWeight: 900 };
const videoGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 };
const videoCardStyle: CSSProperties = { display: 'grid', gap: 10, padding: 10, border: `2px solid ${C.ink}`, borderRadius: 18, background: C.cream, boxShadow: `3px 3px 0 ${C.ink}`, minWidth: 0 };
const videoFrameStyle: CSSProperties = { position: 'relative', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', border: `2px solid ${C.ink}`, borderRadius: 14, background: '#111' };
const iframeStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 };
const videoFallbackStyle: CSSProperties = { display: 'grid', placeItems: 'center', width: '100%', height: '100%', color: C.paper, textDecoration: 'none', fontWeight: 900 };
const videoInfoStyle: CSSProperties = { display: 'grid', gap: 4, lineHeight: 1.45 };
const videoActionRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 };
const videoActionButtonStyle: CSSProperties = { padding: '8px 10px', border: `2px solid ${C.ink}`, borderRadius: 999, background: C.yellow, color: C.ink, cursor: 'pointer', fontWeight: 900, boxShadow: `2px 2px 0 ${C.ink}` };
const videoActionLinkStyle: CSSProperties = { display: 'grid', placeItems: 'center', padding: '8px 10px', border: `2px solid ${C.ink}`, borderRadius: 999, background: C.paper, color: C.ink, textDecoration: 'none', fontWeight: 900, boxShadow: `2px 2px 0 ${C.ink}` };
const videoLightboxOverlayStyle: CSSProperties = { position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 24, background: 'rgba(36,28,21,0.72)' };
const videoLightboxStyle: CSSProperties = { width: 'min(1120px, 96vw)', maxHeight: '92vh', display: 'grid', gap: 12, padding: 16, border: `3px solid ${C.ink}`, borderRadius: 24, background: C.paper, boxShadow: `8px 8px 0 ${C.ink}`, overflow: 'auto' };
const videoLightboxHeaderStyle: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 };
const closeButtonStyle: CSSProperties = { padding: '8px 14px', border: `2px solid ${C.ink}`, borderRadius: 999, background: C.cream, color: C.ink, boxShadow: `3px 3px 0 ${C.ink}`, cursor: 'pointer', fontWeight: 900, whiteSpace: 'nowrap' };
const videoLightboxFrameStyle: CSSProperties = { width: '100%', height: 'min(62vh, 620px)', minHeight: 240, border: `2px solid ${C.ink}`, borderRadius: 18, background: '#111' };
const videoLightboxReasonStyle: CSSProperties = { margin: 0, color: C.muted, lineHeight: 1.6, fontWeight: 800 };
