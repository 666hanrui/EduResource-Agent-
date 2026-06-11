import type { InteractiveClassroomJob, StudentDashboard, TrainingStageKey } from './model';

interface Props {
  studentDashboard: StudentDashboard | null;
  interactiveJob: InteractiveClassroomJob | null;
  estimatedMastery?: number;
  evaluationFeedback?: string;
  pathFeedback?: string;
  onOpenTrainingPlan: (stage: TrainingStageKey | null) => void;
  onOpenClassroom: () => void;
}

export function ProgressOverview({
  studentDashboard,
  interactiveJob,
  estimatedMastery,
  evaluationFeedback,
  pathFeedback,
  onOpenTrainingPlan,
  onOpenClassroom,
}: Props) {
  const latestEvaluation = studentDashboard?.recent_evaluations?.[0];
  const latestDelta = (latestEvaluation?.mastery_delta_json ?? {}) as Record<string, unknown>;
  const stageValidation = (latestDelta.stage_validation ?? {}) as Record<string, unknown>;
  const trainingStages = studentDashboard?.training_plan?.stages ?? [];
  const pathSteps = studentDashboard?.learning_path?.steps ?? [];
  const suggestions = studentDashboard?.next_suggestions ?? [];
  const currentStage =
    trainingStages.find((stage) => stage.status === 'in_progress')
    ?? trainingStages.find((stage) => stage.status === 'needs_review')
    ?? trainingStages[0];

  return (
    <div className="progress-board">
      <section className="student-stage-card student-stage-card--hero">
        <div className="student-stage-card__header">
          <div>
            <small>Progress Writeback</small>
            <h2>进度回写</h2>
          </div>
        </div>
        <div className="student-stage-card__actions">
          <button
            type="button"
            className="freddie-secondary-button"
            onClick={() => onOpenTrainingPlan((currentStage?.key as TrainingStageKey | undefined) ?? null)}
          >
            回培养方案页
          </button>
          <button type="button" className="freddie-primary-button" onClick={onOpenClassroom}>
            再做一轮
          </button>
        </div>
      </section>

      <div className="progress-grid">
        <section className="student-stage-card">
          <div className="student-stage-card__header">
            <div>
              <small>Latest Validation</small>
              <h3>最近结果</h3>
            </div>
            {evaluationFeedback ? <p>{compactText(evaluationFeedback, 28)}</p> : null}
          </div>

          <div className="progress-pill-row">
            {interactiveJob && <span>课堂任务：{interactiveJob.status}</span>}
            {estimatedMastery !== undefined && <span>掌握度：{estimatedMastery}%</span>}
            {latestEvaluation && <span>评估 ID：{latestEvaluation.id}</span>}
          </div>

          {latestEvaluation && (
            <div className="progress-detail-list">
              <article>
                <strong>当前知识点</strong>
                <span>{String(latestDelta.knowledge_name ?? latestDelta.knowledge_id ?? '当前知识点')}</span>
              </article>
              <article>
                <strong>下一步 Focus</strong>
                <span>{compactText(String(latestDelta.next_focus ?? '等待下一步'), 18)}</span>
              </article>
              <article>
                <strong>阶段验证来源</strong>
                <span>
                  {String(stageValidation.package_title ?? 'OpenMAIC 课堂')}
                  {stageValidation.question_count ? ` · ${String(stageValidation.question_count)} 题` : ''}
                </span>
              </article>
            </div>
          )}
        </section>

        <section className="student-stage-card">
          <div className="student-stage-card__header">
            <div>
              <small>Training Status</small>
              <h3>阶段状态</h3>
            </div>
          </div>

          <div className="progress-stage-list">
            {trainingStages.length > 0 ? (
              trainingStages.map((stage) => (
                <article key={stage.stage_id} className={`progress-stage-item progress-stage-item--${stage.status}`}>
                  <strong>{stage.title}</strong>
                  <span>{stage.status}</span>
                  <p>{compactText(stage.next_action, 14)}</p>
                </article>
              ))
            ) : (
              <p className="student-context-empty">暂无培养方案</p>
            )}
          </div>
        </section>
      </div>

      <section className="student-stage-card">
        <div className="student-stage-card__header">
          <div>
            <small>Path Writeback</small>
            <h3>路径与建议</h3>
          </div>
          {pathFeedback ? <p>{compactText(pathFeedback, 28)}</p> : null}
        </div>

        <div className="progress-path-grid">
          <div className="progress-step-list">
            {pathSteps.length > 0 ? (
              pathSteps.slice(0, 6).map((step, index) => (
                <article key={`${step.package_id ?? 'step'}-${index}`} className="progress-step-item">
                  <strong>{step.package_id ?? `步骤 ${index + 1}`}</strong>
                  <span>{step.status ?? 'pending'}</span>
                  <p>{compactText(step.updated_reason ?? '待回写', 14)}</p>
                </article>
              ))
            ) : (
              <p className="student-context-empty">暂无路径</p>
            )}
          </div>

          <div className="progress-suggestion-list">
            {suggestions.length > 0 ? (
              suggestions.map((item) => (
                <article key={item}>
                  <strong>建议</strong>
                  <span>{compactText(item, 16)}</span>
                </article>
              ))
            ) : (
              <p className="student-context-empty">暂无建议</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
