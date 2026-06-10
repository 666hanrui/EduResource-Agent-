import type {
  CareerDirection,
  ExplorationLevel,
  ExplorationPlan,
  ExplorationTask,
  ExplorationWorkspace,
  KnowledgeNode,
  RecommendedKnowledge,
} from '../../types/exploration';

export const LEVEL_OPTIONS: Array<{ value: ExplorationLevel; label: string }> = [
  { value: 'beginner', label: '刚入门' },
  { value: 'basic', label: '有一点基础' },
  { value: 'intermediate', label: '做过小项目' },
];

export const PROFILE_LABELS: Record<string, string> = {
  professional_skills: '专业技能',
  professional_background: '专业背景',
  education_requirement: '学历与阶段',
  teamwork: '团队协作',
  stress_adaptability: '抗压/适应',
  communication: '沟通表达',
  work_experience: '实践经历',
  documentation_awareness: '文档规范',
  responsibility: '责任心/自我管理',
  learning_ability: '学习能力',
  problem_solving: '分析解决问题',
  other_special: '补充信息',
};

export interface ExplorationMetricCard {
  label: string;
  value: string;
  detail: string;
}

export type KnowledgeLaneKey = KnowledgeNode['category'];
export type KnowledgeNodeState =
  | 'recommended'
  | 'active'
  | 'in_progress'
  | 'completed'
  | 'candidate'
  | 'locked';

export interface KnowledgeNodeView {
  id: string;
  title: string;
  summary: string;
  difficultyLabel: string;
  prerequisites: string[];
  state: KnowledgeNodeState;
  reason: string;
  evidence: string[];
  source: RecommendedKnowledge;
}

export interface KnowledgeLaneView {
  key: KnowledgeLaneKey;
  title: string;
  description: string;
  nodes: KnowledgeNodeView[];
}

export interface KnowledgeAtlasView {
  lanes: KnowledgeLaneView[];
  metrics: ExplorationMetricCard[];
  currentFocus: KnowledgeNodeView | null;
  activeDirectionLabel: string;
}

const LANE_META: Record<KnowledgeLaneKey, { title: string; description: string }> = {
  foundation: {
    title: '基础底座',
    description: '决定你能否顺利接住后面的核心课和方向课。',
  },
  core: {
    title: '核心抽象',
    description: '把专业方法、分析能力和典型题型连起来。',
  },
  direction: {
    title: '应用方向',
    description: '把“我感兴趣”变成可验证的职业方向假设。',
  },
  practice: {
    title: '实践与证据',
    description: '项目、作品、资源完成记录都会沉淀成真实证据。',
  },
};

export function buildExplorationMetrics(
  plan: ExplorationPlan,
  workspace: ExplorationWorkspace | null,
  activeDirection: CareerDirection | null,
): ExplorationMetricCard[] {
  const completedTasks = workspace
    ? workspace.phases.reduce(
        (sum, phase) => sum + phase.tasks.filter((task) => task.status === 'done').length,
        0,
      )
    : 0;
  const totalTasks = workspace
    ? workspace.phases.reduce((sum, phase) => sum + phase.tasks.length, 0)
    : plan.exploration_tasks.length;
  const completedResources = workspace?.resources.filter((resource) => resource.status === 'completed').length ?? 0;
  const pendingDimensions = (workspace?.dimension_scores ?? plan.dimension_scores)
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((item) => item.title);

  return [
    {
      label: '知识地图',
      value: String(plan.knowledge_map.length),
      detail: `${plan.knowledge_map.filter((node) => node.category === 'direction').length} 个方向节点可继续向互动课堂转化`,
    },
    {
      label: '当前方向',
      value: activeDirection?.title ?? plan.career_directions[0]?.title ?? '待收敛',
      detail: activeDirection
        ? `${activeDirection.fit_score} 匹配度 · ${activeDirection.exploration_domain || '探索方向'}`
        : '先看候选方向，再决定是否创建工作区',
    },
    {
      label: '执行进度',
      value: `${completedTasks}/${Math.max(totalTasks, 1)}`,
      detail: workspace
        ? `已完成 ${completedResources} 条资源证据，下一步补 ${pendingDimensions.join('、') || '探索证据'}`
        : '创建工作区后，任务、资源和复盘会集中到这里',
    },
  ];
}

export function buildKnowledgeAtlas(
  plan: ExplorationPlan,
  workspace: ExplorationWorkspace | null,
  activeDirection: CareerDirection | null,
): KnowledgeAtlasView {
  const recommendedMap = new Map(plan.recommended_knowledge.map((item) => [item.knowledge_id, item]));
  const taskById = new Map(plan.exploration_tasks.map((task) => [task.id, task]));
  const completedKnowledgeIds = new Set<string>();
  const openedKnowledgeIds = new Set<string>();
  const doneTaskKnowledgeIds = new Set<string>();

  workspace?.resources.forEach((resource) => {
    if (resource.status === 'completed') completedKnowledgeIds.add(resource.knowledge_id);
    if (resource.status === 'opened') openedKnowledgeIds.add(resource.knowledge_id);
  });

  workspace?.phases.forEach((phase) => {
    phase.tasks.forEach((task) => {
      if (task.status !== 'done') return;
      const sourceTask = taskById.get(task.id);
      sourceTask?.related_knowledge_ids.forEach((knowledgeId) => doneTaskKnowledgeIds.add(knowledgeId));
    });
  });

  const isSatisfied = (knowledgeId: string): boolean =>
    completedKnowledgeIds.has(knowledgeId) ||
    openedKnowledgeIds.has(knowledgeId) ||
    doneTaskKnowledgeIds.has(knowledgeId) ||
    recommendedMap.has(knowledgeId) ||
    Boolean(activeDirection?.related_knowledge_ids.includes(knowledgeId));

  const lanes = (Object.keys(LANE_META) as KnowledgeLaneKey[]).map((laneKey) => ({
    key: laneKey,
    title: LANE_META[laneKey].title,
    description: LANE_META[laneKey].description,
    nodes: plan.knowledge_map
      .filter((node) => node.category === laneKey)
      .map((node) =>
        buildKnowledgeNodeView({
          node,
          plan,
          activeDirection,
          recommendedMap,
          completedKnowledgeIds,
          openedKnowledgeIds,
          doneTaskKnowledgeIds,
          isSatisfied,
        }),
      ),
  }));

  const currentFocus = lanes
    .flatMap((lane) => lane.nodes)
    .find((node) => node.state === 'active' || node.state === 'recommended' || node.state === 'in_progress')
    ?? lanes.flatMap((lane) => lane.nodes).find((node) => node.state !== 'locked')
    ?? null;

  return {
    lanes,
    metrics: buildExplorationMetrics(plan, workspace, activeDirection),
    currentFocus,
    activeDirectionLabel: activeDirection?.title ?? plan.career_directions[0]?.title ?? '待选择方向',
  };
}

function buildKnowledgeNodeView({
  node,
  plan,
  activeDirection,
  recommendedMap,
  completedKnowledgeIds,
  openedKnowledgeIds,
  doneTaskKnowledgeIds,
  isSatisfied,
}: {
  node: KnowledgeNode;
  plan: ExplorationPlan;
  activeDirection: CareerDirection | null;
  recommendedMap: Map<string, RecommendedKnowledge>;
  completedKnowledgeIds: Set<string>;
  openedKnowledgeIds: Set<string>;
  doneTaskKnowledgeIds: Set<string>;
  isSatisfied: (knowledgeId: string) => boolean;
}): KnowledgeNodeView {
  const fallbackSource: RecommendedKnowledge = {
    knowledge_id: node.id,
    knowledge_name: node.title,
    reason: `${node.why} 这会成为后续资源生成的知识点入口。`,
    suggested_difficulty: node.difficulty,
    stage_key: node.category === 'foundation' ? 'foundation' : node.category === 'direction' ? 'advancement' : 'practice',
    stage_title:
      node.category === 'foundation'
        ? '阶段 1 · 基础定标'
        : node.category === 'direction'
          ? '阶段 3 · 进阶迁移'
          : '阶段 2 · 课堂练习',
    validation_prompt: `围绕「${node.title}」完成一轮当前阶段验证。`,
    success_criteria: '至少形成一次有效作答、资源或任务证据。',
    recommended_action: `把「${node.title}」送入培养方案，继续推进当前阶段。`,
  };
  const source = recommendedMap.get(node.id) ?? fallbackSource;
  const relatedTask = plan.exploration_tasks.find((task) => task.related_knowledge_ids.includes(node.id));
  const state = resolveKnowledgeNodeState({
    node,
    activeDirection,
    recommendedMap,
    completedKnowledgeIds,
    openedKnowledgeIds,
    doneTaskKnowledgeIds,
    isSatisfied,
  });

  return {
    id: node.id,
    title: node.title,
    summary: node.why,
    difficultyLabel: `${node.difficulty} 星难度`,
    prerequisites: node.prerequisites.map((item) => resolveKnowledgeTitle(plan.knowledge_map, item)),
    state,
    reason: source.reason,
    evidence: buildEvidenceNotes(relatedTask, state),
    source,
  };
}

function resolveKnowledgeNodeState({
  node,
  activeDirection,
  recommendedMap,
  completedKnowledgeIds,
  openedKnowledgeIds,
  doneTaskKnowledgeIds,
  isSatisfied,
}: {
  node: KnowledgeNode;
  activeDirection: CareerDirection | null;
  recommendedMap: Map<string, RecommendedKnowledge>;
  completedKnowledgeIds: Set<string>;
  openedKnowledgeIds: Set<string>;
  doneTaskKnowledgeIds: Set<string>;
  isSatisfied: (knowledgeId: string) => boolean;
}): KnowledgeNodeState {
  if (completedKnowledgeIds.has(node.id) || doneTaskKnowledgeIds.has(node.id)) return 'completed';
  if (openedKnowledgeIds.has(node.id)) return 'in_progress';
  if (activeDirection?.related_knowledge_ids.includes(node.id)) return 'active';
  if (recommendedMap.has(node.id)) return 'recommended';
  if (node.prerequisites.length > 0 && !node.prerequisites.every(isSatisfied)) return 'locked';
  return 'candidate';
}

function buildEvidenceNotes(task: ExplorationTask | undefined, state: KnowledgeNodeState): string[] {
  const statusNote = {
    active: '当前方向正在依赖这个节点做判断',
    recommended: '系统建议优先把它转成交互课堂或轻量资源',
    in_progress: '你已经打开过相关资源，下一步是做完并回收证据',
    completed: '已经形成任务或资源证据，可继续叠加更强的实践记录',
    candidate: '可以作为下一轮深入探索的备选入口',
    locked: '先补齐前置知识，避免直接跳到高层应用',
  }[state];

  const notes = [statusNote];
  if (task) notes.push(`关联任务：${task.title}`);
  return notes;
}

function resolveKnowledgeTitle(nodes: KnowledgeNode[], knowledgeId: string): string {
  return nodes.find((item) => item.id === knowledgeId)?.title ?? knowledgeId;
}
