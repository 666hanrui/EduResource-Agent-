import { useMemo, type CSSProperties } from 'react';
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
}

interface StageView {
  stage_id: string;
  key: TrainingStageKey;
  title: string;
  horizon: string;
  goal: string;
  summary: string;
  status: 'recommended' | 'in_progress' | 'completed' | 'needs_review';
  focus_knowledge_ids: string[];
  linked_step_ids: string[];
  evidence_targets: string[];
  next_action: string;
  validation_question: {
    question_id: string;
    prompt: string;
    answer_format: 'short_answer' | 'single_choice' | 'artifact' | 'reflection';
    success_criteria: string;
    target_knowledge_id: string;
    target_knowledge_name: string;
    suggested_difficulty: number;
  };
}

const STATUS_LABELS: Record<StageView['status'], string> = {
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
}: Props) {
  const trainingPlan = studentDashboard?.training_plan;
  const stages = useMemo<StageView[]>(() => {
    const baseStages = trainingPlan?.stages ?? [buildDraftStage({ knowledgeId, knowledgeName, selectionContext })];
    const contextualStage = buildContextualStage({
      baseStages,
      knowledgeId,
      knowledgeName,
      selectionContext,
      activeStageKey,
    });
    if (!contextualStage) return baseStages;
    const hasSameStage = baseStages.some((stage) => stage.key === contextualStage.key);
    return hasSameStage
      ? baseStages.map((stage) => (stage.key === contextualStage.key ? contextualStage : stage))
      : [contextualStage, ...baseStages];
  }, [activeStageKey, knowledgeId, knowledgeName, selectionContext, trainingPlan]);
  const selectedStageKey = activeStageKey ?? normalizeStageKey(selectionContext?.stage_key);
  const activeStage =
    (selectedStageKey && stages.find((stage) => stage.key === selectedStageKey))
    ?? stages.find((stage) => stage.status === 'in_progress')
    ?? stages.find((stage) => stage.status === 'needs_review')
    ?? stages[0];
  const completedCount = stages.filter((stage) => stage.status === 'completed').length;
  const relatedClusters = learningSystem.resourceClusters.filter(
    (cluster) => cluster.key === 'interest' || cluster.key === 'depth' || cluster.key === 'evidence',
  );

  if (!activeStage) return null;

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
            <article>
              <small>阶段</small>
              <strong>{stages.length}</strong>
              <span>分层推进</span>
            </article>
            <article>
              <small>完成</small>
              <strong>{completedCount}</strong>
              <span>已形成证据</span>
            </article>
            <article>
              <small>当前</small>
              <strong>{activeStage.title}</strong>
              <span>{activeStage.horizon}</span>
            </article>
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
              aria-label={`打开${stage.title}`}
              className={isActive ? `training-stage-unit training-stage-unit--${stage.status} training-stage-unit--active` : `training-stage-unit training-stage-unit--${stage.status}`}
              onClick={() => onOpenStage(stage.key)}
            >
              <span className="training-stage-unit__index">0{index + 1}</span>
              <span className="training-stage-unit__layer">{STAGE_LAYER_LABELS[stage.key]}</span>
              <strong>{stage.title}</strong>
              <small>{stage.goal}</small>
              <span
                className="training-stage-unit__score"
                style={{ '--score': `${score}%` } as CSSProperties}
              >
                {STATUS_LABELS[stage.status]}
              </span>
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
                <article key={item}>
                  <strong>证据目标</strong>
                  <span>{item}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="training-stage-actions">
            <button
              type="button"
              className="student-primary-action student-primary-action--compact"
              onClick={() =>
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
                })
              }
            >
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
                <div>
                  <strong>{cluster.title}</strong>
                  <span>{cluster.description}</span>
                </div>
                <small>{cluster.score}%</small>
                <div className="training-resource-node-row">
                  {cluster.nodes.slice(0, 4).map((node) => (
                    <span key={node.id}>{node.title}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </section>
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
}): StageView {
  return {
    stage_id: 'draft-stage',
    key: 'foundation',
    title: selectionContext?.stage_title ?? '阶段 1 · 课堂验证',
    horizon: '立即开始',
    goal: '完成首轮验证',
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

function buildContextualStage({
  baseStages,
  knowledgeId,
  knowledgeName,
  selectionContext,
  activeStageKey,
}: {
  baseStages: StageView[];
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  activeStageKey: TrainingStageKey | null;
}): StageView | null {
  if (selectionContext?.source !== 'exploration') return null;

  const contextualStageKey = normalizeStageKey(selectionContext.stage_key);
  const key = activeStageKey ?? contextualStageKey ?? 'foundation';
  const isRecommendedStage = !contextualStageKey || key === contextualStageKey;
  const fallback = baseStages.find((stage) => stage.key === key) ?? baseStages[0];
  const title =
    isRecommendedStage
      ? selectionContext.stage_title ?? fallback?.title ?? stageTitleForKey(key)
      : fallback?.title ?? stageTitleForKey(key);
  const prompt =
    isRecommendedStage && selectionContext.validation_prompt
      ? selectionContext.validation_prompt
      : stageValidationPromptForKey(key, knowledgeName);
  const successCriteria =
    isRecommendedStage && selectionContext.success_criteria
      ? selectionContext.success_criteria
      : stageSuccessCriteriaForKey(key);

  return {
    stage_id: `contextual:${key}:${knowledgeId}`,
    key,
    title,
    horizon: fallback?.horizon ?? horizonForKey(key),
    goal: goalForKey(key, knowledgeName),
    summary:
      isRecommendedStage
        ? selectionContext.reason ?? fallback?.summary ?? `${knowledgeName} 的阶段验证入口。`
        : `${knowledgeName} 的${title}验证入口。`,
    status: fallback?.status === 'completed' ? 'needs_review' : fallback?.status ?? 'in_progress',
    focus_knowledge_ids: [knowledgeId],
    linked_step_ids: fallback?.linked_step_ids ?? [],
    evidence_targets:
      fallback?.evidence_targets.length
        ? fallback.evidence_targets
        : evidenceTargetsForKey(key),
    next_action:
      isRecommendedStage && selectionContext.recommended_action
        ? selectionContext.recommended_action
        : stageNextActionForKey(key, knowledgeName),
    validation_question: {
      question_id: `contextual:${key}:${knowledgeId}`,
      prompt,
      answer_format: fallback?.validation_question.answer_format ?? answerFormatForKey(key),
      success_criteria: successCriteria,
      target_knowledge_id: knowledgeId,
      target_knowledge_name: knowledgeName,
      suggested_difficulty:
        isRecommendedStage && selectionContext.suggested_difficulty
          ? selectionContext.suggested_difficulty
          : fallback?.validation_question.suggested_difficulty ?? difficultyForKey(key),
    },
  };
}

function stageValidationPromptForKey(key: TrainingStageKey, knowledgeName: string): string {
  switch (key) {
    case 'foundation':
      return `用自己的话解释「${knowledgeName}」解决的核心问题，并举一个最简单的例子。`;
    case 'practice':
      return `围绕「${knowledgeName}」完成一次课堂练习：做 3 道题，并说明最容易错的一步。`;
    case 'advancement':
      return `把「${knowledgeName}」迁移到一个小作品或真实场景中，写出实现思路和证据。`;
  }
}

function stageSuccessCriteriaForKey(key: TrainingStageKey): string {
  switch (key) {
    case 'foundation':
      return '能说清核心概念、适用场景，以及一个最简单的应用例子。';
    case 'practice':
      return '完成课堂练习并回写结果，能明确指出本轮最容易错的点。';
    case 'advancement':
      return '能产出一个可观察作品或方案，并说明它如何复用当前知识点。';
  }
}

function evidenceTargetsForKey(key: TrainingStageKey): string[] {
  switch (key) {
    case 'foundation':
      return ['完成 1 次基础讲解或概念复述', '记录 1 个当前最不确定的知识点'];
    case 'practice':
      return ['完成 1 次课堂练习', '形成 1 条错因或正确率回写'];
    case 'advancement':
      return ['完成 1 个迁移任务或作品草稿', '沉淀 1 条作品证据'];
  }
}

function stageNextActionForKey(key: TrainingStageKey, knowledgeName: string): string {
  switch (key) {
    case 'foundation':
      return `先把「${knowledgeName}」作为基础验证题启动。`;
    case 'practice':
      return `进入课堂练习，用题目验证「${knowledgeName}」的真实掌握。`;
    case 'advancement':
      return `把「${knowledgeName}」推进到迁移作品或真实任务。`;
  }
}

function answerFormatForKey(key: TrainingStageKey): StageView['validation_question']['answer_format'] {
  switch (key) {
    case 'foundation':
      return 'short_answer';
    case 'practice':
      return 'single_choice';
    case 'advancement':
      return 'artifact';
  }
}

function difficultyForKey(key: TrainingStageKey): number {
  switch (key) {
    case 'foundation':
      return 2;
    case 'practice':
      return 3;
    case 'advancement':
      return 4;
  }
}

function stageTitleForKey(key: TrainingStageKey): string {
  switch (key) {
    case 'foundation':
      return '阶段 1 · 基础定标';
    case 'practice':
      return '阶段 2 · 课堂练习';
    case 'advancement':
      return '阶段 3 · 进阶迁移';
  }
}

function horizonForKey(key: TrainingStageKey): string {
  switch (key) {
    case 'foundation':
      return '当前 - 2 周';
    case 'practice':
      return '2 - 4 周';
    case 'advancement':
      return '4 - 8 周';
  }
}

function goalForKey(key: TrainingStageKey, knowledgeName: string): string {
  switch (key) {
    case 'foundation':
      return `先把「${knowledgeName}」的核心概念说清楚，建立第一层掌握度基线。`;
    case 'practice':
      return `把「${knowledgeName}」推进成课堂练习，用题目和反馈验证真实掌握。`;
    case 'advancement':
      return `把「${knowledgeName}」迁移到更完整的任务或作品中。`;
  }
}

function normalizeStageKey(value?: GenerateSelectionContext['stage_key'] | null): TrainingStageKey | null {
  if (value === 'foundation' || value === 'practice' || value === 'advancement') return value;
  if (value === 'evidence') return 'practice';
  return null;
}

function statusScore(status: StageView['status']): number {
  switch (status) {
    case 'completed':
      return 92;
    case 'in_progress':
      return 70;
    case 'needs_review':
      return 48;
    case 'recommended':
      return 42;
  }
}
