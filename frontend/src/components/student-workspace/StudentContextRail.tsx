import type { CSSProperties } from 'react';
import type { StudentLearningSystem, StudentPage, TrainingStageKey } from './model';

interface Props {
  activePage: StudentPage;
  studentId: string;
  learningSystem: StudentLearningSystem;
  onStudentId: (value: string) => void;
  onNavigate: (page: StudentPage, stage?: TrainingStageKey | null) => void;
}

const PAGE_LABELS: Record<StudentPage, string> = {
  exploration: '画像与广度',
  'training-plan': '培养方案',
  classroom: '课堂验证',
  progress: '回写证据',
};

export function StudentContextRail({
  activePage,
  studentId,
  learningSystem,
  onStudentId,
  onNavigate,
}: Props) {
  return (
    <aside className="student-context-rail">
      <section className="student-context-card student-context-card--identity student-passport-card">
        <div className="student-passport-card__mark" aria-hidden="true">学</div>
        <div className="student-passport-card__body">
          <small className="student-context-label">Learning Passport</small>
          <h3>学习护照</h3>
          <p>当前在「{PAGE_LABELS[activePage]}」，下一步由昔涟和阶段验证题共同驱动。</p>
        </div>
        <label className="student-context-field">
          <span>STUDENT_ID</span>
          <input value={studentId} onChange={(event) => onStudentId(event.target.value)} />
        </label>
        <a href="/register" data-app-route className="student-role-link">切换身份</a>
      </section>

      <section className="student-context-card student-context-card--route-map">
        <div className="student-context-section-title">
          <small className="student-context-label">五阶段路线</small>
          <span>{learningSystem.currentStage.label}</span>
        </div>
        <div className="student-passport-steps">
          {learningSystem.stages.map((stage, index) => (
            <button
              key={stage.key}
              type="button"
              className={stage.key === learningSystem.currentStage.key ? 'student-passport-step student-passport-step--active' : 'student-passport-step'}
              onClick={() => onNavigate(stage.route, stage.routeStage)}
            >
              <span>{index + 1}</span>
              <strong>{stage.label}</strong>
              <small>{stage.score}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="student-context-card student-context-card--validation">
        <small className="student-context-label">当前阶段验证题</small>
        <h3>{learningSystem.validationQuestion.title}</h3>
        <p>{learningSystem.validationQuestion.prompt}</p>
        <div className="student-validation-meta">
          <span>难度 {learningSystem.validationQuestion.difficulty} 星</span>
          <span>{learningSystem.validationQuestion.successCriteria}</span>
        </div>
        <button
          type="button"
          className="student-inline-action"
          onClick={() => onNavigate(learningSystem.primaryAction.route, learningSystem.primaryAction.routeStage)}
        >
          {learningSystem.primaryAction.label}
        </button>
      </section>

      <section className="student-context-card">
        <div className="student-context-section-title">
          <small className="student-context-label">体系分数</small>
          <span>{learningSystem.currentStage.label}</span>
        </div>
        <div className="student-context-metrics">
          {learningSystem.metrics.map((metric) => (
            <article key={metric.label}>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <span>{metric.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="student-context-card student-context-card--map">
        <div className="student-context-section-title">
          <small className="student-context-label">资源上下级</small>
          <span>摘要入口</span>
        </div>
        <div className="student-resource-clusters">
          {learningSystem.resourceClusters.map((cluster) => {
            const leadNode = cluster.nodes[0];
            const destination = resourceClusterDestination(cluster.key);
            return (
              <button
                key={cluster.key}
                type="button"
                className="student-resource-cluster"
                onClick={() => onNavigate(destination.page, destination.stage)}
              >
                <span
                  className="student-resource-cluster__score"
                  style={{ '--score': `${cluster.score}%` } as CSSProperties}
                >
                  {cluster.score}
                </span>
                <span className="student-resource-cluster__body">
                  <strong>{cluster.title}</strong>
                  <span>{cluster.description}</span>
                  {leadNode && <small>{compactText(leadNode.title, 20)} · {cluster.nodes.length} 个节点</small>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="student-context-card">
        <div className="student-context-section-title">
          <small className="student-context-label">画像掌握</small>
          <span>Top nodes</span>
        </div>
        {learningSystem.masteryTop.length > 0 ? (
          <div className="student-context-mastery">
            {learningSystem.masteryTop.map((item) => (
              <div key={item.id} className="student-context-mastery__item">
                <div>
                  <strong>{item.id}</strong>
                  <span>{item.value}% 掌握度</span>
                </div>
                <div
                  style={{ '--progress': `${item.value}%` } as CSSProperties}
                  className="student-context-progress"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="student-context-empty">暂无画像回写，先完成探索或课堂验证。</p>
        )}
      </section>

      {learningSystem.suggestions.length > 0 && (
        <section className="student-context-card">
          <div className="student-context-section-title">
            <small className="student-context-label">下一步建议</small>
            <span>{learningSystem.suggestions.length} 条</span>
          </div>
          <div className="student-context-list">
            {learningSystem.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onNavigate(learningSystem.primaryAction.route, learningSystem.primaryAction.routeStage)}
              >
                <strong>Next</strong>
                <span>{compactText(suggestion, 34)}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

function resourceClusterDestination(key: string): { page: StudentPage; stage?: TrainingStageKey | null } {
  switch (key) {
    case 'interest':
      return { page: 'training-plan', stage: 'foundation' };
    case 'depth':
      return { page: 'training-plan', stage: 'practice' };
    case 'evidence':
      return { page: 'progress' };
    case 'profile':
    case 'breadth':
      return { page: 'exploration' };
    default:
      return { page: 'training-plan', stage: 'foundation' };
  }
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
