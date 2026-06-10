import type { InteractiveClassroomJob, StudentDashboard } from './model';

interface Props {
  studentDashboard: StudentDashboard | null;
  interactiveJob: InteractiveClassroomJob | null;
  estimatedMastery?: number;
  evaluationFeedback?: string;
  pathFeedback?: string;
  onOpenTrainingPlan: () => void;
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

  return (
    <div className="progress-board">
      <section className="student-stage-card student-stage-card--hero">
        <div className="student-stage-card__header">
          <div>
            <small>Progress Writeback</small>
            <h2>阶段验证后的进度回写</h2>
          </div>
          <p>这个页面专门看“课堂验证之后系统怎么更新画像、培养方案和学习路径”，不再和课堂生成操作混在一起。</p>
        </div>
        <div className="student-stage-card__actions">
          <button type="button" className="freddie-secondary-button" onClick={onOpenTrainingPlan}>
            回培养方案页
          </button>
          <button type="button" className="freddie-primary-button" onClick={onOpenClassroom}>
            再做一轮课堂验证
          </button>
        </div>
      </section>

      <div className="progress-grid">
        <section className="student-stage-card">
          <div className="student-stage-card__header">
            <div>
              <small>Latest Validation</small>
              <h3>最近一次阶段验证结果</h3>
            </div>
            <p>{evaluationFeedback ?? '还没有阶段验证回写。完成一轮课堂测验后，这里会显示最新结果。'}</p>
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
                <span>{String(latestDelta.next_focus ?? '等待系统生成下一步建议')}</span>
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
              <h3>培养方案阶段状态</h3>
            </div>
            <p>每次课堂回写后，系统都应该能回答“当前卡在哪个阶段”。</p>
          </div>

          <div className="progress-stage-list">
            {trainingStages.length > 0 ? (
              trainingStages.map((stage) => (
                <article key={stage.stage_id} className={`progress-stage-item progress-stage-item--${stage.status}`}>
                  <strong>{stage.title}</strong>
                  <span>{stage.status}</span>
                  <p>{stage.next_action}</p>
                </article>
              ))
            ) : (
              <p className="student-context-empty">培养方案还未建立。先去培养方案页或互动课堂页推进第一阶段。</p>
            )}
          </div>
        </section>
      </div>

      <section className="student-stage-card">
        <div className="student-stage-card__header">
          <div>
            <small>Path Writeback</small>
            <h3>学习路径与系统建议</h3>
          </div>
          <p>{pathFeedback ?? '最近一次课堂完成后，这里会显示学习路径为什么被更新。'}</p>
        </div>

        <div className="progress-path-grid">
          <div className="progress-step-list">
            {pathSteps.length > 0 ? (
              pathSteps.slice(0, 6).map((step, index) => (
                <article key={`${step.package_id ?? 'step'}-${index}`} className="progress-step-item">
                  <strong>{step.package_id ?? `步骤 ${index + 1}`}</strong>
                  <span>{step.status ?? 'pending'}</span>
                  <p>{step.updated_reason ?? '等待课堂验证回写。'}</p>
                </article>
              ))
            ) : (
              <p className="student-context-empty">学习路径步骤会在生成课堂或回写后出现。</p>
            )}
          </div>

          <div className="progress-suggestion-list">
            {suggestions.length > 0 ? (
              suggestions.map((item) => (
                <article key={item}>
                  <strong>系统建议</strong>
                  <span>{item}</span>
                </article>
              ))
            ) : (
              <p className="student-context-empty">系统建议会在课堂和验证数据回写后生成。</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
