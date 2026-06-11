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
  onOpenTalentSystem: (type: TeacherArtifactType) => void;
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
  selectedType?: TeacherArtifactType;
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

const TALENT_SYSTEM_TABS: Array<{ type: TeacherArtifactType; label: string; caption: string }> = [
  { type: 'TalentPlan', label: '总览', caption: '主线' },
  { type: 'Syllabus', label: '大纲', caption: '知识线' },
  { type: 'LessonPlan', label: '教案', caption: '课堂线' },
  { type: 'SlideDeck', label: 'PPT', caption: '页稿线' },
  { type: 'KeyFocus', label: '重难点', caption: '讲法线' },
];
const TALENT_SYSTEM_TYPES: TeacherArtifactType[] = TALENT_SYSTEM_TABS.map((tab) => tab.type);
const TALENT_SYSTEM_REVIEW_ID = 'talent-system';

// ─────────────────────────── 1. OVERVIEW PANEL ───────────────────────────
export function OverviewPanel({
  metrics,
  onChooseStudent,
  onOpenTalentSystem,
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
  const talentSystemModules = TALENT_SYSTEM_TABS.flatMap((tab) => {
    const artifact = deliverables.find((item) => item.type === tab.type);
    return artifact ? [{ ...tab, artifact }] : [];
  });
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
          <div className="teacher-deliverable-stage__stamp">
            <span>{activeStudent.id}</span>
            <strong>人培方案体系</strong>
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
            <p>{compactText(talentPlan.summary, 22)}</p>
            <div className="teacher-talent-plan-hero__chips">
              {talentPlan.chips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
            <div className="teacher-talent-plan-hero__modules">
              {talentPlan.outline.slice(0, 4).map((item) => (
                <article key={item}>
                  <strong>{item}</strong>
                </article>
              ))}
            </div>
          </article>
        )}

        <div className="teacher-deliverable-route">
          <article className="teacher-deliverable-node teacher-deliverable-node--origin">
            <span>Program intent</span>
            <strong>目标</strong>
            <p>{compactText(summarizeSection(talentPlan?.sections[0]?.body ?? goal, 1), 20)}</p>
          </article>

          <div className="teacher-deliverable-route__arrow" aria-hidden="true">→</div>

          <article className="teacher-deliverable-node teacher-deliverable-node--planner">
            <span>Program architect</span>
            <strong>主线</strong>
            <p>路线 · 雷达 · 出口</p>
          </article>

          <div className="teacher-deliverable-route__arrow" aria-hidden="true">→</div>

          <section className="teacher-talent-system-entry">
            <button
              type="button"
              className="teacher-talent-system-entry__overview"
              onClick={() => onOpenTalentSystem('TalentPlan')}
            >
              <div className="teacher-talent-system-entry__head">
                <div>
                  <span>Program system</span>
                  <strong>人培方案体系</strong>
                </div>
                <em>进入审核</em>
              </div>
              <p>{compactText(talentPlan?.summary ?? goal, 28)}</p>
            </button>

            <div className="teacher-talent-system-entry__modules">
              {talentSystemModules.map(({ type, label, caption, artifact }) => (
                <button
                  key={type}
                  type="button"
                  className="teacher-talent-system-entry__module"
                  onClick={() => onOpenTalentSystem(type)}
                >
                  <div>
                    <span>{label}</span>
                    <strong>{artifact.label}</strong>
                  </div>
                  <em>{caption}</em>
                </button>
              ))}
            </div>
          </section>
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
            body="task_id / SSE"
            state={orchestrationState}
            detail={trace.summary ? `${(trace.summary.elapsedMs / 1000).toFixed(1)}s` : props.runState}
          />

          <div className="teacher-runtime-arrow">↓ profile evidence</div>

          <RuntimeNode
            label="Evidence Agent"
            title="ProfileAgent"
            body="画像输入"
            state={profileRow.state}
            detail={formatAgentDetail(profileRow, '等待输入')}
          />

          <div className="teacher-runtime-arrow">↓ main plan</div>

          <RuntimeNode
            label="Main Agent"
            title="PlannerAgent"
            body="任务拆解"
            state={plannerRow.state}
            detail={formatAgentDetail(plannerRow, '待拆解')}
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
            body="结果回写"
            state={evaluationRow.state}
            detail={formatAgentDetail(evaluationRow, '待回写')}
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
      return '讲解卡';
    case 'ExerciseAgent':
      return '题目卡';
    case 'VisualAgent':
      return '图解卡';
    case 'CodeAgent':
      return '代码卡';
    default:
      return '待派发';
  }
}

// ─────────────────────────── 3. REVIEW PANEL ───────────────────────────
export function ReviewPanel({ reviews, artifactLibrary, onOpen, selectedType }: ReviewProps) {
  const [selectedReviewId, setSelectedReviewId] = useState<string>(reviews[0]?.id || '');
  const [selectedTalentType, setSelectedTalentType] = useState<TeacherArtifactType>('TalentPlan');
  const [exportMessage, setExportMessage] = useState<string>('');
  const talentSystemReviews = reviews.filter((item) => TALENT_SYSTEM_TYPES.includes(item.type as TeacherArtifactType));
  const otherReviews = reviews.filter((item) => !TALENT_SYSTEM_TYPES.includes(item.type as TeacherArtifactType));
  const hasTalentSystem = talentSystemReviews.length > 0;
  const availableTalentTabs = TALENT_SYSTEM_TABS.filter((tab) => artifactLibrary[tab.type]);
  const activeTalentType = availableTalentTabs.some((tab) => tab.type === selectedTalentType)
    ? selectedTalentType
    : availableTalentTabs[0]?.type ?? 'TalentPlan';

  useEffect(() => {
    if (!reviews.length && selectedReviewId) {
      setSelectedReviewId('');
      return;
    }
    const isTalentSelection = talentSystemReviews.some((item) => item.id === selectedReviewId);
    if (hasTalentSystem && (!selectedReviewId || isTalentSelection)) {
      if (selectedReviewId !== TALENT_SYSTEM_REVIEW_ID) {
        setSelectedReviewId(TALENT_SYSTEM_REVIEW_ID);
      }
      return;
    }
    if (reviews.length && !reviews.some((item) => item.id === selectedReviewId)) {
      setSelectedReviewId(hasTalentSystem ? TALENT_SYSTEM_REVIEW_ID : reviews[0]?.id ?? '');
    }
  }, [hasTalentSystem, reviews, selectedReviewId, talentSystemReviews]);

  useEffect(() => {
    if (!selectedType) return;
    if (TALENT_SYSTEM_TYPES.includes(selectedType)) {
      setSelectedTalentType(selectedType);
      if (selectedReviewId !== TALENT_SYSTEM_REVIEW_ID) {
        setSelectedReviewId(TALENT_SYSTEM_REVIEW_ID);
      }
      return;
    }
    const matched = reviews.find((item) => item.type === selectedType);
    if (matched && matched.id !== selectedReviewId) {
      setSelectedReviewId(matched.id);
    }
  }, [reviews, selectedReviewId, selectedType]);

  useEffect(() => {
    if (!hasTalentSystem) return;
    if (activeTalentType !== selectedTalentType) {
      setSelectedTalentType(activeTalentType);
    }
  }, [activeTalentType, hasTalentSystem, selectedTalentType]);

  const activeReview = selectedReviewId === TALENT_SYSTEM_REVIEW_ID
    ? talentSystemReviews.find((item) => item.type === activeTalentType) ?? talentSystemReviews[0]
    : reviews.find((item) => item.id === selectedReviewId) || (hasTalentSystem ? talentSystemReviews[0] : reviews[0]);
  const activeArtifact = activeReview
    ? artifactLibrary[activeReview.type as TeacherArtifactType] ?? buildFallbackArtifact(activeReview)
    : null;
  const activeTalentPlan = isStructuredTalentPlan(activeArtifact) ? activeArtifact : null;
  const talentPlanArtifact = artifactLibrary.TalentPlan;
  const talentSystemActive = selectedReviewId === TALENT_SYSTEM_REVIEW_ID && Boolean(activeReview);

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
        <h2 style={{ fontFamily: '"Outfit", sans-serif' }}>Review</h2>
        <span className="mesh-mono">/workspace/reviews</span>
      </div>

      <div className="teacher-review-workspace">
        {/* Left Side: Review Item Workspace Selector */}
        <div className="teacher-review-workspace__left">
          {hasTalentSystem && (
            <button
              type="button"
              className={selectedReviewId === TALENT_SYSTEM_REVIEW_ID ? 'teacher-review-row is-active' : 'teacher-review-row'}
              onClick={() => {
                setSelectedReviewId(TALENT_SYSTEM_REVIEW_ID);
                setSelectedTalentType(activeTalentType);
              }}
            >
              <div className="teacher-review-row__top">
                <span style={workspaceRowMetaStyle}>TalentSystem · {availableTalentTabs.length} modules</span>
                <span className="teacher-review-row__dot is-ready" />
              </div>
              <strong style={workspaceRowTitleStyle}>人培方案体系</strong>
              <p style={workspaceRowReasonStyle}>{compactText(talentPlanArtifact?.summary ?? '统一管理培养主线与教学产物。', 28)}</p>
              <small className="teacher-review-row__hint">
                {availableTalentTabs.map((tab) => tab.label).join(' / ')}
              </small>
            </button>
          )}

          {otherReviews.map((item) => (
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
              <p style={workspaceRowReasonStyle}>{compactText((artifactLibrary[item.type as TeacherArtifactType]?.summary) ?? item.reason, 28)}</p>
              <small className="teacher-review-row__hint">
                {compactText((artifactLibrary[item.type as TeacherArtifactType]?.outline[0]) ?? item.reason, 22)}
              </small>
            </button>
          ))}
        </div>

        {/* Right Side: Split Pre-compiled Review Workspace */}
        {activeReview && activeArtifact && (
          <div className="teacher-review-sheet">
            <div className="teacher-review-sheet__header">
              <div>
                <span style={workspaceRowMetaStyle}>
                  {talentSystemActive ? `TalentSystem · ${activeReview.agent}` : `${activeReview.type} · ${activeReview.agent}`}
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, fontFamily: '"Outfit", sans-serif' }}>
                  {talentSystemActive ? '人培方案体系' : activeReview.title}
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
                  Trace
                </button>
              </div>
            </div>

            <div className="teacher-review-sheet__body">
              {talentSystemActive && availableTalentTabs.length > 0 && (
                <div className="teacher-talent-system-tabs" role="tablist" aria-label="人培方案体系">
                  {availableTalentTabs.map((tab) => (
                    <button
                      key={tab.type}
                      type="button"
                      className={activeTalentType === tab.type ? 'teacher-talent-system-tab is-active' : 'teacher-talent-system-tab'}
                      onClick={() => setSelectedTalentType(tab.type)}
                    >
                      <strong>{tab.label}</strong>
                      <span>{tab.caption}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="teacher-review-meta-grid">
                <div>
                  <span style={previewMetaLabelStyle}>{talentSystemActive ? 'System Scope' : 'Student ID'}</span>
                  <div style={previewMetaValueStyle}>{talentSystemActive ? '人培方案体系' : activeReview.student ?? 'class-level'}</div>
                </div>
                <div>
                  <span style={previewMetaLabelStyle}>{talentSystemActive ? 'Current Module' : 'Approval Queue'}</span>
                  <div style={previewMetaValueStyle}>
                    {talentSystemActive
                      ? availableTalentTabs.find((tab) => tab.type === activeTalentType)?.label ?? activeReview.type
                      : activeReview.status.toUpperCase()}
                  </div>
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
                  {activeArtifact.outline.slice(0, 3).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>

              {activeArtifact.links.length > 0 && (
                <div className="teacher-review-link-grid">
                  {activeArtifact.links.slice(0, 2).map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="teacher-review-link">
                      <strong>{link.title}</strong>
                      <span>{link.meta}</span>
                    </a>
                  ))}
                </div>
              )}

              <div className="teacher-review-summary">
                <h4 style={{ margin: 0, fontSize: 14 }}>摘要</h4>
                <p>{compactText(activeArtifact.summary, 20)}</p>
              </div>

              {activeTalentPlan ? (
                <>
                  <TalentPlanBoard artifact={activeTalentPlan} mode="overview" />
                  <div className="teacher-review-plan-digest">
                    {activeArtifact.sections.slice(0, 3).map((section) => (
                      <article key={section.heading} className="teacher-review-section teacher-review-section--digest">
                        <span>{section.heading}</span>
                        <div>{summarizeSection(section.body, 1)}</div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="teacher-review-section-grid">
                  {activeArtifact.sections.slice(0, 3).map((section) => (
                    <article key={section.heading} className="teacher-review-section">
                      <span>{section.heading}</span>
                      <div>{summarizeSection(section.body, 1)}</div>
                    </article>
                  ))}
                </div>
              )}

              <div style={previewActionsStyle}>
                <button className="mesh-ghost-button" style={{ flex: 1 }}>重跑</button>
                <button className="mesh-primary-button" style={{ flex: 1 }}>通过</button>
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
            body="确认后生成"
            active={closedLoopActiveStep === 1}
          />
          <div style={{ ...workflowArrowDownStyle, margin: '2px 0' }}>↓</div>
          <LoopCard 
            label="03 / profile update" 
            title="EvaluationAgent 更新画像" 
            body="结果回写画像"
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
  const radarTopics = mode === 'overview' ? plan.radar.topics.slice(0, 3) : plan.radar.topics.slice(0, 4);
  const cockpitMetrics = [
    { value: String(plan.semesterPlan.length), label: '阶段节点' },
    { value: String(plan.continuousLanes.length), label: '贯穿主线' },
    { value: String(plan.radar.topics.length), label: '雷达样本' },
    { value: String(plan.exits.length), label: '毕业出口' },
  ];
  const overviewPhases = buildOverviewPhaseCards(plan).slice(0, 2);
  const overviewLanes = plan.continuousLanes.map((lane) => ({
    ...lane,
    summary: summarizeInline(lane.items, 2),
  }));
  const assessmentSnapshot = {
    dimensions: summarizeInline(plan.assessment.dimensions, 4),
    checkpoints: summarizeInline(plan.assessment.checkpoints, 3),
    portfolio: summarizeInline(plan.assessment.portfolio, 3),
    innovation: summarizeInline(plan.innovation.arenas, 3),
  };

  return (
    <div className={mode === 'overview' ? 'teacher-talent-board' : 'teacher-talent-board teacher-talent-board--review'}>
      <section className="teacher-talent-board__panel teacher-talent-board__panel--summary">
        <div className="teacher-talent-board__panel-head">
          <span>Graduation profile</span>
          <strong>{plan.direction}</strong>
        </div>
        <p>{compactText(plan.vision, 24)}</p>
        <div className="teacher-talent-board__chip-grid">
          {plan.graduationProfile.slice(0, 3).map((item) => (
            <span key={item}>{compactText(item, 14)}</span>
          ))}
        </div>
      </section>

      {mode === 'overview' ? (
        <section className="teacher-talent-board__panel teacher-talent-board__panel--roadmap">
          <div className="teacher-talent-board__panel-head">
            <span>Program cockpit</span>
            <strong>总控概览</strong>
          </div>
          <div className="teacher-talent-board__cockpit">
            {cockpitMetrics.map((item) => (
              <article key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
          <div className="teacher-talent-board__phase-grid">
            {overviewPhases.map((phase) => (
              <article key={phase.id} className="teacher-phase-card">
                <div className="teacher-phase-card__meta">
                  <span>{phase.stage}</span>
                  <em>{phase.coverage}</em>
                </div>
                <strong>{phase.label}</strong>
                <p>{compactText(phase.theme, 18)}</p>
                <div className="teacher-phase-card__facts">
                  <div>
                    <span>课程群</span>
                    <p>{compactText(phase.courses, 24)}</p>
                  </div>
                  <div>
                    <span>关键动作</span>
                    <p>{compactText(phase.action, 24)}</p>
                  </div>
                  <div>
                    <span>阶段交付</span>
                    <p>{compactText(phase.output, 24)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="teacher-talent-board__panel teacher-talent-board__panel--roadmap">
          <div className="teacher-talent-board__panel-head">
            <span>Semester matrix</span>
            <strong>八学期 + 入学建档</strong>
          </div>
          <div className="teacher-talent-board__semester-grid">
            {plan.semesterPlan.slice(0, 6).map((semester) => (
              <article key={semester.id} className="teacher-semester-card">
                <div className="teacher-semester-card__meta">
                  <span>{semester.stage}</span>
                  <em>{semester.label}</em>
                </div>
                <strong>{compactText(semester.theme, 18)}</strong>
                <p>{compactText(semester.target, 24)}</p>
                <div className="teacher-semester-card__tags">
                  {semester.courses.slice(0, 2).map((course) => (
                    <span key={course}>{course}</span>
                  ))}
                </div>
                <div className="teacher-semester-card__facts">
                  <div>
                    <span>工程训练</span>
                    <p>{compactText(semester.engineering.slice(0, 2).join('；'), 20)}</p>
                  </div>
                  <div>
                    <span>AI / 前沿</span>
                    <p>{compactText(semester.frontier.slice(0, 1).join('；'), 18)}</p>
                  </div>
                  <div>
                    <span>产出物</span>
                    <p>{compactText(semester.output, 18)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="teacher-talent-board__panel teacher-talent-board__panel--lanes">
        <div className="teacher-talent-board__panel-head">
          <span>Continuous lanes</span>
          <strong>贯穿主线</strong>
        </div>
        {mode === 'overview' ? (
          <div className="teacher-talent-board__lane-grid teacher-talent-board__lane-grid--compact">
            {overviewLanes.slice(0, 2).map((lane) => (
              <article key={lane.title} className="teacher-lane-card">
                <div className="teacher-lane-card__meta">
                  <span>{lane.label}</span>
                  <strong>{lane.title}</strong>
                </div>
                <div className="teacher-lane-card__list">
                  <p>{lane.summary}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="teacher-talent-board__lane-grid teacher-talent-board__lane-grid--compact">
            {overviewLanes.map((lane) => (
              <article key={lane.title} className="teacher-lane-card">
                <div className="teacher-lane-card__meta">
                  <span>{lane.label}</span>
                  <strong>{lane.title}</strong>
                </div>
                <div className="teacher-lane-card__list">
                  <p>{compactText(lane.summary, 30)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="teacher-talent-board__panel teacher-talent-board__panel--radar">
        <div className="teacher-talent-board__panel-head">
          <span>Frontier radar</span>
          <strong>{plan.radar.cadence}</strong>
        </div>
        <div className="teacher-talent-board__radar-meta">
          {plan.radar.sourceBuckets.slice(0, 1).map((bucket) => (
            <span key={bucket}>{bucket}</span>
          ))}
        </div>
        <div className="teacher-talent-board__radar-flow">
          {plan.radar.process.slice(0, 2).map((step) => (
            <article key={step}>
              <strong>{compactText(step, 14)}</strong>
            </article>
          ))}
        </div>
        <div className={mode === 'overview' ? 'teacher-talent-board__radar-grid teacher-talent-board__radar-grid--compact' : 'teacher-talent-board__radar-grid'}>
          {radarTopics.slice(0, 1).map((topic) => (
            <article key={`${topic.date}-${topic.title}`} className={mode === 'overview' ? 'teacher-radar-card teacher-radar-card--compact' : 'teacher-radar-card'}>
              <div className="teacher-radar-card__meta">
                <span>{topic.date}</span>
                <em>{topic.source}</em>
              </div>
              <strong>{topic.title}</strong>
              <p>{compactText(topic.signal, mode === 'overview' ? 18 : 22)}</p>
              <div className={mode === 'overview' ? 'teacher-radar-card__actions teacher-radar-card__actions--compact' : 'teacher-radar-card__actions'}>
                <div>
                  <span>课堂动作</span>
                  <p>{compactText(topic.classroomAction, mode === 'overview' ? 16 : 18)}</p>
                </div>
                {mode === 'review' && (
                  <div>
                    <span>项目映射</span>
                    <p>{compactText(topic.projectMapping, 18)}</p>
                  </div>
                )}
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
        {mode === 'overview' ? (
          <>
            <div className="teacher-talent-board__assessment-grid teacher-talent-board__assessment-grid--compact">
              <article>
                <span>维度</span>
                <p>{assessmentSnapshot.dimensions}</p>
              </article>
              <article>
                <span>检查点</span>
                <p>{assessmentSnapshot.checkpoints}</p>
              </article>
              <article>
                <span>作品集锚点</span>
                <p>{assessmentSnapshot.portfolio}</p>
              </article>
            </div>
            <div className="teacher-talent-board__note">{compactText(assessmentSnapshot.innovation, 36)}</div>
          </>
        ) : (
          <>
            <div className="teacher-talent-board__assessment-grid teacher-talent-board__assessment-grid--compact">
              <article>
                <span>维度</span>
                <p>{compactText(assessmentSnapshot.dimensions, 24)}</p>
              </article>
              <article>
                <span>检查点</span>
                <p>{compactText(assessmentSnapshot.checkpoints, 24)}</p>
              </article>
              <article>
                <span>作品集</span>
                <p>{compactText(assessmentSnapshot.portfolio, 24)}</p>
              </article>
            </div>
            <div className="teacher-talent-board__note">{compactText(assessmentSnapshot.innovation, 24)}</div>
          </>
        )}
      </section>

      <section className="teacher-talent-board__panel teacher-talent-board__panel--exit">
        <div className="teacher-talent-board__panel-head">
          <span>Exit pathways</span>
          <strong>毕业出口</strong>
        </div>
        <div className={mode === 'overview' ? 'teacher-talent-board__exit-grid teacher-talent-board__exit-grid--compact' : 'teacher-talent-board__exit-grid'}>
          {plan.exits.slice(0, 1).map((exit) => (
            <article key={exit.title} className={mode === 'overview' ? 'teacher-exit-card teacher-exit-card--compact' : 'teacher-exit-card'}>
              <div className="teacher-exit-card__meta">
                <span>{exit.title}</span>
                <em>{exit.fit}</em>
              </div>
              {mode === 'overview' ? (
                <>
                  <div className="teacher-exit-card__block">
                    <strong>当前重点</strong>
                    <p>{exit.milestones[0]}</p>
                  </div>
                  <div className="teacher-exit-card__block">
                    <strong>关键成果</strong>
                    <p>{exit.deliverables.slice(0, 2).join('；')}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="teacher-exit-card__block">
                    <strong>关键动作</strong>
                    <p>{compactText(exit.milestones.slice(0, 2).join('；'), 20)}</p>
                  </div>
                  <div className="teacher-exit-card__block">
                    <strong>成果物</strong>
                    <p>{compactText(exit.deliverables.slice(0, 2).join('；'), 20)}</p>
                  </div>
                </>
              )}
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
    { scope: 'goal', text: `${activeStudent.id} -> ${compactText(goal, 20)}` },
    { scope: 'program', text: firstSemester ? `${firstSemester.label} / ${compactText(firstSemester.theme, 16)}` : compactText(talentPlan?.outline[0] ?? '人培主线', 18) },
    { scope: 'radar', text: firstRadarTopic ? `${firstRadarTopic.source} ${firstRadarTopic.date}` : compactText(radarSection?.body.split('\n')[0] ?? '前沿雷达', 18) },
    { scope: 'plan', text: compactText(lessonPlan?.outline[0] ?? '课堂流程', 18) },
    { scope: 'slides', text: compactText(slideDeck?.outline[2] ?? 'PPT 页稿', 18) },
    { scope: 'syllabus', text: compactText(syllabus?.sections[2]?.body.split('\n')[0] ?? '教学大纲', 18) },
    { scope: 'focus', text: compactText(keyFocus?.sections[1]?.body.split('\n')[0] ?? activeStudent.focus, 18) },
    { scope: 'handoff', text: 'review queue' },
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

function summarizeInline(items: string[], count: number): string {
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, count)
    .join('；');
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function buildOverviewPhaseCards(plan: TalentPlanBlueprint) {
  const semester = plan.semesterPlan;
  const groups = [
    { id: 'phase-00', stage: 'PHASE 00', label: '新生入学', theme: '专业认知与学习建档', coverage: ['新生入学'], members: [0] },
    { id: 'phase-01', stage: 'PHASE 01', label: '大一基础夯实', theme: '编程基础 + 数据结构算法', coverage: ['大一上', '大一下'], members: [1, 2] },
    { id: 'phase-02', stage: 'PHASE 02', label: '大二工程化训练', theme: '面向对象 + 软件工程协作', coverage: ['大二上', '大二下'], members: [3, 4] },
    { id: 'phase-03', stage: 'PHASE 03', label: '大三智能开发', theme: '模型接入 + Agent 创新探索', coverage: ['大三上', '大三下'], members: [5, 6] },
    { id: 'phase-04', stage: 'PHASE 04', label: '大四毕业出口', theme: '毕设交付 + 多出口收束', coverage: ['大四上', '大四下'], members: [7, 8] },
  ];

  return groups.map((group) => {
    const items = group.members.map((index) => semester[index]).filter(Boolean);
    return {
      id: group.id,
      stage: group.stage,
      label: group.label,
      theme: group.theme,
      coverage: group.coverage.join(' / '),
      courses: takeUnique(items.flatMap((item) => item.courses), 4).join('、'),
      action: takeUnique(items.flatMap((item) => [item.engineering[0], item.frontier[0]]), 3).join('；'),
      output: items[items.length - 1]?.output ?? items[0]?.output ?? '阶段交付待确认',
    };
  });
}

function takeUnique(items: Array<string | undefined>, count: number): string[] {
  return [...new Set(items.map((item) => item?.trim()).filter(Boolean) as string[])].slice(0, count);
}

function buildFallbackArtifact(review: ReviewItem): TeacherArtifact {
  const rationale = review.rationale as Rationale;
  const summary = compactText(review.reason || '已进入审核队列', 24);
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
