import { useState, useEffect, type CSSProperties } from 'react';
import type { Rationale } from '../../types/resources';
import type { AgentRow, AgentState } from '../../types/agentTrace';
import { useAgentTraceSSE } from '../AgentTracePanel/useAgentTraceSSE';
import { CLASSES, STUDENTS } from './model';
import type { ReviewItem, RunState, Student } from './model';

interface OverviewProps {
  metrics: { value: string; label: string }[];
  onChooseStudent: (student: Student) => void;
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
  onOpen: (rationale: Rationale) => void;
}

interface InterventionProps {
  activeStudent: Student;
  onChooseStudent: (student: Student) => void;
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
export function OverviewPanel({ metrics, onChooseStudent }: OverviewProps) {
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [hoveredData, setHoveredData] = useState<string | null>(null);

  // Dynamic class filtering
  const filteredStudents = selectedClass === 'all' 
    ? STUDENTS 
    : STUDENTS.filter(s => s.id.includes(selectedClass === 'Class A' ? 'stu_00' : 'stu_01'));

  return (
    <section className="teacher-studio-section">
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
              value={selectedClass} 
              onChange={(e) => setSelectedClass(e.target.value)}
              style={selectStyle}
            >
              <option value="all">All Classes</option>
              <option value="Class A">Class A (Base)</option>
              <option value="Class B">Class B (Advanced)</option>
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
              {CLASSES.map((item) => (
                <tr key={item.name} style={{ transition: 'background 200ms ease' }}>
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
          <PanelHead title="Resource parameter matrix" eyebrow="/api/generate" />
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
            body="读取学生画像、老师目标和上游选择理由。"
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
export function ReviewPanel({ reviews, onOpen }: ReviewProps) {
  const [selectedReviewId, setSelectedReviewId] = useState<string>(reviews[0]?.id || '');
  const activeReview = reviews.find(r => r.id === selectedReviewId) || reviews[0];

  return (
    <section className="teacher-studio-section">
      <div className="teacher-studio-section-head" style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: '"Outfit", sans-serif' }}>Review generated resources by evidence, not vibes.</h2>
        <span className="mesh-mono">/workspace/reviews</span>
      </div>

      <div style={workspaceSplitStyle}>
        {/* Left Side: Review Item Workspace Selector */}
        <div style={workspaceLeftStyle}>
          {reviews.map((item) => (
            <button 
              key={item.id} 
              style={{
                ...workspaceRowStyle,
                borderColor: selectedReviewId === item.id ? '#0070f3' : 'rgba(255,255,255,0.06)',
                background: selectedReviewId === item.id ? 'rgba(0,112,243,0.04)' : 'rgba(255,255,255,0.015)'
              }}
              onClick={() => setSelectedReviewId(item.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={workspaceRowMetaStyle}>{item.type} · {item.agent}</span>
                <span style={{ ...workspaceStatusDotStyle, background: item.status === 'ready' ? '#10b981' : '#f5a623' }} />
              </div>
              <strong style={workspaceRowTitleStyle}>{item.title}</strong>
              <p style={workspaceRowReasonStyle}>{item.reason}</p>
            </button>
          ))}
        </div>

        {/* Right Side: Split Pre-compiled Review Workspace */}
        {activeReview && (
          <div style={workspaceRightStyle}>
            <div style={workspaceRightHeaderStyle}>
              <div>
                <span style={workspaceRowMetaStyle}>{activeReview.type} · {activeReview.agent}</span>
                <h3 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, fontFamily: '"Outfit", sans-serif' }}>
                  {activeReview.title}
                </h3>
              </div>
              <button 
                className="mesh-ghost-button" 
                onClick={() => onOpen(activeReview.rationale)}
                style={{ minHeight: 30, padding: '0 12px', fontSize: 12 }}
              >
                Trace rationale fingerprint
              </button>
            </div>

            <div style={workspacePreviewBoxStyle}>
              <div style={previewMetaGridStyle}>
                <div>
                  <span style={previewMetaLabelStyle}>Student ID</span>
                  <div style={previewMetaValueStyle}>{activeReview.student}</div>
                </div>
                <div>
                  <span style={previewMetaLabelStyle}>Approval Queue</span>
                  <div style={previewMetaValueStyle}>{activeReview.status.toUpperCase()}</div>
                </div>
              </div>

              <div style={previewDocumentStyle}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#fff' }}>Generated Resource Spec Preview:</h4>
                <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 12.5, color: '#a1a1aa', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {`### Explanation Blueprint / Adaptive Node\nTarget Weakness: ${activeReview.reason}\nDifficulty rating adjusted by ProfileAgent: Level ${activeReview.rationale.difficulty_used} of 5.\n\n[Pre-compiled schema matches all requirements. Code sample and visualization trace binds correctly. Ready for teacher deployment.]`}
                </div>
              </div>

              <div style={previewActionsStyle}>
                <button className="mesh-ghost-button" style={{ flex: 1 }}>Reject / Re-simulate</button>
                <button className="mesh-primary-button" style={{ flex: 1 }}>Approve & Deploy to student</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────── 4. INTERVENTION PANEL ───────────────────────────
export function InterventionPanel({ activeStudent, onChooseStudent }: InterventionProps) {
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
            {STUDENTS.map((student) => (
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

const workspaceSplitStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.2fr)',
  gap: 20,
  alignItems: 'stretch',
  width: '100%',
};

const workspaceLeftStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  maxHeight: 520,
  overflowY: 'auto',
  paddingRight: 4
};

const workspaceRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '14px 18px',
  borderRadius: '10px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'all 200ms ease',
};

const workspaceRowMetaStyle: CSSProperties = {
  fontSize: 9.5,
  fontFamily: '"Geist Mono", monospace',
  color: 'var(--mesh-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em'
};

const workspaceStatusDotStyle: CSSProperties = {
  width: 5,
  height: 5,
  borderRadius: '50%'
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

const workspaceRightStyle: CSSProperties = {
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '14px',
  background: 'rgba(0, 0, 0, 0.35)',
  padding: 24,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
};

const workspaceRightHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  paddingBottom: 16,
  marginBottom: 20,
};

const workspacePreviewBoxStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
};

const previewMetaGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
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

const previewDocumentStyle: CSSProperties = {
  flex: 1,
  padding: 18,
  borderRadius: '10px',
  background: 'rgba(255, 255, 255, 0.01)',
  border: '1px solid rgba(255, 255, 255, 0.04)',
  maxHeight: 220,
  overflowY: 'auto'
};

const previewActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
};
