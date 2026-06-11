import type { GenerateResults } from '../../types/resources';
import { AgentFlowViz } from '../AgentFlowViz';
import { ResultsPanel } from '../ResultsPanel';
import { buildClassroomFlow, type GenerateSelectionContext, type InteractiveClassroomJob } from './model';

interface Props {
  studentId: string;
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  submitting: boolean;
  generating: boolean;
  interactiveJob: InteractiveClassroomJob | null;
  results: GenerateResults | null;
  taskId: string | null;
  estimatedMastery?: number;
  evaluationFeedback?: string;
  pathFeedback?: string;
  canOpenProgress: boolean;
  onKnowledgeId: (value: string) => void;
  onKnowledgeName: (value: string) => void;
  onStart: () => void;
  onLightweightGenerate: () => void;
  onOpenProgress: () => void;
  onOpenTrainingPlan: () => void;
}

export function InteractiveClassroomStudio({
  studentId,
  knowledgeId,
  knowledgeName,
  selectionContext,
  submitting,
  generating,
  interactiveJob,
  results,
  taskId,
  estimatedMastery,
  evaluationFeedback,
  pathFeedback,
  canOpenProgress,
  onKnowledgeId,
  onKnowledgeName,
  onStart,
  onLightweightGenerate,
  onOpenProgress,
  onOpenTrainingPlan,
}: Props) {
  const flow = buildClassroomFlow({
    knowledgeName,
    interactiveJob,
    hasEvaluation: Boolean(evaluationFeedback),
  });
  const startLabel = submitting ? '创建中…' : generating ? '生成中…' : '生成课堂';

  return (
    <div className="classroom-studio">
      <section className="classroom-studio__composer">
          <div className="classroom-studio__intro">
            <small>Interactive Classroom</small>
            <h2>OpenMAIC 课堂</h2>
          </div>
        <div className="classroom-studio__fields">
          <label>
            <span>知识点 ID</span>
            <input value={knowledgeId} onChange={(e) => onKnowledgeId(e.target.value)} />
          </label>
          <label>
            <span>知识点名称</span>
            <input value={knowledgeName} onChange={(e) => onKnowledgeName(e.target.value)} />
          </label>
          <div className="classroom-studio__actions">
            <button type="button" className="freddie-primary-button" onClick={onStart} disabled={submitting || generating}>
              {startLabel}
            </button>
            <button type="button" className="freddie-secondary-button" onClick={onLightweightGenerate} disabled={submitting || generating}>
              轻量资源
            </button>
          </div>
        </div>
        <div className="classroom-studio__meta">
          <span>Student · {studentId}</span>
          {selectionContext?.stage_title && <span>Stage · {selectionContext.stage_title}</span>}
          {estimatedMastery !== undefined && <span>掌握度 · {estimatedMastery}%</span>}
        </div>
      </section>

      <section className="classroom-studio__flow">
        <div className="classroom-studio__section-title">
          <div>
            <small>Flow</small>
            <h3>多 Agent 流程</h3>
          </div>
        </div>
        <div className="classroom-flow-grid">
          {flow.map((step, index) => (
            <article key={step.id} className={`classroom-flow-step classroom-flow-step--${step.status}`}>
              <div className="classroom-flow-step__index">{index + 1}</div>
              <div className="classroom-flow-step__body">
                <div className="classroom-flow-step__head">
                  <strong>{step.title}</strong>
                  <span>{step.owner}</span>
                </div>
                <code>{step.endpoint}</code>
                <p>{compactText(step.summary, 18)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {interactiveJob && (
        <section className="classroom-runtime-card">
          <div className="classroom-runtime-card__head">
            <div>
              <small>Runtime Status</small>
              <h3>{knowledgeName}</h3>
              <p>{compactText(interactiveJob.message || '任务已提交', 26)}</p>
            </div>
            <span className={`freddie-classroom-status freddie-classroom-status--${interactiveJob.status}`}>
              {interactiveJob.status}
            </span>
          </div>
          <div className="classroom-runtime-card__meta">
            <span>Job · {interactiveJob.job_id}</span>
            <span>OpenMAIC · {interactiveJob.openmaic_job_id}</span>
            <span>Package · {interactiveJob.resource_package_id}</span>
          </div>
          {(evaluationFeedback || pathFeedback) && (
            <div className="classroom-runtime-card__feedback">
              <strong>回写反馈</strong>
              <span>{compactText(evaluationFeedback || pathFeedback || '', 20)}</span>
            </div>
          )}
          <div className="classroom-runtime-card__actions">
            <button
              type="button"
              className="freddie-primary-button"
              disabled={interactiveJob.status !== 'succeeded' || !interactiveJob.classroom_url}
              onClick={() => {
                if (interactiveJob.classroom_url) window.open(interactiveJob.classroom_url, '_blank', 'noopener,noreferrer');
              }}
            >
              打开课堂
            </button>
            <button type="button" className="freddie-secondary-button" onClick={onOpenTrainingPlan}>
              回培养方案页
            </button>
            <button
              type="button"
              className="freddie-secondary-button"
              disabled={!canOpenProgress}
              onClick={onOpenProgress}
            >
              看回写
            </button>
            <a href={interactiveJob.package_url} target="_blank" rel="noreferrer">资源 JSON</a>
          </div>
        </section>
      )}

      <div className="classroom-studio__results-grid">
        <section className="classroom-studio__results">
          <div className="classroom-studio__section-title">
            <div>
              <small>Support Pack</small>
              <h3>轻量资源</h3>
            </div>
          </div>
          <ResultsPanel
            results={results}
            loading={Boolean(taskId && generating)}
            knowledgeId={knowledgeId}
            knowledgeName={knowledgeName}
            studentId={studentId}
          />
        </section>

        <section className="classroom-studio__trace">
          <div className="classroom-studio__section-title">
            <div>
              <small>Agent Trace</small>
              <h3>Agent 轨迹</h3>
            </div>
          </div>
          <div className="classroom-trace-frame">
            <AgentFlowViz taskId={taskId} />
          </div>
        </section>
      </div>
    </div>
  );
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
