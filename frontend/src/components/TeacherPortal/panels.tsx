import type { CSSProperties } from 'react';
import type { Rationale } from '../../types/resources';
import { AGENTS, CLASSES, STUDENTS } from './model';
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

export function OverviewPanel({ metrics, onChooseStudent }: OverviewProps) {
  return (
    <section className="teacher-studio-section">
      <MetricGrid metrics={metrics} />
      <div className="teacher-studio-grid-2">
        <section className="mesh-panel">
          <PanelHead title="Class runtime" eyebrow="/classes" />
          <table className="mesh-table">
            <thead>
              <tr>
                <th>班级</th>
                <th>学生</th>
                <th>风险</th>
                <th>进度</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {CLASSES.map((item) => (
                <tr key={item.name}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.students}</td>
                  <td>{item.risk}</td>
                  <td><Progress value={item.progress} /></td>
                  <td><span className={item.risk > 8 ? 'mesh-status warn' : 'mesh-status'}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mesh-panel">
          <PanelHead title="Risk queue" eyebrow="/risk-queue" />
          <div className="teacher-studio-risk-list">
            {STUDENTS.map((student) => (
              <button key={student.id} className="teacher-studio-risk-row" onClick={() => onChooseStudent(student)}>
                <div>
                  <strong>{student.id}</strong>
                  <span>{student.focus}</span>
                </div>
                <Progress value={student.mastery} />
                <em>{student.risk}</em>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

export function GeneratorPanel(props: GeneratorProps) {
  const running = props.runState === 'submitting' || props.runState === 'running';
  const buttonLabel = props.runState === 'submitting'
    ? 'Submitting…'
    : props.runState === 'running'
      ? 'Agents running…'
      : 'Generate resources';

  return (
    <section className="teacher-studio-section teacher-studio-grid-2 teacher-studio-grid-heavy">
      <section className="mesh-panel">
        <PanelHead title="Generate bundle" eyebrow="/api/generate" />
        <div className="teacher-studio-form-grid">
          <Field label="student_id" value={props.studentId} onChange={props.onStudentId} />
          <Field label="knowledge_id" value={props.knowledgeId} onChange={props.onKnowledgeId} />
          <Field label="knowledge_name" value={props.knowledgeName} onChange={props.onKnowledgeName} />
        </div>
        <label className="teacher-studio-label">teacher_goal</label>
        <textarea className="teacher-studio-textarea" value={props.goal} onChange={(event) => props.onGoal(event.target.value)} />
        <div className="teacher-studio-button-row">
          <button className="mesh-primary-button" disabled={running} onClick={() => void props.onGenerate()}>{buttonLabel}</button>
          <span className="mesh-mono">{props.taskId ? `task: ${props.taskId}` : 'ready'}</span>
        </div>
        {props.error && <div className="teacher-studio-error">{props.error}</div>}
      </section>

      <section className="mesh-panel">
        <PanelHead title="Agent pipeline" eyebrow="/runtime" />
        <div className="teacher-studio-agent-grid">
          {AGENTS.map(([name, status, detail], index) => (
            <article className="mesh-card teacher-studio-agent-card" key={name}>
              <small>{String(index + 1).padStart(2, '0')} · {name}</small>
              <h3>{status}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

export function ReviewPanel({ reviews, onOpen }: ReviewProps) {
  return (
    <section className="teacher-studio-section">
      <div className="teacher-studio-section-head">
        <h2>Review generated resources by evidence, not vibes.</h2>
        <span className="mesh-mono">/review</span>
      </div>
      <div className="teacher-studio-grid-2">
        {reviews.map((item) => (
          <article className="mesh-panel teacher-studio-review-card" key={item.id}>
            <small>{item.type} · {item.agent}</small>
            <h3>{item.title}</h3>
            <p>{item.reason}</p>
            <div className="teacher-studio-review-meta">
              <span>{item.student}</span>
              <span>{item.status}</span>
            </div>
            <div className="mesh-actions">
              <button className="mesh-ghost-button" onClick={() => onOpen(item.rationale)}>Trace rationale</button>
              <button className="mesh-primary-button">Approve</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function InterventionPanel({ activeStudent, onChooseStudent }: InterventionProps) {
  return (
    <section className="teacher-studio-section teacher-studio-grid-2">
      <section className="mesh-panel">
        <PanelHead title="Interventions" eyebrow="/interventions" />
        <table className="mesh-table">
          <thead>
            <tr>
              <th>学生</th>
              <th>证据</th>
              <th>建议动作</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {STUDENTS.map((student) => (
              <tr key={student.id}>
                <td><strong>{student.id}</strong></td>
                <td>{student.evidence}</td>
                <td>{student.action}</td>
                <td><button className="mesh-ghost-button" onClick={() => onChooseStudent(student)}>Generate</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mesh-panel">
        <PanelHead title="Closed loop" eyebrow="/loop" />
        <div className="teacher-studio-loop-stack">
          <LoopCard label="risk signal" title={`${activeStudent.id} · ${activeStudent.focus}`} body={activeStudent.evidence} />
          <LoopCard label="teacher action" title={activeStudent.action} body="老师确认后触发资源生成，审核通过后回流学生端。" />
          <LoopCard label="profile update" title="EvaluationAgent 更新画像" body="答题表现、资源反馈与老师干预记录进入下一轮推荐依据。" />
        </div>
      </section>
    </section>
  );
}

export function TeacherLog({ scope, text }: { scope: string; text: string }) {
  return <div className="mesh-log-line"><strong>{scope}</strong><span><span className="mesh-log-ok">✓</span> {text}</span></div>;
}

function PanelHead({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
    <div className="teacher-studio-panel-head">
      <h2>{title}</h2>
      <span className="mesh-mono">{eyebrow}</span>
    </div>
  );
}

function MetricGrid({ metrics }: { metrics: { value: string; label: string }[] }) {
  return (
    <div className="mesh-metric-grid">
      {metrics.map((item) => (
        <div className="mesh-metric" key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
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

function LoopCard({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="teacher-studio-loop-card">
      <span className="mesh-mono">{label}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return <div className="mesh-progress"><span style={{ '--value': `${value}%` } as CSSProperties} /></div>;
}
