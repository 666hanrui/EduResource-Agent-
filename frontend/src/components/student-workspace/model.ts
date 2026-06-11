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

export interface StudentDashboard {
  profile: { knowledge_mastery?: Record<string, number>; mistake_points?: string[]; current_progress?: Record<string, unknown> } | null;
  learning_path: { steps?: Array<{ package_id?: string | null; evaluation_id?: string | null; mastery_after?: number; status?: string; updated_reason?: string }> } | null;
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
      label: '人物画像',
      subtitle: '基础、偏好、短板先定标',
      score: profileScore,
      status: resolveLifecycleStatus('profile', activeLifecycleKey, profileScore, []),
      route: 'exploration',
      validationTitle: '画像验证题',
      validationPrompt: '用 3 个学习经历说明：你更适合项目驱动、概念推导，还是工具应用？',
      resourceCount: resourceCounts.profile,
    },
    {
      key: 'breadth',
      label: '广度学习',
      subtitle: '横向扫方向，不急着钻深',
      score: breadthScore,
      status: resolveLifecycleStatus('breadth', activeLifecycleKey, breadthScore, [profileScore]),
      route: 'exploration',
      validationTitle: '广度验证题',
      validationPrompt: '从两个方向中选一个对比：它们分别需要哪些核心能力和作品证据？',
      resourceCount: resourceCounts.breadth,
    },
    {
      key: 'interest',
      label: '兴趣定位',
      subtitle: '用任务证据锁定方向',
      score: interestScore,
      status: resolveLifecycleStatus('interest', activeLifecycleKey, interestScore, [profileScore, breadthScore]),
      route: 'training-plan',
      routeStage: activeTraining?.key ?? 'foundation',
      validationTitle: '兴趣验证题',
      validationPrompt: selectionContext?.reason ?? '说明你为什么想继续这个方向，并给出一个可观察的证据。',
      resourceCount: resourceCounts.interest,
    },
    {
      key: 'depth',
      label: '深度学习',
      subtitle: '按阶段补能力和作品',
      score: depthScore,
      status: resolveLifecycleStatus('depth', activeLifecycleKey, depthScore, [interestScore]),
      route: 'training-plan',
      routeStage: activeTraining?.key ?? 'foundation',
      validationTitle: activeTraining?.title ?? '阶段验证题',
      validationPrompt,
      resourceCount: resourceCounts.depth,
    },
    {
      key: 'validation',
      label: '课堂验证',
      subtitle: '做题、产物、回写画像',
      score: validationScore,
      status: resolveLifecycleStatus('validation', activeLifecycleKey, validationScore, [depthScore]),
      route: interactiveJob?.status === 'succeeded' || evaluationCount > 0 ? 'progress' : 'classroom',
      validationTitle: '回写验证题',
      validationPrompt,
      resourceCount: resourceCounts.validation,
    },
  ];
  const currentStage = stages.find((stage) => stage.key === activeLifecycleKey) ?? stages[0];
  const focusScore = clampScore(
    hasUsableMastery(estimatedMastery)
      ? estimatedMastery
      : activeTraining
        ? scoreTrainingStatus(activeTraining.status)
        : selectionContext?.suggested_difficulty
          ? selectionContext.suggested_difficulty * 18
          : 46,
  );
  const primaryRoute =
    currentStage.key === 'profile' || currentStage.key === 'breadth'
      ? 'exploration'
      : currentStage.key === 'validation'
        ? currentStage.route
        : 'training-plan';

  return {
    currentStage,
    stages,
    resourceClusters: buildResourceClusters({
      dashboard,
      knowledgeId,
      knowledgeName,
      selectionContext: activeSelectionContext,
      interactiveJob,
      estimatedMastery,
      activeTraining,
      scores: stageScores,
    }),
    metrics: [
      {
        label: '体系成熟度',
        value: `${Math.round((profileScore + breadthScore + interestScore + depthScore + validationScore) / 5)}%`,
        detail: '画像、广度、兴趣、深度、验证的平均准备度',
      },
      {
        label: '资源节点',
        value: String(Object.values(resourceCounts).reduce((sum, count) => sum + count, 0)),
        detail: '按上下级关系重新组织，不再散落',
      },
      {
        label: '阶段证据',
        value: `${completedStageCount}/${Math.max(trainingStages.length, 1)}`,
        detail: evaluationCount > 0 ? `${evaluationCount} 次回写` : '等待课堂验证',
      },
    ],
    primaryAction: {
      label: resolvePrimaryActionLabel(currentStage.key),
      detail: activeTraining?.next_action ?? selectionContext?.recommended_action ?? '先完成当前阶段验证，再进入下一层级。',
      route: primaryRoute,
      routeStage: primaryRoute === 'training-plan' ? activeTraining?.key ?? 'foundation' : null,
    },
    focus: {
      knowledgeId,
      knowledgeName,
      stageTitle: activeSelectionContext?.stage_title ?? activeTraining?.title ?? currentStage.label,
      reason: activeSelectionContext?.reason ?? activeTraining?.goal ?? '从画像和探索结果中选择当前焦点。',
      score: focusScore,
    },
    validationQuestion: {
      title: activeTraining?.title ?? selectionContext?.stage_title ?? currentStage.validationTitle,
      prompt: validationPrompt,
      successCriteria,
      difficulty:
        activeTraining?.validation_question.suggested_difficulty
        ?? selectionContext?.suggested_difficulty
        ?? 3,
    },
    masteryTop,
    suggestions: buildContextualSuggestions({
      dashboardSuggestions: dashboard?.next_suggestions ?? [],
      knowledgeName,
      selectionContext: activeSelectionContext,
      activeTraining,
    }),
  };
}

export function buildClassroomFlow({
  knowledgeName,
  interactiveJob,
  hasEvaluation,
}: {
  knowledgeName: string;
  interactiveJob: InteractiveClassroomJob | null;
  hasEvaluation: boolean;
}): ClassroomFlowStep[] {
  const generationStatus =
    interactiveJob?.status === 'failed'
      ? 'error'
      : interactiveJob?.status === 'succeeded'
        ? 'done'
        : interactiveJob
          ? 'running'
          : 'ready';

  const writebackStatus =
    hasEvaluation
      ? 'done'
      : interactiveJob?.status === 'failed'
        ? 'error'
        : interactiveJob?.status === 'succeeded'
          ? 'running'
          : interactiveJob
            ? 'ready'
            : 'ready';

  return [
    {
      id: 'student-select',
      title: `选题 · ${knowledgeName}`,
      owner: 'Student UI',
      endpoint: '#/student',
      status: 'done',
      summary: '已选择',
    },
    {
      id: 'fastapi-request',
      title: '提交课堂',
      owner: 'FastAPI',
      endpoint: 'POST /api/students/{student_id}/interactive-classrooms',
      status: interactiveJob ? 'done' : 'ready',
      summary: '创建任务',
    },
    {
      id: 'openmaic-generate',
      title: '生成课堂',
      owner: 'OpenMAIC',
      endpoint: 'POST /api/generate-classroom',
      status: generationStatus,
      summary: interactiveJob
        ? `${INTERACTIVE_STATUS_LABELS[interactiveJob.status]} · Job ${interactiveJob.openmaic_job_id}`
        : '等待生成',
    },
    {
      id: 'resource-writeback',
      title: '资源回写',
      owner: 'OpenMAIC -> EduResource',
      endpoint: 'POST /api/integrations/openmaic/resource-package',
      status: writebackStatus,
      summary: interactiveJob
        ? '回写资源包'
        : '待回写',
    },
    {
      id: 'attempt-writeback',
      title: '评估回写',
      owner: 'EduResource',
      endpoint: 'POST /api/integrations/openmaic/exercise-attempts',
      status: hasEvaluation ? 'done' : interactiveJob?.status === 'succeeded' ? 'ready' : 'ready',
      summary: hasEvaluation
        ? '已回写画像'
        : '待测验',
    },
  ];
}

function buildResourceClusters({
  dashboard,
  knowledgeId,
  knowledgeName,
  selectionContext,
  interactiveJob,
  estimatedMastery,
  activeTraining,
  scores,
}: {
  dashboard: StudentDashboard | null;
  knowledgeId: string;
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  interactiveJob: InteractiveClassroomJob | null;
  estimatedMastery?: number;
  activeTraining?: NonNullable<StudentDashboard['training_plan']>['stages'][number];
  scores: Record<LearningLifecycleKey, number>;
}): LearningResourceCluster[] {
  const masteryNodes = Object.entries(dashboard?.profile?.knowledge_mastery ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([id, value]) =>
      buildResourceNode({
        id: `profile:${id}`,
        title: id,
        label: '画像掌握',
        parentLabel: '人物画像',
        score: normalizeScore(value),
        status: normalizeScore(value) >= 72 ? 'complete' : 'review',
        action: normalizeScore(value) >= 72 ? '可作为优势节点' : '需要补一次验证',
        evidence: `${normalizeScore(value)}% 掌握度`,
      }),
    );
  const mistakeNodes = (dashboard?.profile?.mistake_points ?? []).slice(0, 3).map((item, index) =>
    buildResourceNode({
      id: `mistake:${index}`,
      title: item,
      label: '薄弱点',
      parentLabel: '人物画像',
      score: 42,
      status: 'review',
      action: '纳入下一轮验证题',
      evidence: '来自错题/回写',
    }),
  );
  const packageNodes = (dashboard?.recent_packages ?? []).slice(0, 5).map((item) =>
    buildResourceNode({
      id: `package:${item.id}`,
      title: item.title,
      label: '资源包',
      parentLabel: '广度学习',
      score: scorePackageStatus(item.status),
      status: item.status === 'completed' || item.status === 'succeeded' ? 'complete' : 'ready',
      action: item.status === 'completed' || item.status === 'succeeded' ? '沉淀为证据' : '打开并完成',
      evidence: item.status,
    }),
  );
  const suggestionNodes = (dashboard?.next_suggestions ?? []).slice(0, 3).map((item, index) =>
    buildResourceNode({
      id: `suggestion:${index}`,
      title: item,
      label: '推荐动作',
      parentLabel: '广度学习',
      score: 58 + index * 5,
      status: index === 0 ? 'active' : 'ready',
      action: '转成一个学习任务',
      evidence: '系统建议',
    }),
  );
  const stageNodes = (dashboard?.training_plan?.stages ?? []).map((stage, index) =>
    buildResourceNode({
      id: `stage:${stage.stage_id}`,
      title: stage.title,
      label: `阶段 ${index + 1}`,
      parentLabel: stage.key === 'foundation' ? '兴趣定位' : '深度学习',
      score: scoreTrainingStatus(stage.status),
      status: stage.status === 'completed'
        ? 'complete'
        : stage.status === 'needs_review'
          ? 'review'
          : stage.status === 'in_progress'
            ? 'active'
            : 'ready',
      action: stage.next_action,
      evidence: `${stage.focus_knowledge_ids.length || 1} 个知识焦点`,
    }),
  );
  const focusNode = buildResourceNode({
    id: `focus:${knowledgeId}`,
    title: knowledgeName,
    label: '当前焦点',
    parentLabel: selectionContext?.stage_title ?? activeTraining?.title ?? '兴趣定位',
    score:
      typeof estimatedMastery === 'number'
        ? estimatedMastery
        : selectionContext?.suggested_difficulty
          ? selectionContext.suggested_difficulty * 18
          : 54,
    status: interactiveJob ? 'active' : 'ready',
    action: selectionContext?.recommended_action ?? activeTraining?.next_action ?? '启动阶段验证',
    evidence: selectionContext?.reason ?? '当前选中知识点',
  });
  const evaluationNodes = (dashboard?.recent_evaluations ?? []).slice(0, 4).map((item, index) => {
    const delta = item.mastery_delta_json ?? {};
    const rawMastery = delta.estimated_mastery;
    const mastery = typeof rawMastery === 'number' ? Math.round(rawMastery * 100) : 68 - index * 4;
    return buildResourceNode({
      id: `evaluation:${item.id}`,
      title: String(delta.knowledge_name ?? delta.knowledge_id ?? item.package_id),
      label: '回写评估',
      parentLabel: '课堂验证',
      score: mastery,
      status: mastery >= 72 ? 'complete' : 'review',
      action: mastery >= 72 ? '推进下一阶段' : '回到阶段复盘',
      evidence: item.feedback_markdown ? compactText(item.feedback_markdown, 24) : item.package_id,
    });
  });
  const classroomNode = interactiveJob
    ? buildResourceNode({
        id: `classroom:${interactiveJob.job_id}`,
        title: knowledgeName,
        label: '互动课堂',
        parentLabel: '课堂验证',
        score: scoreInteractiveStatus(interactiveJob.status),
        status:
          interactiveJob.status === 'succeeded'
            ? 'complete'
            : interactiveJob.status === 'failed'
              ? 'review'
              : 'active',
        action: interactiveJob.message || '等待课堂生成',
        evidence: interactiveJob.resource_package_id,
      })
    : null;

  return [
    {
      key: 'profile',
      title: '画像层',
      description: '学生是谁、强弱项在哪里',
      score: scores.profile,
      nodes: withFallbackNodes([...masteryNodes, ...mistakeNodes], {
        id: 'profile:empty',
        title: '等待画像回写',
        label: '画像',
        parentLabel: '人物画像',
        score: scores.profile,
        status: 'ready',
        action: '先生成探索计划',
        evidence: '暂无画像数据',
      }),
    },
    {
      key: 'breadth',
      title: '广度层',
      description: '资源包、建议和方向入口',
      score: scores.breadth,
      nodes: withFallbackNodes([...packageNodes, ...suggestionNodes], {
        id: 'breadth:empty',
        title: '广度探索待启动',
        label: '探索',
        parentLabel: '广度学习',
        score: scores.breadth,
        status: 'ready',
        action: '生成专业探索计划',
        evidence: '等待推荐资源',
      }),
    },
    {
      key: 'interest',
      title: '兴趣层',
      description: '把喜欢的方向收敛成任务',
      score: scores.interest,
      nodes: withFallbackNodes([focusNode, ...stageNodes.filter((node) => node.parentLabel === '兴趣定位')], focusNode),
    },
    {
      key: 'depth',
      title: '深度层',
      description: '基础、实践、进阶逐层推进',
      score: scores.depth,
      nodes: withFallbackNodes(stageNodes.filter((node) => node.parentLabel === '深度学习'), {
        id: 'depth:empty',
        title: activeTraining?.title ?? '等待培养方案',
        label: '深度学习',
        parentLabel: '深度学习',
        score: scores.depth,
        status: activeTraining ? 'active' : 'locked',
        action: activeTraining?.next_action ?? '先从探索推荐进入培养方案',
        evidence: activeTraining?.validation_question.prompt ?? '暂无阶段题',
      }),
    },
    {
      key: 'evidence',
      title: '证据层',
      description: '课堂、测验、评估回写',
      score: scores.validation,
      nodes: withFallbackNodes([...evaluationNodes, ...(classroomNode ? [classroomNode] : [])], {
        id: 'evidence:empty',
        title: '等待课堂证据',
        label: '证据',
        parentLabel: '课堂验证',
        score: scores.validation,
        status: 'ready',
        action: '进入课堂做一次验证',
        evidence: '暂无回写',
      }),
    },
  ];
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
  stageKey: TrainingStageKey | null;
}): TrainingPlanStage | null {
  if (selectionContext?.source !== 'exploration') return null;
  const contextualStageKey = normalizeTrainingStageKey(selectionContext.stage_key);
  const key = stageKey ?? contextualStageKey ?? fallback?.key ?? 'foundation';
  const isRecommendedStage = !contextualStageKey || key === contextualStageKey;
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
        ? selectionContext.reason ?? fallback?.summary ?? `${knowledgeName} 的当前阶段验证。`
        : `${knowledgeName} 的${title}验证入口。`,
    status: fallback?.status === 'completed' ? 'needs_review' : fallback?.status ?? 'in_progress',
    focus_knowledge_ids: [knowledgeId],
    linked_step_ids: fallback?.linked_step_ids ?? [],
    evidence_targets:
      fallback?.evidence_targets?.length
        ? fallback.evidence_targets
        : evidenceTargetsForKey(key),
    next_action:
      isRecommendedStage && selectionContext.recommended_action
        ? selectionContext.recommended_action
        : stageNextActionForKey(key, knowledgeName),
    validation_question: {
      question_id: `contextual:${knowledgeId}:${key}`,
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

function answerFormatForKey(key: TrainingStageKey): TrainingPlanStage['validation_question']['answer_format'] {
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

function buildContextualSuggestions({
  dashboardSuggestions,
  knowledgeName,
  selectionContext,
  activeTraining,
}: {
  dashboardSuggestions: string[];
  knowledgeName: string;
  selectionContext: GenerateSelectionContext | null;
  activeTraining?: TrainingPlanStage;
}): string[] {
  const contextual =
    selectionContext?.source === 'exploration'
      ? [
          selectionContext.recommended_action ?? `先把「${knowledgeName}」作为当前阶段验证题启动。`,
          selectionContext.validation_prompt
            ? `完成验证题：${selectionContext.validation_prompt}`
            : `围绕「${knowledgeName}」完成一次课堂验证。`,
          selectionContext.success_criteria
            ? `完成标准：${selectionContext.success_criteria}`
            : '完成后把课堂结果回写到画像。',
        ]
      : activeTraining
        ? [activeTraining.next_action]
        : [];
  const filteredDashboardSuggestions = dashboardSuggestions
    .filter((item) => !selectionContext || item.includes(knowledgeName) || !mentionsDifferentFocus(item, knowledgeName))
    .slice(0, 4);

  return Array.from(new Set([...contextual, ...filteredDashboardSuggestions])).slice(0, 4);
}

function mentionsDifferentFocus(value: string, currentKnowledgeName: string): boolean {
  const protectedTerms = ['Linked List Basics', '链表', '程序设计基础', '数据结构', 'Web 开发', 'AI 应用'];
  return protectedTerms.some((term) => term !== currentKnowledgeName && value.includes(term));
}

function buildResourceNode(node: LearningResourceNode): LearningResourceNode {
  return {
    ...node,
    score: clampScore(node.score),
  };
}

function withFallbackNodes(nodes: LearningResourceNode[], fallback: LearningResourceNode): LearningResourceNode[] {
  return nodes.length > 0 ? nodes : [buildResourceNode(fallback)];
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
  if (activePage === 'progress') return 'validation';
  if (activePage === 'classroom') return 'validation';
  if (activePage === 'training-plan') {
    const stageKey = activeTrainingStage ?? normalizeTrainingStageKey(selectionContext?.stage_key);
    return stageKey === 'foundation' ? 'interest' : 'depth';
  }
  if (interactiveJob || (dashboard?.recent_evaluations.length ?? 0) > 0) return 'validation';
  if (selectionContext?.source === 'exploration') return 'interest';
  if (dashboard?.recent_packages.length || dashboard?.training_plan) return 'breadth';
  return 'profile';
}

function resolveLifecycleStatus(
  key: LearningLifecycleKey,
  activeKey: LearningLifecycleKey,
  score: number,
  prerequisites: number[],
): LearningLifecycleStatus {
  if (key === activeKey) return score < 45 ? 'review' : 'active';
  if (score >= 78) return 'complete';
  if (prerequisites.some((value) => value < 34)) return 'locked';
  if (score < 46 && key !== 'profile') return 'ready';
  return score < 50 ? 'review' : 'ready';
}

function resolvePrimaryActionLabel(key: LearningLifecycleKey): string {
  switch (key) {
    case 'profile':
      return '完善画像';
    case 'breadth':
      return '继续广度探索';
    case 'interest':
      return '锁定兴趣方向';
    case 'depth':
      return '进入阶段学习';
    case 'validation':
      return '完成课堂验证';
  }
}

function normalizeTrainingStageKey(value?: GenerateSelectionContext['stage_key'] | null): TrainingStageKey | null {
  if (value === 'foundation' || value === 'practice' || value === 'advancement') return value;
  if (value === 'evidence') return 'practice';
  return null;
}

function scoreTrainingStatus(status: NonNullable<StudentDashboard['training_plan']>['stages'][number]['status']): number {
  switch (status) {
    case 'completed':
      return 92;
    case 'in_progress':
      return 68;
    case 'needs_review':
      return 48;
    case 'recommended':
      return 42;
  }
}

function scoreInteractiveStatus(status: InteractiveClassroomStatus): number {
  switch (status) {
    case 'succeeded':
      return 88;
    case 'running':
      return 62;
    case 'queued':
      return 48;
    case 'failed':
      return 34;
  }
}

function scorePackageStatus(status: string): number {
  const normalized = status.toLowerCase();
  if (normalized.includes('complete') || normalized.includes('succeed') || normalized.includes('done')) return 84;
  if (normalized.includes('progress') || normalized.includes('open') || normalized.includes('running')) return 62;
  if (normalized.includes('fail') || normalized.includes('review')) return 38;
  return 48;
}

function normalizeScore(value: number): number {
  return clampScore(value <= 1 ? Math.round(value * 100) : Math.round(value));
}

function hasUsableMastery(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
