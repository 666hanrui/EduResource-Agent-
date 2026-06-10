import type { CSSProperties } from 'react';
import type { GenerateSelectionContext, InteractiveClassroomJob, StudentDashboard, StudentPage } from './model';

interface Props {
  activePage: StudentPage;
  studentId: string;
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  studentDashboard: StudentDashboard | null;
  interactiveJob: InteractiveClassroomJob | null;
  estimatedMastery?: number;
  onStudentId: (value: string) => void;
}

export function StudentContextRail({
  activePage,
  studentId,
  knowledgeId,
  knowledgeName,
  selectionContext,
  studentDashboard,
  interactiveJob,
  estimatedMastery,
  onStudentId,
}: Props) {
  const pageTitle = {
    exploration: '专业探索',
    'training-plan': '培养方案',
    classroom: '互动课堂',
    progress: '进度回写',
  }[activePage];
  const suggestions = studentDashboard?.next_suggestions?.slice(0, 3) ?? [
    '先从专业探索里选一个方向，再决定要不要生成互动课堂。',
    '如果已经有目标知识点，就直接转成互动课堂并完成测验。',
  ];
  const masteryEntries = Object.entries(studentDashboard?.profile?.knowledge_mastery ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);
  const recentFeedback = studentDashboard?.recent_evaluations[0]?.feedback_markdown;

  return (
    <aside className="student-context-rail">
      <section className="student-context-card student-context-card--hero">
        <small className="student-context-label">Student Workspace</small>
        <h2>{pageTitle}</h2>
        <p>把学生主线拆成探索、培养方案、互动课堂和进度回写四个页面，每一步都更聚焦，也更适合继续扩工程。</p>
      </section>

      <section className="student-context-card">
        <small className="student-context-label">当前学生</small>
        <label className="student-context-field">
          <span>STUDENT_ID</span>
          <input value={studentId} onChange={(e) => onStudentId(e.target.value)} />
        </label>
        <div className="student-context-pill-row">
          <span>{knowledgeName}</span>
          <span>{knowledgeId}</span>
        </div>
        {selectionContext && (
          <div className="student-context-note">
            <strong>选择理由</strong>
            <span>{selectionContext.reason}</span>
          </div>
        )}
      </section>

      <section className="student-context-card">
        <small className="student-context-label">下一步</small>
        <div className="student-context-list">
          {suggestions.map((item) => (
            <article key={item}>
              <strong>继续推进</strong>
              <span>{item}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="student-context-card">
        <small className="student-context-label">学习画像</small>
        {masteryEntries.length > 0 ? (
          <div className="student-context-mastery">
            {masteryEntries.map(([key, value]) => (
              <div key={key} className="student-context-mastery__item">
                <div>
                  <strong>{key}</strong>
                  <span>{value}% 掌握度</span>
                </div>
                <div style={{ '--progress': `${Math.max(0, Math.min(100, value))}%` } as CSSProperties} className="student-context-progress" />
              </div>
            ))}
          </div>
        ) : (
          <p className="student-context-empty">课堂完成后，这里会显示知识点掌握度和画像回写结果。</p>
        )}
      </section>

      <section className="student-context-card">
        <small className="student-context-label">课堂状态</small>
        {interactiveJob ? (
          <div className="student-context-list">
            <article>
              <strong>{interactiveJob.status}</strong>
              <span>{interactiveJob.message || '互动课堂任务已提交。'}</span>
            </article>
            <article>
              <strong>Resource Package</strong>
              <span>{interactiveJob.resource_package_id}</span>
            </article>
            {estimatedMastery !== undefined && (
              <article>
                <strong>最近掌握度</strong>
                <span>{estimatedMastery}%</span>
              </article>
            )}
          </div>
        ) : (
          <p className="student-context-empty">还没有互动课堂任务。先从专业探索选知识点，或手动输入知识点后发起课堂生成。</p>
        )}
        {recentFeedback && (
          <div className="student-context-note">
            <strong>最近评估反馈</strong>
            <span>{recentFeedback}</span>
          </div>
        )}
      </section>
    </aside>
  );
}
