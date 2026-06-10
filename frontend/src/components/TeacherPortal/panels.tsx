import { useState, useEffect, type CSSProperties } from 'react';
import type { Rationale } from '../../types/resources';
import type { AgentRow, AgentState } from '../../types/agentTrace';
import { useAgentTraceSSE } from '../AgentTracePanel/useAgentTraceSSE';
import { CLASSES, STUDENTS } from './model';
import type { ClassProfile, ReviewItem, RunState, Student } from './model';
import type { TalentPlanBlueprint, TeacherArtifact, TeacherArtifactLibrary, TeacherArtifactType } from './artifacts';

interface OverviewProps {
  metrics: { value: string; label: string }[];
  onChooseStudent: (student: Student) => void;
  classes: ClassProfile[];
  students: Student[];
  activeClassId: string;
  onClassId: (value: string) => void;
  deliverables: TeacherArtifact[];
  activeStudent: Student;
  goal: string;
}

interface GeneratorProps {
  studentId: string;
  knowledgeId: string;
  knowledgeName: string;
  goal: string;
  runState: RunState;
  taskId: string | null;
  error: string | null;
  onStudentId: (value: string) => void;
  onKnowledgeId: (value: string) => void;
  onKnowledgeName: (value: string) => void;
  onGoal: (value: string) => void;
  onGenerate: () => void;
}

interface ReviewProps {
  reviews: ReviewItem[];
  artifactLibrary: TeacherArtifactLibrary;
  onOpen: (rationale: Rationale) => void;
}

interface InterventionProps {
  activeStudent: Student;
  onChooseStudent: (student: Student) => void;
  students: Student[];
}

type RuntimeNodeState = AgentState;

const RESOURCE_AGENT_NAMES = ['DocumentAgent', 'ExerciseAgent', 'VisualAgent', 'CodeAgent'] as const;

const RUNTIME_STATE_LABELS: Record<RuntimeNodeState, string> = {
  waiting: 'waiting',
  running: 'running',
  streaming: 'streaming',
  done: 'done',
  error: 'error',
};

// ─────────────────────────── 1. OVERVIEW PANEL ───────────────────────────
export function OverviewPanel({
  metrics,
  onChooseStudent,
  classes,
  students,
  activeClassId,
  onClassId,
  deliverables,
  activeStudent,
  goal,
}: OverviewProps) {
  const [hoveredData, setHoveredData] = useState<string | null>(null);

  const classOptions = classes.length ? classes : CLASSES;
  const studentRows = students.length ? students : STUDENTS;
  const filteredStudents = activeClassId
    ? studentRows.filter((student) => !student.class_id || student.class_id === activeClassId)
    : studentRows;
  const talentPlan = deliverables.find((item) => item.type === 'TalentPlan');
  const structuredTalentPlan = isStructuredTalentPlan(talentPlan) ? talentPlan : null;
  const courseDeliverables = deliverables.filter((item) => item.type !== 'TalentPlan');
  const transcript = buildDeliverableTranscript(deliverables, activeStudent, goal);

  return (
    <section className="teacher-studio-section">

      {/* ── Viz Studio shortcut banner ── */}
      <a
        href="/html/viz-studio.html"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '16px 22px',
          marginBottom: 16,
          borderRadius: 0,
          border: '1px solid var(--rule)',
          background: 'transparent',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'all 200ms ease',
          cursor: 'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-soft)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontFamily: 'var(--display)', fontSize: 34, lineHeight: 1 }}>V</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 400, fontSize: 24, color: 'var(--ink)', marginBottom: 3 }}>
            算法可视化演示工作室
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-mute)', lineHeight: 1.5 }}>
            链表 · 二叉树 · 排序 · 图算法。本地离线 Canvas 动画。
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            offline canvas
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-mute)' }}>
            打开演示工作室 ↗
          </span>
        </div>
      </a>

      <div className="mesh-metric-grid">
        {metrics.map((item) => (
          <div className="mesh-metric" key={item.label} style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #0070f3, #ff0080)' }} />
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="teacher-studio-grid-2">
        {/* Class mastery SVG chart card */}
        <section className="mesh-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <PanelHead title="Mastery analytics graph" eyebrow="/classes/chart" />
            <select 
              value={activeClassId} 
              onChange={(e) => onClassId(e.target.value)}
              style={selectStyle}
            >
              {classOptions.map((item) => (
                <option key={item.class_id} value={item.class_id}>{item.name}</option>
              ))}
            </select>
          </div>

          {/* SVG line chart */}
          <div style={chartContainerStyle} onMouseLeave={() => setHoveredData(null)}>
            <svg viewBox="0 0 400 160" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0070f3" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#0070f3" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* Grid Lines */}
              <line x1="20" y1="20" x2="380" y2="20" stroke="rgba(255,255,255,0.04)" strokeDasharray="3,3" />
              <line x1="20" y1="65" x2="380" y2="65" stroke="rgba(255,255,255,0.04)" strokeDasharray="3,3" />
              <line x1="20" y1="110" x2="380" y2="110" stroke="rgba(255,255,255,0.04)" strokeDasharray="3,3" />
              <line x1="20" y1="140" x2="380" y2="140" stroke="rgba(255,255,255,0.08)" />

              {/* Chart Line Path */}
              <path 
                d="M 20 120 Q 80 80 140 40 T 260 90 T 380 30" 
                fill="none" 
                stroke="#0070f3" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
              />
              <path 
                d="M 20 120 Q 80 80 140 40 T 260 90 T 380 30 L 380 140 L 20 140 Z" 
                fill="url(#chartGrad)" 
              />

              {/* Data points */}
              {[
                { cx: 20, cy: 120, label: 'Week 1: 40%' },
                { cx: 90, cy: 90, label: 'Week 2: 55%' },
                { cx: 160, cy: 45, label: 'Week 3: 82%' },
                { cx: 240, cy: 95, label: 'Week 4: 52%' },
                { cx: 310, cy: 60, label: 'Week 5: 75%' },
                { cx: 380, cy: 30, label: 'Week 6: 91%' },
              ].map((pt, idx) => (
                <circle 
                  key={idx} 
                  cx={pt.cx} 
                  cy={pt.cy} 
                  r={hoveredData === pt.label ? "6" : "4"} 
                  fill={hoveredData === pt.label ? "#ff0080" : "#0070f3"} 
                  style={{ cursor: 'pointer', transition: 'all 200ms ease' }}
                  onMouseEnter={() => setHoveredData(pt.label)}
                />
              ))}
            </svg>

            {hoveredData ? (
              <div style={tooltipStyle}>{hoveredData}</div>
            ) : (
              <div style={{ ...tooltipStyle, opacity: 0.5 }}>Hover nodes to trace progress</div>
            )}
          </div>

          <table className="mesh-table" style={{ marginTop: 24 }}>
            <thead>
              <tr>
                <th>班级</th>
                <th>学生数</th>
                <th>高风险</th>
                <th>闭环进度</th>
                <th>运行状态</th>
              </tr>
            </thead>
            <tbody>
              {classOptions.map((item) => (
                <tr key={item.class_id} style={{ transition: 'background 200ms ease' }}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.students}</td>
                  <td><span style={{ color: item.risk > 8 ? '#ff0080' : '#888' }}>{item.risk} 人</span></td>
                  <td><Progress value={item.progress} /></td>
                  <td><span className={item.risk > 8 ? 'mesh-status warn' : 'mesh-status'}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Risk Queue Selection Workspace */}
        <section className="mesh-panel">
          <PanelHead title="Attention Queue" eyebrow="/risk-queue" />
          <p style={{ color: 'var(--mesh-muted)', fontSize: 12.5, marginBottom: 16 }}>
            以下学生有高风险/短板预警。点击即可直接载入参数并开始生成专属学习资源。
          </p>
          <div className="teacher-studio-risk-list" style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
            {filteredStudents.map((student) => (
              <button key={student.id} className="teacher-studio-risk-row" onClick={() => onChooseStudent(student)}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong>{student.id}</strong>
                  <span style={{ fontSize: 11.5 }}>{student.focus}</span>
                </div>
                <div style={{ width: 100, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--mesh-dim)', alignSelf: 'flex-end' }}>掌握度 {student.mastery}%</span>
                  <Progress value={student.mastery} />
                </div>
                <em>{student.risk}</em>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="mesh-panel teacher-deliverable-stage">
        <PanelHead title="Talent development system" eyebrow="/talent-plan/composer" />
        <div className="teacher-deliverable-stage__lead">
          <p>
            这里不是几份单课资源，而是从新生入学到最终毕业的完整人培体系。
            老师先看四年路线图、前沿雷达和阶段评估，再往下拆到单课教案、PPT、教学大纲和重难点讲解。
          </p>
          <div className="teacher-deliverable-stage__stamp">
            <span>{activeStudent.id} · 当前学生锚点</span>
            <strong>新生入学 → 最终毕业</strong>
          </div>
        </div>

        {talentPlan && (
          <article className="teacher-talent-plan-hero">
            <div className="teacher-talent-plan-hero__head">
              <div>
                <span>{talentPlan.label}</span>
                <strong>{talentPlan.title}</strong>
              </div>
              <em>{talentPlan.status}</em>
            </div>
            <p>{talentPlan.summary}</p>
            <div className="teacher-talent-plan-hero__chips">
              {talentPlan.chips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
            <div className="teacher-talent-plan-hero__modules">
              {talentPlan.outline.map((item) => (
                <article key={item}>
                  <strong>{item}</strong>
                </article>
              ))}
            </div>
          </article>
        )}

        {structuredTalentPlan && <TalentPlanBoard artifact={structuredTalentPlan} mode="overview" />}

        <div className="teacher-deliverable-route">
          <article className="teacher-deliverable-node teacher-deliverable-node--origin">
            <span>Program intent</span>
            <strong>培养目标</strong>
            <p>{talentPlan?.sections[0]?.body ?? goal}</p>
          </article>

          <div className="teacher-deliverable-route__arrow" aria-hidden="true">→</div>

          <article className="teacher-deliverable-node teacher-deliverable-node--planner">
            <span>Program architect</span>
            <strong>四年路线与雷达编排</strong>
            <p>把入学适应、年度课程、工程项目、前沿雷达、创新探索与毕业出口串成一整套培养路径。</p>
          </article>

          <div className="teacher-deliverable-route__arrow" aria-hidden="true">→</div>

          <div className="teacher-deliverable-grid">
            {courseDeliverables.map((artifact) => (
              <article key={artifact.type} className="teacher-deliverable-card">
                <div className="teacher-deliverable-card__top">
                  <span>{artifact.label}</span>
                  <em>{artifact.status}</em>
                </div>
                <strong>{artifact.title}</strong>
                <p>{artifact.summary}</p>
                <div className="teacher-deliverable-card__list">
                  {artifact.outline.slice(0, 2).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="teacher-deliverable-stage__terminal">
          <div className="teacher-cinematic-terminal__bar">teacher-deliverables.log</div>
          <div className="teacher-cinematic-terminal__body">
            {transcript.map((entry) => (
              <TeacherLog key={`${entry.scope}-${entry.text}`} scope={entry.scope} text={entry.text} />
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}

// ─────────────────────────── 2. GENERATOR PANEL ───────────────────────────
export function GeneratorPanel(props: GeneratorProps) {
  const running = props.runState === 'submitting' || props.runState === 'running';
  const { trace, connected } = useAgentTraceSSE(props.taskId);
  const profileRow = getTraceRow(trace.agents, 'ProfileAgent');
  const plannerRow = getTraceRow(trace.agents, 'PlannerAgent');
  const resourceRows = RESOURCE_AGENT_NAMES.map((name) => getTraceRow(trace.agents, name));
  const evaluationRow = getTraceRow(trace.agents, 'EvaluationAgent');
  const orchestrationState = getOrchestrationState(props.runState, props.taskId, connected, trace.summary?.status);

  const buttonLabel = props.runState === 'submitting'
    ? 'Submitting…'
    : props.runState === 'running'
      ? '7 Agents Running…'
      : 'Generate bundle';

  return (
    <section className="teacher-studio-section teacher-studio-grid-2 teacher-studio-grid-heavy">
      {/* Parameter inputs */}
      <section className="mesh-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <PanelHead title="Resource parameter matrix" eyebrow="/api/teachers/.../teaching-packages" />
          <div className="teacher-studio-form-grid">
            <Field label="STUDENT_ID" value={props.studentId} onChange={props.onStudentId} />
            <Field label="KNOWLEDGE_ID" value={props.knowledgeId} onChange={props.onKnowledgeId} />
            <Field label="KNOWLEDGE_NAME" value={props.knowledgeName} onChange={props.onKnowledgeName} />
          </div>
          <label className="teacher-studio-label" style={{ marginTop: 14, display: 'block' }}>Teacher Direct Goal / Prompt Override</label>
          <textarea 
            className="teacher-studio-textarea" 
            value={props.goal} 
            onChange={(event) => props.onGoal(event.target.value)} 
          />
        </div>
        
        <div>
          <div className="teacher-studio-button-row">
            <button 
              className="mesh-primary-button" 
              disabled={running} 
              onClick={() => {
                props.onGenerate();
              }}
            >
              {buttonLabel}
            </button>
            <span className="mesh-mono" style={{ color: props.taskId ? '#0070f3' : 'var(--mesh-dim)' }}>
              {props.taskId ? `ACTIVE TASK: ${props.taskId}` : 'PIPELINE STANDBY'}
            </span>
          </div>
          {props.error && <div className="teacher-studio-error">{props.error}</div>}
        </div>
      </section>

      {/* Visual Live Agent Execution Monitor Tree */}
      <section className="mesh-panel">
        <PanelHead title="Live main-agent runtime monitor" eyebrow="/runtime/dag+sse" />
        
        <div className="teacher-runtime-summary">
          <span>{connected ? 'SSE connected' : props.taskId ? 'SSE waiting' : 'no task'}</span>
          <strong>{trace.summary ? `summary: ${trace.summary.status}` : props.taskId ?? 'standby'}</strong>
        </div>

        <div className="teacher-runtime-graph">
          <RuntimeNode
            label="Control"
            title="Orchestrator / GenerateFlow"
            body="API 主控层：绑定同一个 task_id，按真实执行流推送事件。"
            state={orchestrationState}
            detail={trace.summary ? `${(trace.summary.elapsedMs / 1000).toFixed(1)}s` : props.runState}
          />

          <div className="teacher-runtime-arrow">↓ profile evidence</div>

          <RuntimeNode
            label="Evidence Agent"
            title="ProfileAgent"
            body="读取学生快照或班级画像；老师目标只作为生成约束。"
            state={profileRow.state}
            detail={formatAgentDetail(profileRow, '等待画像输入')}
          />

          <div className="teacher-runtime-arrow">↓ main plan</div>

          <RuntimeNode
            label="Main Agent"
            title="PlannerAgent"
            body="生成 KnowledgeBreakdown，并决定哪些资源 Agent 并行。"
            state={plannerRow.state}
            detail={formatAgentDetail(plannerRow, '等待主 Agent 拆解')}
            featured
          />

          <div className="teacher-runtime-arrow">↓ dispatch workers</div>

          <div className="teacher-runtime-worker-grid">
            {resourceRows.map((row) => (
              <RuntimeNode
                key={row.name}
                label="Worker"
                title={row.name}
                body={workerBody(row.name)}
                state={row.state}
                detail={formatAgentDetail(row, '等待 PlannerAgent 派发')}
                compact
              />
            ))}
          </div>

          <div className="teacher-runtime-arrow">↓ closed loop</div>

          <RuntimeNode
            label="Feedback Agent"
            title="EvaluationAgent"
            body="汇总答题表现，输出画像更新建议和下一轮干预依据。"
            state={evaluationRow.state}
            detail={formatAgentDetail(evaluationRow, '等待资源与答题记录')}
          />
        </div>
      </section>
    </section>
  );
}

function RuntimeNode({
  label,
  title,
  body,
  state,
  detail,
  featured,
  compact,
}: {
  label: string;
  title: string;
  body: string;
  state: RuntimeNodeState;
  detail: string;
  featured?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`teacher-runtime-node is-${state}${featured ? ' is-featured' : ''}${compact ? ' is-compact' : ''}`}>
      <div className="teacher-runtime-node__top">
        <span>{label}</span>
        <i aria-hidden="true" />
      </div>
      <strong>{title}</strong>
      <p>{body}</p>
      <small>{RUNTIME_STATE_LABELS[state]} · {detail}</small>
    </div>
  );
}

function getTraceRow(agents: Record<string, AgentRow>, name: string): AgentRow {
  return agents[name] ?? {
    name,
    state: 'waiting',
    elapsedMs: 0,
    tokenUsed: 0,
  };
}

function getOrchestrationState(
  runState: RunState,
  taskId: string | null,
  connected: boolean,
  summaryStatus?: string,
): RuntimeNodeState {
  if (summaryStatus === 'error') return 'error';
  if (summaryStatus === 'ok' || summaryStatus === 'partial') return 'done';
  if (runState === 'error') return 'error';
  if (runState === 'done') return 'done';
  if (runState === 'running') return connected ? 'streaming' : 'running';
  if (runState === 'submitting') return 'running';
  if (taskId) return connected ? 'streaming' : 'running';
  return 'waiting';
}

function formatAgentDetail(row: AgentRow, fallback: string): string {
  if (row.error) return row.error;
  if (row.latestDelta) return row.latestDelta;
  const parts = [];
  if (row.elapsedMs > 0) parts.push(`${(row.elapsedMs / 1000).toFixed(1)}s`);
  if (row.tokenUsed > 0) parts.push(`${row.tokenUsed} token`);
  if (row.promptVersion) parts.push(`prompt ${row.promptVersion}`);
  return parts.join(' · ') || fallback;
}

function workerBody(name: string): string {
  switch (name) {
    case 'DocumentAgent':
      return '生成讲解文档，并写入可解释 rationale。';
    case 'ExerciseAgent':
      return '生成自适应题目，按短板调整训练目标。';
    case 'VisualAgent':
      return '生成思维导图与步骤动画数据。';
    case 'CodeAgent':
      return '在讲解完成后输出 Python / Java 双语代码案例。';
    default:
      return '等待主 Agent 派发资源生成任务。';
  }
}

// ─────────────────────────── 3. REVIEW PANEL ───────────────────────────
export function ReviewPanel({ reviews, artifactLibrary, onOpen }: ReviewProps) {
  const [selectedReviewId, setSelectedReviewId] = useState<string>(reviews[0]?.id || '');
  const [exportMessage, setExportMessage] = useState<string>('');

  useEffect(() => {
    if (!reviews.length && selectedReviewId) {
      setSelectedReviewId('');
      return;
    }
    if (reviews.length && !reviews.some((item) => item.id === selectedReviewId)) {
      setSelectedReviewId(reviews[0]?.id ?? '');
    }
  }, [reviews, selectedReviewId]);

  const activeReview = reviews.find((item) => item.id === selectedReviewId) || reviews[0];
  const activeArtifact = activeReview
    ? artifactLibrary[activeReview.type as TeacherArtifactType] ?? buildFallbackArtifact(activeReview)
    : null;
  const activeTalentPlan = isStructuredTalentPlan(activeArtifact) ? activeArtifact : null;

  const copyMarkdown = async () => {
    if (!activeArtifact) return;
    try {
      await navigator.clipboard.writeText(activeArtifact.markdown);
      setExportMessage('Markdown 已复制');
    } catch {
      setExportMessage('当前环境不支持自动复制');
    }
  };

  const downloadMarkdown = () => {
    if (!activeArtifact) return;
    const blob = new Blob([activeArtifact.markdown], { type: 'text/markdown;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = toMarkdownFilename(activeArtifact.title);
    link.click();
    URL.revokeObjectURL(href);
    setExportMessage('讲稿已下载');
  };

  return (
    <section className="teacher-studio-section">
      <div className="teacher-studio-section-head" style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: '"Outfit", sans-serif' }}>Review generated resources by evidence, not vibes.</h2>
        <span className="mesh-mono">/workspace/reviews</span>
      </div>

      <div className="teacher-review-workspace">
        {/* Left Side: Review Item Workspace Selector */}
        <div className="teacher-review-workspace__left">
          {reviews.map((item) => (
            <button 
              key={item.id} 
              className={selectedReviewId === item.id ? 'teacher-review-row is-active' : 'teacher-review-row'}
              onClick={() => setSelectedReviewId(item.id)}
            >
              <div className="teacher-review-row__top">
                <span style={workspaceRowMetaStyle}>{item.type} · {item.agent}</span>
                <span className={item.status === 'ready' ? 'teacher-review-row__dot is-ready' : 'teacher-review-row__dot'} />
              </div>
              <strong style={workspaceRowTitleStyle}>{item.title}</strong>
              <p style={workspaceRowReasonStyle}>{(artifactLibrary[item.type as TeacherArtifactType]?.summary) ?? item.reason}</p>
              <small className="teacher-review-row__hint">
                {(artifactLibrary[item.type as TeacherArtifactType]?.outline[0]) ?? item.reason}
              </small>
            </button>
          ))}
        </div>

        {/* Right Side: Split Pre-compiled Review Workspace */}
        {activeReview && activeArtifact && (
          <div className="teacher-review-sheet">
            <div className="teacher-review-sheet__header">
              <div>
                <span style={workspaceRowMetaStyle}>{activeReview.type} · {activeReview.agent}</span>
                <h3 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, fontFamily: '"Outfit", sans-serif' }}>
                  {activeReview.title}
                </h3>
              </div>
              <div className="teacher-review-sheet__toolbar">
                <button className="mesh-ghost-button" onClick={copyMarkdown} style={{ minHeight: 30, padding: '0 12px', fontSize: 12 }}>
                  复制 Markdown
                </button>
                <button className="mesh-ghost-button" onClick={downloadMarkdown} style={{ minHeight: 30, padding: '0 12px', fontSize: 12 }}>
                  下载讲稿
                </button>
                <button
                  className="mesh-ghost-button"
                  onClick={() => onOpen(activeReview.rationale)}
                  style={{ minHeight: 30, padding: '0 12px', fontSize: 12 }}
                >
                  Trace rationale fingerprint
                </button>
              </div>
            </div>

            <div className="teacher-review-sheet__body">
              <div className="teacher-review-meta-grid">
                <div>
                  <span style={previewMetaLabelStyle}>Student ID</span>
                  <div style={previewMetaValueStyle}>{activeReview.student ?? 'class-level'}</div>
                </div>
                <div>
                  <span style={previewMetaLabelStyle}>Approval Queue</span>
                  <div style={previewMetaValueStyle}>{activeReview.status.toUpperCase()}</div>
                </div>
                <div>
                  <span style={previewMetaLabelStyle}>Primary Agent</span>
                  <div style={previewMetaValueStyle}>{activeArtifact.agent}</div>
                </div>
              </div>

              {activeArtifact.chips.length > 0 && (
                <div className="teacher-review-chip-row">
                  {activeArtifact.chips.map((chip) => (
                    <span key={chip} className="teacher-review-chip">{chip}</span>
                  ))}
                </div>
              )}

              <div className="teacher-review-outline">
                <span style={previewMetaLabelStyle}>Quick Outline</span>
                <div className="teacher-review-outline__list">
                  {activeArtifact.outline.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>

              {activeArtifact.links.length > 0 && (
                <div className="teacher-review-link-grid">
                  {activeArtifact.links.map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="teacher-review-link">
                      <strong>{link.title}</strong>
                      <span>{link.meta}</span>
                    </a>
                  ))}
                </div>
              )}

              <div className="teacher-review-summary">
                <h4 style={{ margin: 0, fontSize: 14 }}>Teacher Preview</h4>
                <p>{activeArtifact.summary}</p>
              </div>

              {activeTalentPlan ? (
                <>
                  <TalentPlanBoard artifact={activeTalentPlan} mode="review" />
                  <div className="teacher-review-plan-digest">
                    {activeArtifact.sections.map((section) => (
                      <article key={section.heading} className="teacher-review-section teacher-review-section--digest">
                        <span>{section.heading}</span>
                        <div>{summarizeSection(section.body, 4)}</div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="teacher-review-section-grid">
                  {activeArtifact.sections.map((section) => (
                    <article key={section.heading} className="teacher-review-section">
                      <span>{section.heading}</span>
                      <div>{section.body}</div>
                    </article>
                  ))}
                </div>
              )}

              <div style={previewActionsStyle}>
                <button className="mesh-ghost-button" style={{ flex: 1 }}>Reject / Re-simulate</button>
                <button className="mesh-primary-button" style={{ flex: 1 }}>Approve & Deploy to student</button>
              </div>

              {exportMessage && <div className="teacher-review-export-note">{exportMessage}</div>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────── 4. INTERVENTION PANEL ───────────────────────────
export function InterventionPanel({ activeStudent, onChooseStudent, students }: InterventionProps) {
  const [closedLoopActiveStep, setClosedLoopActiveStep] = useState<number>(0);

  // Auto trigger a closed-loop flow visualization
  useEffect(() => {
    const timer = setInterval(() => {
      setClosedLoopActiveStep(prev => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="teacher-studio-section teacher-studio-grid-2">
      <section className="mesh-panel">
        <PanelHead title="Interventions workspace" eyebrow="/interventions" />
        <table className="mesh-table">
          <thead>
            <tr>
              <th>学生</th>
              <th>短板证据</th>
              <th>推荐建议动作</th>
              <th>触发操作</th>
            </tr>
          </thead>
          <tbody>
            {(students.length ? students : STUDENTS).map((student) => (
              <tr key={student.id}>
                <td><strong>{student.id}</strong></td>
                <td>{student.evidence}</td>
                <td>{student.action}</td>
                <td>
                  <button className="mesh-ghost-button" onClick={() => onChooseStudent(student)}>
                    Generate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mesh-panel">
        <PanelHead title="Closed loop monitor" eyebrow="/loop/monitoring" />
        <div className="teacher-studio-loop-stack" style={{ position: 'relative' }}>
          <LoopCard 
            label="01 / risk signal" 
            title={`${activeStudent.id} · ${activeStudent.focus}`} 
            body={activeStudent.evidence} 
            active={closedLoopActiveStep === 0}
          />
          <div style={{ ...workflowArrowDownStyle, margin: '2px 0' }}>↓</div>
          <LoopCard 
            label="02 / teacher action" 
            title={activeStudent.action} 
            body="老师确认后触发资源生成，审核通过后回流学生端。" 
            active={closedLoopActiveStep === 1}
          />
          <div style={{ ...workflowArrowDownStyle, margin: '2px 0' }}>↓</div>
          <LoopCard 
            label="03 / profile update" 
            title="EvaluationAgent 更新画像" 
            body="答题表现、资源反馈与老师干预记录进入下一轮推荐依据。" 
            active={closedLoopActiveStep === 2}
          />
        </div>
      </section>
    </section>
  );
}

// ─────────────────────────── HELPERS ───────────────────────────
export function TeacherLog({ scope, text }: { scope: string; text: string }) {
  return <div className="mesh-log-line"><strong>{scope}</strong><span><span className="mesh-log-ok">✓</span> {text}</span></div>;
}

function TalentPlanBoard({
  artifact,
  mode,
}: {
  artifact: TeacherArtifact & { presentation: TalentPlanBlueprint };
  mode: 'overview' | 'review';
}) {
  const plan = artifact.presentation;
  const radarTopics = mode === 'overview' ? plan.radar.topics.slice(0, 4) : plan.radar.topics;

  return (
    <div className={mode === 'overview' ? 'teacher-talent-board' : 'teacher-talent-board teacher-talent-board--review'}>
      <section className="teacher-talent-board__panel teacher-talent-board__panel--summary">
        <div className="teacher-talent-board__panel-head">
          <span>Graduation profile</span>
          <strong>{plan.direction}</strong>
        </div>
        <p>{plan.vision}</p>
        <div className="teacher-talent-board__chip-grid">
          {plan.graduationProfile.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </section>

      <section className="teacher-talent-board__panel teacher-talent-board__panel--roadmap">
        <div className="teacher-talent-board__panel-head">
          <span>Semester matrix</span>
          <strong>八学期 + 入学建档</strong>
        </div>
        <div className="teacher-talent-board__semester-grid">
          {plan.semesterPlan.map((semester) => (
            <article key={semester.id} className="teacher-semester-card">
              <div className="teacher-semester-card__meta">
                <span>{semester.stage}</span>
                <em>{semester.label}</em>
              </div>
              <strong>{semester.theme}</strong>
              <p>{semester.target}</p>
              <div className="teacher-semester-card__tags">
                {semester.courses.slice(0, mode === 'overview' ? 2 : 3).map((course) => (
                  <span key={course}>{course}</span>
                ))}
              </div>
              <div className="teacher-semester-card__facts">
                <div>
                  <span>工程训练</span>
                  <p>{semester.engineering.slice(0, mode === 'overview' ? 2 : 3).join('；')}</p>
                </div>
                <div>
                  <span>AI / 前沿</span>
                  <p>{semester.frontier.slice(0, mode === 'overview' ? 1 : 2).join('；')}</p>
                </div>
                <div>
                  <span>产出物</span>
                  <p>{semester.output}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="teacher-talent-board__panel teacher-talent-board__panel--lanes">
        <div className="teacher-talent-board__panel-head">
          <span>Continuous lanes</span>
          <strong>贯穿主线</strong>
        </div>
        <div className="teacher-talent-board__lane-grid">
          {plan.continuousLanes.map((lane) => (
            <article key={lane.title} className="teacher-lane-card">
              <div className="teacher-lane-card__meta">
                <span>{lane.label}</span>
                <strong>{lane.title}</strong>
              </div>
              <div className="teacher-lane-card__list">
                {lane.items.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="teacher-talent-board__panel teacher-talent-board__panel--radar">
        <div className="teacher-talent-board__panel-head">
          <span>Frontier radar</span>
          <strong>{plan.radar.cadence}</strong>
        </div>
        <div className="teacher-talent-board__radar-meta">
          {plan.radar.sourceBuckets.map((bucket) => (
            <span key={bucket}>{bucket}</span>
          ))}
        </div>
        <div className="teacher-talent-board__radar-flow">
          {plan.radar.process.map((step) => (
            <article key={step}>
              <strong>{step}</strong>
            </article>
          ))}
        </div>
        <div className="teacher-talent-board__radar-grid">
          {radarTopics.map((topic) => (
            <article key={`${topic.date}-${topic.title}`} className="teacher-radar-card">
              <div className="teacher-radar-card__meta">
                <span>{topic.date}</span>
                <em>{topic.source}</em>
              </div>
              <strong>{topic.title}</strong>
              <p>{topic.signal}</p>
              <div className="teacher-radar-card__actions">
                <div>
                  <span>课堂动作</span>
                  <p>{topic.classroomAction}</p>
                </div>
                <div>
                  <span>项目映射</span>
                  <p>{topic.projectMapping}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="teacher-talent-board__panel teacher-talent-board__panel--assessment">
        <div className="teacher-talent-board__panel-head">
          <span>Assessment & portfolio</span>
          <strong>评估与作品集</strong>
        </div>
        <div className="teacher-talent-board__assessment-grid">
          <article>
            <span>维度</span>
            <p>{plan.assessment.dimensions.join('、')}</p>
          </article>
          <article>
            <span>检查点</span>
            <p>{plan.assessment.checkpoints.join('；')}</p>
          </article>
          <article>
            <span>作品集清单</span>
            <p>{plan.assessment.portfolio.join('；')}</p>
          </article>
        </div>
        <div className="teacher-talent-board__innovation">
          <article>
            <span>项目阶梯</span>
            <p>{plan.innovation.ladders.join('；')}</p>
          </article>
          <article>
            <span>创新场域</span>
            <p>{plan.innovation.arenas.join('；')}</p>
          </article>
          <article>
            <span>教师角色</span>
            <p>{plan.innovation.teacherRole.join('；')}</p>
          </article>
        </div>
      </section>

      <section className="teacher-talent-board__panel teacher-talent-board__panel--exit">
        <div className="teacher-talent-board__panel-head">
          <span>Exit pathways</span>
          <strong>毕业出口</strong>
        </div>
        <div className="teacher-talent-board__exit-grid">
          {plan.exits.map((exit) => (
            <article key={exit.title} className="teacher-exit-card">
              <div className="teacher-exit-card__meta">
                <span>{exit.title}</span>
                <em>{exit.fit}</em>
              </div>
              <div className="teacher-exit-card__block">
                <strong>关键动作</strong>
                <p>{exit.milestones.join('；')}</p>
              </div>
              <div className="teacher-exit-card__block">
                <strong>成果物</strong>
                <p>{exit.deliverables.join('；')}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PanelHead({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <div className="teacher-studio-panel-head" style={{ border: 'none', padding: 0, margin: 0 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: '"Outfit", sans-serif' }}>{title}</h2>
      <span className="mesh-mono" style={{ fontSize: 11, color: 'var(--mesh-dim)' }}>{eyebrow}</span>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="teacher-studio-field">
      <span>{label}</span>
      <input className="teacher-studio-input" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function LoopCard({ label, title, body, active }: { label: string; title: string; body: string; active?: boolean }) {
  return (
    <div className="teacher-studio-loop-card" style={{
      borderColor: active ? '#ff0080' : 'rgba(255,255,255,0.06)',
      background: active ? 'rgba(255, 0, 128, 0.03)' : 'rgba(255,255,255,0.015)',
      boxShadow: active ? '0 0 12px rgba(255,0,128,0.12)' : 'none',
      transition: 'all 300ms ease'
    }}>
      <span className="mesh-mono" style={{ color: active ? '#ff0080' : 'var(--mesh-dim)' }}>{label}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return <div className="mesh-progress"><span style={{ '--value': `${value}%` } as CSSProperties} /></div>;
}

function buildDeliverableTranscript(deliverables: TeacherArtifact[], activeStudent: Student, goal: string) {
  const talentPlan = deliverables.find((item) => item.type === 'TalentPlan');
  const lessonPlan = deliverables.find((item) => item.type === 'LessonPlan');
  const slideDeck = deliverables.find((item) => item.type === 'SlideDeck');
  const syllabus = deliverables.find((item) => item.type === 'Syllabus');
  const keyFocus = deliverables.find((item) => item.type === 'KeyFocus');
  const radarSection = talentPlan?.sections.find((section) => section.heading === '前沿雷达运行机制');
  const structuredTalentPlan = isStructuredTalentPlan(talentPlan) ? talentPlan : null;
  const firstSemester = structuredTalentPlan?.presentation.semesterPlan[0];
  const firstRadarTopic = structuredTalentPlan?.presentation.radar.topics[0];

  return [
    { scope: 'goal', text: `${activeStudent.id} -> ${goal}` },
    { scope: 'program', text: firstSemester ? `${firstSemester.label} / ${firstSemester.theme} 已装入四年主线。` : talentPlan?.outline[0] ?? '人培总纲已装载，先看培养定位与阶段主线。' },
    { scope: 'radar', text: firstRadarTopic ? `${firstRadarTopic.source} ${firstRadarTopic.date} -> ${firstRadarTopic.title}` : radarSection?.body.split('\n')[0] ?? '前沿资讯雷达已接入培养体系。' },
    { scope: 'plan', text: lessonPlan?.outline[0] ?? '课堂流程已预排，等待正式资源覆盖。' },
    { scope: 'slides', text: slideDeck?.outline[2] ?? 'PPT 页稿会围绕问题引入、讲解和检测展开。' },
    { scope: 'syllabus', text: syllabus?.sections[2]?.body.split('\n')[0] ?? '教学大纲已把知识主线与课堂产出整理完毕。' },
    { scope: 'focus', text: keyFocus?.sections[1]?.body.split('\n')[0] ?? activeStudent.focus },
    { scope: 'handoff', text: 'program plan + course deliverables queued for review workspace' },
  ];
}

function isStructuredTalentPlan(
  artifact: TeacherArtifact | null | undefined,
): artifact is TeacherArtifact & { presentation: TalentPlanBlueprint } {
  return Boolean(artifact?.type === 'TalentPlan' && artifact.presentation?.kind === 'talent-plan');
}

function summarizeSection(text: string, maxLines: number): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n');
}

function buildFallbackArtifact(review: ReviewItem): TeacherArtifact {
  const rationale = review.rationale as Rationale;
  const summary = review.reason || '这份资源已进入老师审核队列。';
  const markdown = `# ${review.title}\n\n> ${summary}\n\n## 审核说明\n${summary}\n`;

  return {
    id: review.id,
    type: review.type as TeacherArtifactType,
    family: 'asset',
    title: review.title,
    label: review.type,
    summary,
    agent: review.agent,
    student: review.student,
    status: review.status,
    reason: review.reason,
    chips: [review.status, review.agent],
    outline: [review.reason],
    sections: [
      {
        heading: '审核说明',
        body: summary,
      },
    ],
    links: [],
    markdown,
    rationale,
  };
}

function toMarkdownFilename(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'teacher-review'}.md`;
}

// ─────────────────────────── STYLES OBJECTS ───────────────────────────
const selectStyle: CSSProperties = {
  background: 'rgba(6, 6, 6, 0.8)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#fff',
  padding: '4px 10px',
  fontFamily: '"Outfit", sans-serif',
  fontSize: 12,
  outline: 'none',
  cursor: 'pointer'
};

const chartContainerStyle: CSSProperties = {
  height: 160,
  position: 'relative',
  border: '1px solid rgba(255,255,255,0.04)',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.005)',
  padding: '12px 18px',
  marginTop: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const tooltipStyle: CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 14,
  padding: '3px 8px',
  borderRadius: '4px',
  background: 'rgba(6,6,6,0.9)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  fontFamily: '"Geist Mono", monospace',
  fontSize: 10,
  transition: 'all 200ms ease'
};

const workflowArrowDownStyle: CSSProperties = {
  fontFamily: '"Geist Mono", monospace',
  color: 'rgba(255,255,255,0.15)',
  fontSize: 12,
};

const workspaceRowMetaStyle: CSSProperties = {
  fontSize: 9.5,
  fontFamily: '"Geist Mono", monospace',
  color: 'var(--mesh-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const workspaceRowTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 650,
  color: '#f4f4f5'
};

const workspaceRowReasonStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--mesh-muted)',
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis'
};

const previewMetaLabelStyle: CSSProperties = {
  fontSize: 9.5,
  fontFamily: '"Geist Mono", monospace',
  color: 'var(--mesh-dim)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const previewMetaValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#f4f4f5',
  marginTop: 2
};

const previewActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
};
