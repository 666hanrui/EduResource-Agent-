import { useMemo, type CSSProperties } from 'react';
import { LearningPathStepBoard } from './LearningPathStepBoard';
import type {
  GenerateSelectionContext,
  StudentDashboard,
  StudentLearningSystem,
  TrainingStageKey,
} from './model';

interface Props {
  studentDashboard: StudentDashboard | null;
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  activeStageKey: TrainingStageKey | null;
  learningSystem: StudentLearningSystem;
  onOpenClassroom: (payload: {
    knowledgeId: string;
    knowledgeName: string;
    selectionContext: GenerateSelectionContext;
  }) => void;
  onOpenStage: (stage: TrainingStageKey) => void;
  onUpdateStep?: (
    stepId: string,
    payload: {
      status?: 'pending' | 'in_progress' | 'done' | 'adjusted';
      evidence?: string;
      mastery_after?: number;
      updated_reason?: string;
    },
  ) => Promise<void>;
}

type Stage = NonNullable<StudentDashboard['training_plan']>['stages'][number];

const STATUS_LABELS: Record<string, string> = {
  recommended: '待启动',
  in_progress: '进行中',
  completed: '已完成',
  needs_review: '需复盘',
};

const STAGE_LAYER_LABELS: Record<TrainingStageKey, string> = {
  foundation: '兴趣定标',
  practice: '深度实践',
  advancement: '进阶迁移',
};

export function TrainingPlanBoard({
  studentDashboard,
  knowledgeId,
  knowledgeName,
  selectionContext,
  activeStageKey,
  learningSystem,
  onOpenClassroom,
  onOpenStage,
  onUpdateStep,
}: Props) {
  const trainingPlan = studentDashboard?.training_plan;
  const pathSteps = studentDashboard?.learning_path?.steps ?? [];
  const stages = useMemo<Stage[]>(() => {
    const base = trainingPlan?.stages ?? [];
    if (base.length > 0) return base;
    return [buildDraftStage({ knowledgeId, knowledgeName, selectionContext })];
  }, [knowledgeId, knowledgeName, selectionContext, trainingPlan]);
  const activeStage =
    (activeStageKey && stages.find((stage) => stage.key === activeStageKey))
    ?? stages.find((stage) => stage.status === 'in_progress')
    ?? stages.find((stage) => stage.status === 'needs_review')
    ?? stages[0];
  const completedCount = stages.filter((stage) => stage.status === 'completed').length;
  const relatedClusters = learningSystem.resourceClusters.filter(
    (cluster) => cluster.key === 'interest' || cluster.key === 'depth' || cluster.key === 'evidence',
  );

  if (!activeStage) return null;

  const launchClassroom = () => {
    onOpenClassroom({
      knowledgeId: activeStage.validation_question.target_knowledge_id,
      knowledgeName: activeStage.validation_question.target_knowledge_name,
      selectionContext: {
        source: 'exploration',
        reason: `${activeStage.title}：${activeStage.validation_question.prompt}`,
        suggested_difficulty: activeStage.validation_question.suggested_difficulty,
        stage_key: activeStage.key,
        stage_title: activeStage.title,
        validation_prompt: activeStage.validation_question.prompt,
        success_criteria: activeStage.validation_question.success_criteria,
        recommended_action: activeStage.next_action,
      },
    });
  };

  return (
    <div className="training-plan-board">
      <section className="student-stage-card student-stage-card--system">
        <div className="student-stage-card__header">
          <div>
            <small>Training System</small>
            <h2>{trainingPlan?.title ?? '个性化培养方案'}</h2>
            <p>{trainingPlan?.summary ?? '从探索结果生成阶段化学习路径，每阶段都必须用一个题目或作品验证。'}</p>
          </div>
          <div className="training-plan-status-grid">
            <article><small>阶段</small><strong>{stages.length}</strong><span>分层推进</span></article>
            <article><small>完成</small><strong>{completedCount}</strong><span>已形成证据</span></article>
            <article><small>路径步骤</small><strong>{pathSteps.length}</strong><span>真实落库</span></article>
          </div>
        </div>
      </section>

      <section className="training-stage-matrix" aria-label="培养阶段矩阵">
        {stages.map((stage, index) => {
          const isActive = stage.stage_id === activeStage.stage_id;
          const score = statusScore(stage.status);
          return (
            <button
              key={stage.stage_id}
              type="button"
              data-stage-key={stage.key}
              className={isActive ? `training-stage-unit training-stage-unit--${stage.status} training-stage-unit--active` : `training-stage-unit training-stage-unit--${stage.status}`}
              onClick={() => onOpenStage(stage.key)}
            >
              <span className="training-stage-unit__index">0{index + 1}</span>
              <span className="training-stage-unit__layer">{STAGE_LAYER_LABELS[stage.key]}</span>
              <strong>{stage.title}</strong>
              <small>{stage.goal}</small>
              <span className="training-stage-unit__score" style={{ '--score': `${score}%` } as CSSProperties}>{STATUS_LABELS[stage.status]}</span>
            </button>
          );
        })}
      </section>

      <section className="training-stage-workbench">
        <article className={`training-stage-card training-stage-card--${activeStage.status}`}>
          <div className="training-stage-card__top">
            <div>
              <small>{STAGE_LAYER_LABELS[activeStage.key]} / {activeStage.horizon}</small>
              <h3>{activeStage.goal}</h3>
            </div>
            <span className="training-stage-card__status">{STATUS_LABELS[activeStage.status]}</span>
          </div>

          <div className="training-validation-block">
            <small>本阶段验证题</small>
            <strong>{activeStage.validation_question.prompt}</strong>
            <p>{activeStage.validation_question.success_criteria}</p>
            <div className="training-validation-meta">
              <span>{activeStage.validation_question.target_knowledge_name}</span>
              <span>难度 {activeStage.validation_question.suggested_difficulty} 星</span>
              <span>{activeStage.validation_question.answer_format}</span>
            </div>
          </div>

          <div className="training-stage-detail-grid">
            <div className="training-stage-list">
              <article>
                <strong>焦点知识</strong>
                <div className="training-stage-chip-row">
                  {activeStage.focus_knowledge_ids.length > 0
                    ? activeStage.focus_knowledge_ids.map((item) => <span key={item}>{item}</span>)
                    : <span>{activeStage.validation_question.target_knowledge_id}</span>}
                </div>
              </article>
              <article>
                <strong>路径依赖</strong>
                <span>{activeStage.linked_step_ids.length > 0 ? activeStage.linked_step_ids.join(' -> ') : '由探索推荐直接进入'}</span>
              </article>
            </div>

            <div className="training-stage-list">
              {activeStage.evidence_targets.map((item) => (
                <article key={item}><strong>证据目标</strong><span>{item}</span></article>
              ))}
            </div>
          </div>

          <div className="training-stage-actions">
            <button type="button" className="student-primary-action student-primary-action--compact" onClick={launchClassroom}>
              <span>进入课堂验证</span>
              <small>{activeStage.next_action}</small>
            </button>
          </div>
        </article>

        <aside className="training-resource-inspector">
          <div className="training-resource-inspector__head">
            <small>Resource Hierarchy</small>
            <h3>资源谱系</h3>
            <p>资源不是平铺列表，而是跟随兴趣、深度学习和证据回写逐层沉淀。</p>
          </div>
          <div className="training-resource-cluster-list">
            {relatedClusters.map((cluster) => (
              <article key={cluster.key} className="training-resource-cluster">
                <div><strong>{cluster.title}</strong><span>{cluster.description}</span></div>
                <small>{cluster.score}%</small>
                <div className="training-resource-node-row">
                  {cluster.nodes.slice(0, 4).map((node) => <span key={node.id}>{node.title}</span>)}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>

      <LearningPathStepBoard studentDashboard={studentDashboard} onUpdateStep={onUpdateStep} />
    </div>
  );
}

function buildDraftStage({
  knowledgeId,
  knowledgeName,
  selectionContext,
}: {
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
}): Stage {
  const stageKey = normalizeStageKey(selectionContext?.stage_key) ?? 'foundation';
  return {
    stage_id: `draft:${stageKey}:${knowledgeId}`,
    key: stageKey,
    title: selectionContext?.stage_title ?? '阶段 1 · 课堂验证',
    horizon: '立即开始',
    goal: selectionContext?.reason ?? `完成「${knowledgeName}」首轮验证`,
    summary: selectionContext?.stage_title ?? '待选知识点',
    status: 'recommended',
    focus_knowledge_ids: [knowledgeId],
    linked_step_ids: [],
    evidence_targets: ['完成 1 次课堂', '完成 1 轮验证', '完成回写'],
    next_action: selectionContext?.recommended_action ?? `开始 ${knowledgeName}`,
    validation_question: {
      question_id: `draft:${knowledgeId}`,
      prompt: selectionContext?.validation_prompt ?? `${knowledgeName} 测验`,
      answer_format: 'short_answer',
      success_criteria: selectionContext?.success_criteria ?? '完成回写',
      target_knowledge_id: knowledgeId,
      target_knowledge_name: knowledgeName,
      suggested_difficulty: selectionContext?.suggested_difficulty ?? 3,
    },
  };
}

function normalizeStageKey(value?: GenerateSelectionContext['stage_key'] | null): TrainingStageKey | null {
  if (value === 'foundation' || value === 'practice' || value === 'advancement') return value;
  if (value === 'evidence') return 'practice';
  return null;
}

function statusScore(status: Stage['status']): number {
  switch (status) {
    case 'completed': return 92;
    case 'in_progress': return 70;
    case 'needs_review': return 48;
    case 'recommended': return 42;
  }
}
