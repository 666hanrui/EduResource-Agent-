import type { GenerateSelectionContext, StudentDashboard } from './model';

interface Props {
  studentDashboard: StudentDashboard | null;
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  onOpenClassroom: (payload: {
    knowledgeId: string;
    knowledgeName: string;
    selectionContext: GenerateSelectionContext;
  }) => void;
}

export function TrainingPlanBoard({
  studentDashboard,
  knowledgeId,
  knowledgeName,
  selectionContext,
  onOpenClassroom,
}: Props) {
  const trainingPlan = studentDashboard?.training_plan;

  if (!trainingPlan) {
    return (
      <div className="training-plan-board">
        <section className="student-stage-card student-stage-card--hero">
          <div className="student-stage-card__header">
            <div>
              <small>Training Plan</small>
              <h2>个性化培养方案</h2>
            </div>
            <p>现在先用已选知识点搭一个阶段草案，等课堂和测验回写后，系统会把它升级成完整的三阶段培养方案。</p>
          </div>
        </section>

        <section className="student-stage-card">
          <div className="student-stage-card__header">
            <div>
              <small>Draft Stage</small>
              <h3>当前待启动阶段</h3>
            </div>
            <p>{selectionContext?.reason ?? '还没有来自探索模块的推荐理由，建议先回专业探索挑一个知识点。'}</p>
          </div>

          <article className="training-stage-card training-stage-card--recommended">
            <div className="training-stage-card__top">
              <span className="training-stage-card__index">1</span>
              <div>
                <small>待生成</small>
                <h4>阶段 1 · 启动课堂验证</h4>
              </div>
              <span className="training-stage-card__status">recommended</span>
            </div>
            <p className="training-stage-card__goal">先把探索里选中的知识点推进成第一轮互动课堂，形成培养方案的初始基线。</p>
            <p className="training-stage-card__summary">
              当前知识点：{knowledgeName}（{knowledgeId}）
            </p>
            <div className="training-stage-validation">
              <small>预设验证题</small>
              <strong>围绕「{knowledgeName}」完成一轮课堂测验，确认当前掌握度和下一步 focus。</strong>
              <span>完成标准：至少形成一次课堂作答回写，并在学生画像里写入正确率和 next focus。</span>
            </div>
            <div className="training-stage-actions">
              <button
                type="button"
                className="freddie-primary-button"
                onClick={() =>
                  onOpenClassroom({
                    knowledgeId,
                    knowledgeName,
                    selectionContext: selectionContext ?? {
                      source: 'manual',
                      reason: `围绕「${knowledgeName}」启动第一轮课堂验证。`,
                      suggested_difficulty: 3,
                    },
                  })
                }
              >
                去课堂页启动第一阶段
              </button>
            </div>
          </article>
        </section>
      </div>
    );
  }

  return (
    <div className="training-plan-board">
      <section className="student-stage-card student-stage-card--hero">
        <div className="student-stage-card__header">
          <div>
            <small>Training Plan</small>
            <h2>{trainingPlan.title}</h2>
          </div>
          <p>{trainingPlan.summary}</p>
        </div>
      </section>

      <section className="student-stage-card">
        <div className="student-stage-card__header">
          <div>
            <small>Stage Roadmap</small>
            <h3>每个阶段都要有验证题，不只是写一个长期目标</h3>
          </div>
          <p>系统会把当前学生的培养主线拆成基础定标、课堂练习和进阶迁移三个阶段，每个阶段都附一个当前要做的验证动作。</p>
        </div>

        <div className="training-stage-grid">
          {trainingPlan.stages.map((stage, index) => (
            <article key={stage.stage_id} className={`training-stage-card training-stage-card--${stage.status}`}>
              <div className="training-stage-card__top">
                <span className="training-stage-card__index">{index + 1}</span>
                <div>
                  <small>{stage.horizon}</small>
                  <h4>{stage.title}</h4>
                </div>
                <span className="training-stage-card__status">{stage.status}</span>
              </div>

              <p className="training-stage-card__goal">{stage.goal}</p>
              <p className="training-stage-card__summary">{stage.summary}</p>

              <div className="training-stage-chip-row">
                {stage.focus_knowledge_ids.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>

              <div className="training-stage-validation">
                <small>阶段验证题</small>
                <strong>{stage.validation_question.prompt}</strong>
                <span>完成标准：{stage.validation_question.success_criteria}</span>
              </div>

              <div className="training-stage-list">
                {stage.evidence_targets.map((item) => (
                  <article key={item}>
                    <strong>证据目标</strong>
                    <span>{item}</span>
                  </article>
                ))}
              </div>

              <div className="training-stage-actions">
                <button
                  type="button"
                  className="freddie-primary-button"
                  onClick={() =>
                    onOpenClassroom({
                      knowledgeId: stage.validation_question.target_knowledge_id,
                      knowledgeName: stage.validation_question.target_knowledge_name,
                      selectionContext: {
                        source: 'exploration',
                        reason: `${stage.title}：${stage.validation_question.prompt}`,
                        suggested_difficulty: stage.validation_question.suggested_difficulty,
                      },
                    })
                  }
                >
                  去做这一阶段的课堂验证
                </button>
                <span>{stage.next_action}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
