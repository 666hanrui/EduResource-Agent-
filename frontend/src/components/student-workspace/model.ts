export interface GenerateSelectionContext {
  source: 'manual' | 'exploration';
  reason: string;
  suggested_difficulty?: number;
  stage_key?: 'foundation' | 'practice' | 'advancement' | 'evidence';
  stage_title?: string;
  validation_prompt?: string;
  success_criteria?: string;
  recommended_action?: string;
}

export type StudentPage = 'exploration' | 'training-plan' | 'classroom' | 'progress';
export type TrainingStageKey = 'foundation' | 'practice' | 'advancement';
export type InteractiveClassroomStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type LearningLifecycleKey = 'profile' | 'breadth' | 'interest' | 'depth' | 'validation';
export type LearningLifecycleStatus = 'complete' | 'active' | 'ready' | 'locked' | 'review';
export type LearningResourceClusterKey = LearningLifecycleKey | 'evidence';

export interface InteractiveClassroomJob {
  job_id: string;
  student_id: string;
  resource_package_id: string;
  openmaic_job_id: string;
  status: InteractiveClassroomStatus;
  classroom_url: string | null;
  package_url: string;
  message: string;
  created_at: string;
  updated_at: string;
}

export interface StudentGrowthReport {
  id: string;
  student_id: string;
  report_type: 'student_growth';
  title: string;
  content_markdown: string;
  source_json: Record<string, unknown>;
  created_at: string;
}

export interface StudentDashboard {
  profile: {
    student_id?: string;
    professional_background?: string;
    knowledge_mastery?: Record<string, number>;
    learning_goal?: string;
    learning_style?: string;
    mistake_points?: string[];
    resource_preference?: string[];
    learning_pace?: string;
    current_progress?: Record<string, unknown>;
    updated_at?: string;
  } | null;
  learning_path: {
    path_id?: string;
    title?: string;
    steps?: Array<{
      step_id?: string;
      title?: string;
      target_knowledge_id?: string;
      package_id?: string | null;
      evaluation_id?: string | null;
      mastery_before?: number;
      mastery_after?: number;
      status?: string;
      evidence?: string;
      updated_reason?: string;
    }>;
    adjustment_history?: Array<Record<string, unknown>>;
  } | null;
  training_plan:
    | {
        plan_id: string;
        title: string;
        summary: string;
        stages: Array<{
          stage_id: string;
          key: 'foundation' | 'practice' | 'advancement';
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
        }>;
      }
    | null;
  recent_packages: Array<{ id: string; title: string; status: string }>;
  recent_evaluations: Array<{ id: string; package_id: string; mastery_delta_json?: Record<string, unknown>; feedback_markdown?: string }>;
  next_suggestions: string[];
}

type TrainingPlanStage = NonNullable<StudentDashboard['training_plan']>['stages'][number];

export interface LearningLifecycleStage {
  key: LearningLifecycleKey;
  label: string;
  subtitle: string;
  score: number;
  status: LearningLifecycleStatus;
  route: StudentPage;
  routeStage?: TrainingStageKey | null;
  validationTitle: string;
  validationPrompt: string;
  resourceCount: number;
}

export interface LearningResourceNode {
  id: string;
  title: string;
  label: string;
  parentLabel: string;
  score: number;
  status: LearningLifecycleStatus;
  action: string;
  evidence: string;
}

export interface LearningResourceCluster {
  key: LearningResourceClusterKey;
  title: string;
  description: string;
  score: number;
  nodes: LearningResourceNode[];
}

export interface LearningSystemMetric {
  label: string;
  value: string;
  detail: string;
}

export interface StudentLearningSystem {
  currentStage: LearningLifecycleStage;
  stages: LearningLifecycleStage[];
  resourceClusters: LearningResourceCluster[];
  metrics: LearningSystemMetric[];
  primaryAction: {
    label: string;
    detail: string;
    route: StudentPage;
    routeStage?: TrainingStageKey | null;
  };
  focus: {
    knowledgeId: string;
    knowledgeName: string;
    stageTitle: string;
    reason: string;
    score: number;
  };
  validationQuestion: {
    title: string;
    prompt: string;
    successCriteria: string;
    difficulty: number;
  };
  masteryTop: Array<{ id: string; value: number }>;
  suggestions: string[];
}

export interface ClassroomFlowStep {
  id: string;
  title: string;
  owner: string;
  endpoint: string;
  status: 'ready' | 'running' | 'done' | 'error';
  summary: string;
}

export const INTERACTIVE_STATUS_LABELS: Record<InteractiveClassroomStatus, string> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
};

export function buildStudentLearningSystem({
  dashboard,
  knowledgeId,
  knowledgeName,
  selectionContext,
  interactiveJob,
  estimatedMastery,
  activePage,
  activeTrainingStage,
}: {
  dashboard: StudentDashboard | null;
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  interactiveJob: InteractiveClassroomJob | null;
  estimatedMastery?: number;
  activePage: StudentPage;
  activeTrainingStage: TrainingStageKey | null;
}): StudentLearningSystem {
  const trainingStages = dashboard?.training_plan?.stages ?? [];
  const contextualStageKey = normalizeTrainingStageKey(selectionContext?.stage_key);
  const contextualSelectionActive =
    selectionContext?.source === 'exploration'
    && (!activeTrainingStage || !contextualStageKey || activeTrainingStage === contextualStageKey);
  const activeSelectionContext = contextualSelectionActive ? selectionContext : null;
  const selectedStageKey = activeTrainingStage ?? contextualStageKey;
  const dashboardActiveTraining =
    (selectedStageKey && trainingStages.find((stage) => stage.key === selectedStageKey))
    ?? trainingStages.find((stage) => stage.status === 'in_progress')
    ?? trainingStages.find((stage) => stage.status === 'needs_review')
    ?? trainingStages[0];
  const activeTraining = buildContextualTrainingStage({
    fallback: dashboardActiveTraining,
    knowledgeId,
    knowledgeName,
    selectionContext,
    stageKey: selectedStageKey,
  }) ?? dashboardActiveTraining;
  const masteryTop = Object.entries(dashboard?.profile?.knowledge_mastery ?? {})
    .map(([id, value]) => ({ id, value: normalizeScore(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const mistakeCount = dashboard?.profile?.mistake_points?.length ?? 0;
  const packageCount = dashboard?.recent_packages?.length ?? 0;
  const evaluationCount = dashboard?.recent_evaluations?.length ?? 0;
  const completedStageCount = trainingStages.filter((stage) => stage.status === 'completed').length;
  const currentProgressCount = Object.keys(dashboard?.profile?.current_progress ?? {}).length;

  const profileScore = clampScore(
    (dashboard?.profile ? 38 : 18)
      + masteryTop.length * 9
      + Math.min(currentProgressCount, 4) * 5
      + (mistakeCount > 0 ? 8 : 0),
  );
  const breadthScore = clampScore(
    24
      + Math.min(packageCount, 5) * 8
      + Math.min(dashboard?.next_suggestions?.length ?? 0, 4) * 5
      + (trainingStages.length > 0 ? 16 : 0),
  );
  const interestScore = clampScore(
    26
      + (selectionContext?.source === 'exploration' ? 34 : 0)
      + (activeTraining ? 14 : 0)
      + Math.min(completedStageCount, 2) * 8,
  );
  const depthScore = clampScore(
    (activeTraining ? scoreTrainingStatus(activeTraining.status) : 22)
      + Math.min(trainingStages.length, 3) * 5
      + (hasUsableMastery(estimatedMastery) ? Math.round(estimatedMastery * 0.24) : 0),
  );
  const validationScore = clampScore(
    evaluationCount * 24
      + (interactiveJob ? scoreInteractiveStatus(interactiveJob.status) : 16)
      + (hasUsableMastery(estimatedMastery) ? Math.round(estimatedMastery * 0.35) : 0),
  );

  const activeLifecycleKey = resolveActiveLifecycleKey({
    activePage,
    activeTrainingStage,
    selectionContext,
    dashboard,
    interactiveJob,
  });
  const stageScores: Record<LearningLifecycleKey, number> = {
    profile: profileScore,
    breadth: breadthScore,
    interest: interestScore,
    depth: depthScore,
    validation: validationScore,
  };
  const resourceCounts: Record<LearningLifecycleKey, number> = {
    profile: Math.max(masteryTop.length + mistakeCount, 1),
    breadth: Math.max(packageCount + (dashboard?.next_suggestions?.length ?? 0), 1),
    interest: Math.max((selectionContext ? 1 : 0) + trainingStages.length, 1),
    depth: Math.max(trainingStages.reduce((sum, stage) => sum + stage.focus_knowledge_ids.length, 0), 1),
    validation: Math.max(evaluationCount + (interactiveJob ? 1 : 0), 1),
  };
  const validationPrompt =
    activeTraining?.validation_question.prompt
    ?? selectionContext?.validation_prompt
    ?? `用一个例子验证你是否真正理解「${knowledgeName}」。`;
  const successCriteria =
    activeTraining?.validation_question.success_criteria
    ?? selectionContext?.success_criteria
    ?? '能说清概念、完成练习，并把结果回写到画像。';

  const stages: LearningLifecycleStage[] = [
    {
      key: 'profile',
      label: '画像定标',
      subtitle: '专业、兴趣、掌握度',
      score: profileScore,
      status: lifecycleStatus('profile', activeLifecycleKey, profileScore),
      route: 'exploration',
      validationTitle: '画像是否完整',
      validationPrompt: '能否说明当前专业背景、目标和至少一个兴趣方向？',
      resourceCount: resourceCounts.profile,
    },
    {
      key: 'breadth',
      label: '广度探索',
      subtitle: '专业地图与方向',
      score: breadthScore,
      status: lifecycleStatus('breadth', activeLifecycleKey, breadthScore),
      route: 'exploration',
      validationTitle: '是否找到入口',
      validationPrompt: '是否选出了一个要进入课堂验证的知识点？',
      resourceCount: resourceCounts.breadth,
    },
    {
      key: 'interest',
      label: '兴趣收敛',
      subtitle: '从方向到阶段',
      score: interestScore,
      status: lifecycleStatus('interest', activeLifecycleKey, interestScore),
      route: 'training-plan',
      routeStage: activeTraining?.key ?? 'foundation',
      validationTitle: activeTraining?.validation_question.target_knowledge_name ?? knowledgeName,
      validationPrompt,
      resourceCount: resourceCounts.interest,
    },
    {
      key: 'depth',
      label: '深度学习',
      subtitle: '互动课堂与练习',
      score: depthScore,
      status: lifecycleStatus('depth', activeLifecycleKey, depthScore),
      route: 'classroom',
      validationTitle: activeTraining?.title ?? '课堂验证',
      validationPrompt,
      resourceCount: resourceCounts.depth,
    },
    {
      key: 'validation',
      label: '证据回写',
      subtitle: '评估、画像、路径',
      score: validationScore,
      status: lifecycleStatus('validation', activeLifecycleKey, validationScore),
      route: 'progress',
      validationTitle: '回写是否完成',
      validationPrompt: successCriteria,
      resourceCount: resourceCounts.validation,
    },
  ];

  const currentStage = stages.find((stage) => stage.key === activeLifecycleKey) ?? stages[0];
  const suggestions = dashboard?.next_suggestions?.length
    ? dashboard.next_suggestions
    : [selectionContext?.recommended_action ?? '先生成一次专业探索，再进入互动课堂验证。'];

  return {
    currentStage,
    stages,
    resourceClusters: buildResourceClusters({ stages, dashboard, selectionContext, knowledgeId, knowledgeName }),
    metrics: [
      { label: '画像项', value: String(profileScore), detail: 'Profile readiness' },
      { label: '路径步骤', value: String(dashboard?.learning_path?.steps?.length ?? 0), detail: 'Learning path steps' },
      { label: '资源包', value: String(packageCount), detail: 'Persisted packages' },
      { label: '评估记录', value: String(evaluationCount), detail: 'Evidence records' },
    ],
    primaryAction: buildPrimaryAction(currentStage, activeTraining, selectionContext),
    focus: {
      knowledgeId: activeTraining?.validation_question.target_knowledge_id ?? knowledgeId,
      knowledgeName: activeTraining?.validation_question.target_knowledge_name ?? knowledgeName,
      stageTitle: activeTraining?.title ?? selectionContext?.stage_title ?? '课堂验证',
      reason: selectionContext?.reason ?? suggestions[0] ?? '等待探索结果',
      score: currentStage.score,
    },
    validationQuestion: {
      title: activeTraining?.validation_question.target_knowledge_name ?? knowledgeName,
      prompt: validationPrompt,
      successCriteria,
      difficulty: activeTraining?.validation_question.suggested_difficulty ?? selectionContext?.suggested_difficulty ?? 3,
    },
    masteryTop,
    suggestions,
  };
}

function buildContextualTrainingStage({
  fallback,
  knowledgeId,
  knowledgeName,
  selectionContext,
  stageKey,
}: {
  fallback?: TrainingPlanStage;
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  stageKey?: TrainingStageKey | null;
}): TrainingPlanStage | null {
  if (!selectionContext) return fallback ?? null;
  const key = stageKey ?? normalizeTrainingStageKey(selectionContext.stage_key) ?? fallback?.key ?? 'practice';
  return {
    stage_id: `contextual:${key}:${knowledgeId}`,
    key,
    title: selectionContext.stage_title ?? stageTitle(key),
    horizon: fallback?.horizon ?? '当前阶段',
    goal: selectionContext.reason || fallback?.goal || `完成「${knowledgeName}」的阶段验证。`,
    summary: selectionContext.recommended_action ?? fallback?.summary ?? '由专业探索选择进入课堂验证。',
    status: 'in_progress',
    focus_knowledge_ids: [knowledgeId],
    linked_step_ids: fallback?.linked_step_ids ?? [],
    evidence_targets: fallback?.evidence_targets ?? ['完成一次课堂练习', '记录评估反馈'],
    next_action: selectionContext.recommended_action ?? fallback?.next_action ?? '进入课堂验证',
    validation_question: {
      question_id: `contextual:${knowledgeId}`,
      prompt: selectionContext.validation_prompt ?? `用一个例子解释「${knowledgeName}」。`,
      answer_format: fallback?.validation_question.answer_format ?? 'short_answer',
      success_criteria: selectionContext.success_criteria ?? fallback?.validation_question.success_criteria ?? '能够完成练习并说明原因。',
      target_knowledge_id: knowledgeId,
      target_knowledge_name: knowledgeName,
      suggested_difficulty: selectionContext.suggested_difficulty ?? fallback?.validation_question.suggested_difficulty ?? 3,
    },
  };
}

function buildResourceClusters({
  stages,
  dashboard,
  selectionContext,
  knowledgeId,
  knowledgeName,
}: {
  stages: LearningLifecycleStage[];
  dashboard: StudentDashboard | null;
  selectionContext: GenerateSelectionContext | null;
  knowledgeId: string;
  knowledgeName: string;
}): LearningResourceCluster[] {
  const pathSteps = dashboard?.learning_path?.steps ?? [];
  return [
    {
      key: 'profile',
      title: '画像资源',
      description: '专业背景、掌握度、偏好和薄弱点。',
      score: stages[0].score,
      nodes: Object.entries(dashboard?.profile?.knowledge_mastery ?? {}).slice(0, 4).map(([id, value]) => ({
        id,
        title: id,
        label: `${normalizeScore(value)}%`,
        parentLabel: 'knowledge_mastery',
        score: normalizeScore(value),
        status: normalizeScore(value) > 70 ? 'complete' : 'review',
        action: '作为课堂难度依据',
        evidence: 'StudentProfile.knowledge_mastery',
      })),
    },
    {
      key: 'interest',
      title: '兴趣入口',
      description: '从探索方向沉淀到可验证知识点。',
      score: stages[2].score,
      nodes: [
        {
          id: knowledgeId,
          title: knowledgeName,
          label: selectionContext?.stage_title ?? '当前焦点',
          parentLabel: selectionContext?.source ?? 'manual',
          score: stages[2].score,
          status: 'active',
          action: selectionContext?.recommended_action ?? '进入课堂验证',
          evidence: selectionContext?.reason ?? '用户手动选择',
        },
      ],
    },
    {
      key: 'depth',
      title: '路径步骤',
      description: '培养方案中的真实 LearningPathStep。',
      score: stages[3].score,
      nodes: pathSteps.slice(0, 6).map((step, index) => ({
        id: step.step_id ?? step.package_id ?? `step-${index}`,
        title: step.title ?? step.target_knowledge_id ?? step.package_id ?? `步骤 ${index + 1}`,
        label: step.status ?? 'pending',
        parentLabel: step.package_id ? 'ResourcePackage' : 'LearningPath',
        score: normalizeScore(step.mastery_after ?? 0),
        status: step.status === 'done' ? 'complete' : step.status === 'adjusted' ? 'review' : 'active',
        action: step.updated_reason ?? '等待课堂回写',
        evidence: step.evidence ?? step.evaluation_id ?? '',
      })),
    },
    {
      key: 'evidence',
      title: '评估证据',
      description: '课堂测验与 EvaluationRecord。',
      score: stages[4].score,
      nodes: (dashboard?.recent_evaluations ?? []).slice(0, 5).map((evaluation) => ({
        id: evaluation.id,
        title: evaluation.package_id,
        label: 'EvaluationRecord',
        parentLabel: 'OpenMAIC writeback',
        score: normalizeScore(Number(evaluation.mastery_delta_json?.estimated_mastery ?? 0) * 100),
        status: 'review',
        action: evaluation.feedback_markdown ?? '查看评估反馈',
        evidence: evaluation.id,
      })),
    },
  ];
}

function buildPrimaryAction(
  currentStage: LearningLifecycleStage,
  activeTraining?: TrainingPlanStage,
  selectionContext?: GenerateSelectionContext | null,
): StudentLearningSystem['primaryAction'] {
  if (currentStage.key === 'profile' || currentStage.key === 'breadth') {
    return { label: '生成探索地图', detail: '更新画像和路径', route: 'exploration' };
  }
  if (currentStage.key === 'interest') {
    return {
      label: '打开培养方案',
      detail: activeTraining?.next_action ?? selectionContext?.recommended_action ?? '查看阶段任务',
      route: 'training-plan',
      routeStage: activeTraining?.key ?? normalizeTrainingStageKey(selectionContext?.stage_key) ?? 'practice',
    };
  }
  if (currentStage.key === 'depth') {
    return { label: '进入课堂验证', detail: '生成互动课堂', route: 'classroom' };
  }
  return { label: '查看回写证据', detail: '生成成长报告', route: 'progress' };
}

function resolveActiveLifecycleKey({
  activePage,
  activeTrainingStage,
  selectionContext,
  dashboard,
  interactiveJob,
}: {
  activePage: StudentPage;
  activeTrainingStage: TrainingStageKey | null;
  selectionContext: GenerateSelectionContext | null;
  dashboard: StudentDashboard | null;
  interactiveJob: InteractiveClassroomJob | null;
}): LearningLifecycleKey {
  if (activePage === 'classroom') return 'depth';
  if (activePage === 'progress') return 'validation';
  if (activePage === 'training-plan') return activeTrainingStage ? 'depth' : 'interest';
  if (selectionContext?.source === 'exploration') return 'interest';
  if (dashboard?.profile) return 'breadth';
  if (interactiveJob) return 'validation';
  return 'profile';
}

function lifecycleStatus(key: LearningLifecycleKey, active: LearningLifecycleKey, score: number): LearningLifecycleStatus {
  if (key === active) return 'active';
  if (score >= 70) return 'complete';
  if (score >= 45) return 'ready';
  if (score >= 28) return 'review';
  return 'locked';
}

function scoreTrainingStatus(status?: TrainingPlanStage['status']): number {
  if (status === 'completed') return 70;
  if (status === 'in_progress') return 54;
  if (status === 'needs_review') return 46;
  return 34;
}

function scoreInteractiveStatus(status?: InteractiveClassroomStatus): number {
  if (status === 'succeeded') return 54;
  if (status === 'running') return 36;
  if (status === 'queued') return 24;
  if (status === 'failed') return 18;
  return 0;
}

function hasUsableMastery(value?: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeScore(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return clampScore(numeric);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeTrainingStageKey(value?: GenerateSelectionContext['stage_key'] | null): TrainingStageKey | null {
  if (value === 'foundation' || value === 'practice' || value === 'advancement') return value;
  if (value === 'evidence') return 'practice';
  return null;
}

function stageTitle(key: TrainingStageKey): string {
  if (key === 'foundation') return '基础定标';
  if (key === 'advancement') return '进阶迁移';
  return '课堂练习';
}
