import type {
  CareerDirection,
  ExplorationPlan,
  ExplorationWorkspace,
  KnowledgeNode,
  RecommendedKnowledge,
} from '../../types/exploration';
import { Badge, Chip, Muted, Probe, RowBetween, ScorePill } from './FreddiePrimitives';

interface AdventureExplorationMapProps {
  plan: ExplorationPlan;
  workspace: ExplorationWorkspace | null;
  activeDirection: CareerDirection | null;
  onUseKnowledge: (item: RecommendedKnowledge) => void;
}

type AbilityStatus = 'available' | 'current' | 'challenge' | 'done' | 'locked' | 'changed';
type AbilityZone =
  | 'foundation'
  | 'core'
  | 'direction'
  | 'practice'
  | 'evidence'
  | 'portfolio'
  | 'collaboration'
  | 'reflection';

interface AbilityMapNode {
  id: AbilityZone;
  title: string;
  subtitle: string;
  status: AbilityStatus;
  statusText: string;
  x: number;
  y: number;
  reason: string;
  source: RecommendedKnowledge;
  metric: string;
}

const MAP_BACKGROUND_SRC = '/assets/adventure-map-branching.png';

const ABILITY_LAYOUT: Record<AbilityZone, { x: number; y: number }> = {
  foundation: { x: 31, y: 51 },
  core: { x: 52, y: 42 },
  direction: { x: 63, y: 25 },
  practice: { x: 70, y: 56 },
  evidence: { x: 44, y: 72 },
  portfolio: { x: 83, y: 31 },
  collaboration: { x: 76, y: 73 },
  reflection: { x: 57, y: 80 },
};

const STATUS_LABELS: Record<AbilityStatus, string> = {
  available: '可探索',
  current: '当前推荐',
  challenge: '挑战点',
  done: '已完成',
  locked: '待解锁',
  changed: '画像变化',
};

const DIMENSION_LABELS: Record<string, string> = {
  professional_skills: '专业技能',
  professional_background: '专业背景',
  education_requirement: '学历与阶段',
  teamwork: '团队协作',
  stress_adaptability: '抗压适应',
  communication: '沟通表达',
  work_experience: '实践经历',
  documentation_awareness: '文档规范',
  responsibility: '自我管理',
  learning_ability: '学习能力',
  problem_solving: '解决问题',
  other_special: '补充信息',
};

export function AdventureExplorationMap({
  plan,
  workspace,
  activeDirection,
  onUseKnowledge,
}: AdventureExplorationMapProps) {
  const nodes = buildAbilityMapNodes(plan, workspace, activeDirection);
  const currentNode = findCurrentNode(nodes);
  const doneCount = nodes.filter((item) => item.status === 'done').length;
  const challengeCount = nodes.filter((item) => item.status === 'challenge').length;
  const changedCount = nodes.filter((item) => item.status === 'changed').length;

  return (
    <section className="adventure-map-panel">
      <div className="adventure-map-panel__header">
        <div>
          <Badge>Learning Adventure</Badge>
          <h3>学习探索地图</h3>
          <Muted>
            {activeDirection
              ? `围绕「${activeDirection.title}」生成能力区、证据区和实践区。`
              : `从 ${plan.major} 的知识图谱、方向匹配和 12 维画像动态生成。`}
          </Muted>
        </div>
        <div className="adventure-map-metrics" aria-label="探索地图统计">
          <span><strong>{nodes.length}</strong> 能力区</span>
          <span><strong>{doneCount}</strong> 完成</span>
          <span><strong>{challengeCount + changedCount}</strong> 变化</span>
        </div>
      </div>

      <div className="adventure-map-stage" aria-label="大学生能力探索地图">
        <img className="adventure-map-background" src={MAP_BACKGROUND_SRC} alt="" aria-hidden="true" />
        <div className="adventure-map-title" aria-hidden="true">
          <strong>学习探索地图</strong>
          <span>按画像、方向、任务和证据实时生成</span>
        </div>

        <div className="adventure-map-hub">
          <strong>学生当前位置</strong>
          <span>头像随任务、资源和画像证据移动</span>
        </div>

        {currentNode && (
          <div
            className={`adventure-presence adventure-presence--${currentNode.status}`}
            style={{ left: `${currentNode.x}%`, top: `${currentNode.y}%` }}
            aria-label={`学生当前位置：${currentNode.title}`}
          >
            你在这里
          </div>
        )}

        {nodes.map((item, index) => (
          <button
            type="button"
            key={item.id}
            className={`adventure-ability-node adventure-ability-node--${item.status} adventure-ability-node--${item.id}`}
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
            onClick={() => onUseKnowledge(item.source)}
            title={item.reason}
            disabled={item.status === 'locked'}
          >
            <span className="adventure-ability-node__ordinal">{index + 1}</span>
            <span className="adventure-ability-node__body">
              <strong>{item.title}</strong>
              <em>{item.subtitle}</em>
              <small>{item.statusText} · {item.metric}</small>
            </span>
          </button>
        ))}

        <div className="adventure-map-live-note">
          <strong>实时接入</strong>
          <span>任务完成、资源状态、画像更新后，这一层会重新计算。</span>
        </div>
      </div>

      <div className="adventure-map-footer">
        <div className="adventure-current-card">
          <RowBetween>
            <strong>{currentNode?.title ?? '等待能力区'}</strong>
            <ScorePill>{currentNode ? STATUS_LABELS[currentNode.status] : '待生成'}</ScorePill>
          </RowBetween>
          <Probe>{currentNode?.reason ?? '生成探索计划后，系统会按画像和方向自动放置地图节点。'}</Probe>
        </div>
        <div className="adventure-legend">
          <Chip>当前推荐</Chip>
          <Chip tone="gap">挑战点</Chip>
          <Chip tone="soft">已完成</Chip>
        </div>
      </div>
    </section>
  );
}

function buildAbilityMapNodes(
  plan: ExplorationPlan,
  workspace: ExplorationWorkspace | null,
  activeDirection: CareerDirection | null,
): AbilityMapNode[] {
  const recommended = new Map(plan.recommended_knowledge.map((item) => [item.knowledge_id, item]));
  const completedKnowledgeIds = new Set<string>();
  const openedKnowledgeIds = new Set<string>();
  const doneTaskKnowledgeIds = new Set<string>();
  const resourceByKnowledgeId = new Map<string, { status: string; title: string }>();

  workspace?.resources.forEach((resource) => {
    resourceByKnowledgeId.set(resource.knowledge_id, { status: resource.status, title: resource.title });
    if (resource.status === 'completed') completedKnowledgeIds.add(resource.knowledge_id);
    if (resource.status === 'opened') openedKnowledgeIds.add(resource.knowledge_id);
  });

  workspace?.phases.forEach((phase) => {
    phase.tasks.forEach((task) => {
      if (task.status !== 'done') return;
      const sourceTask = plan.exploration_tasks.find((item) => item.id === task.id);
      sourceTask?.related_knowledge_ids.forEach((id) => doneTaskKnowledgeIds.add(id));
    });
  });

  const activeReport = activeDirection
    ? plan.match_reports.find((item) => item.direction_id === activeDirection.id)
    : plan.match_reports[0];
  const lowDimensions = [...(workspace?.dimension_scores ?? plan.dimension_scores)].sort((a, b) => a.score - b.score);
  const changedDimensions = new Set(workspace?.profile_versions.map((item) => item.changed_dimension) ?? []);
  const doneTaskCount = workspace?.phases.reduce(
    (sum, phase) => sum + phase.tasks.filter((task) => task.status === 'done').length,
    0,
  ) ?? 0;
  const totalTaskCount = workspace?.phases.reduce((sum, phase) => sum + phase.tasks.length, 0) ?? plan.exploration_tasks.length;
  const completedResourceCount = workspace?.resources.filter((resource) => resource.status === 'completed').length ?? 0;
  const openedResourceCount = workspace?.resources.filter((resource) => resource.status === 'opened').length ?? 0;
  const reviewCount = workspace?.reviews.length ?? 0;

  const foundation = pickKnowledge(plan, recommended, 'foundation');
  const core = pickKnowledge(plan, recommended, 'core');
  const direction = pickDirectionKnowledge(plan, activeDirection, recommended);
  const practice = pickKnowledge(plan, recommended, 'practice');
  const evidence = pickResourceKnowledge(plan, workspace, recommended) ?? foundation;
  const collaboration = pickFallbackKnowledge(plan, recommended, ['communication', 'teamwork']) ?? direction;
  const portfolio = practice ?? direction ?? core ?? foundation;
  const reflection = pickFallbackKnowledge(plan, recommended, ['learning_ability', 'responsibility']) ?? foundation;

  return [
    createNode({
      id: 'foundation',
      title: '专业底座',
      subtitle: foundation.title,
      source: toRecommendedSource(foundation, recommended),
      status: statusForKnowledge(foundation.id, recommended, completedKnowledgeIds, openedKnowledgeIds, doneTaskKnowledgeIds),
      reason: recommended.get(foundation.id)?.reason ?? `${foundation.why} 这是后续方向探索的地基。`,
      metric: lowestMetric(lowDimensions, ['professional_skills', 'professional_background']) ?? `${foundation.difficulty} 星难度`,
    }),
    createNode({
      id: 'core',
      title: '核心能力',
      subtitle: core.title,
      source: toRecommendedSource(core, recommended),
      status: coreStatus(core, recommended, completedKnowledgeIds, doneTaskKnowledgeIds, lowDimensions, activeReport),
      reason: coreReason(core, recommended, activeReport),
      metric: lowestMetric(lowDimensions, ['professional_skills', 'problem_solving']) ?? `${core.difficulty} 星难度`,
    }),
    createNode({
      id: 'direction',
      title: '方向探索',
      subtitle: activeDirection?.title ?? direction.title,
      source: toRecommendedSource(direction, recommended, activeDirection),
      status: directionStatus(direction.id, recommended, completedKnowledgeIds, openedKnowledgeIds, activeDirection, changedDimensions),
      reason: activeDirection
        ? `${activeDirection.why_explore[0] ?? direction.why} 该区域用于验证你是否适合「${activeDirection.title}」。`
        : recommended.get(direction.id)?.reason ?? direction.why,
      metric: activeDirection ? `${activeDirection.fit_score} 匹配度` : `${direction.difficulty} 星难度`,
    }),
    createNode({
      id: 'practice',
      title: '项目作品',
      subtitle: practice.title,
      source: toRecommendedSource(practice, recommended),
      status: practiceStatus(practice.id, completedKnowledgeIds, doneTaskKnowledgeIds, doneTaskCount, totalTaskCount),
      reason: `${practice.why} 地图会把小项目、交付物和完成证据转成可见进度。`,
      metric: `${doneTaskCount}/${Math.max(totalTaskCount, 1)} 任务`,
    }),
    createNode({
      id: 'evidence',
      title: '资源证据',
      subtitle: evidence.title,
      source: toRecommendedSource(evidence, recommended),
      status: evidenceStatus(completedResourceCount, openedResourceCount, workspace),
      reason: resourceByKnowledgeId.get(evidence.id)?.title
        ? `资源「${resourceByKnowledgeId.get(evidence.id)?.title}」的打开和完成记录会进入成长报告。`
        : '推荐资源的打开、完成和复盘会进入成长报告，作为真实学习证据。',
      metric: `${completedResourceCount}/${workspace?.resources.length ?? plan.recommended_knowledge.length} 资源`,
    }),
    createNode({
      id: 'portfolio',
      title: '实习作品集',
      subtitle: portfolio.title,
      source: toRecommendedSource(portfolio, recommended),
      status: portfolioStatus(workspace, doneTaskCount, completedResourceCount),
      reason: '当短期探索有足够证据后，再把项目和资源沉淀成作品集、实习准备和面试素材。',
      metric: workspace ? `${workspace.phases.at(-1)?.progress_percent ?? 0}% 长期` : '先建工作区',
    }),
    createNode({
      id: 'collaboration',
      title: '沟通协作',
      subtitle: collaboration.title,
      source: toRecommendedSource(collaboration, recommended),
      status: collaborationStatus(lowDimensions, changedDimensions),
      reason: '大学生探索不只看专业课，也要把团队协作、表达、文档和责任心变成可观察证据。',
      metric: lowestMetric(lowDimensions, ['communication', 'teamwork', 'documentation_awareness']) ?? '软能力证据',
    }),
    createNode({
      id: 'reflection',
      title: '复盘成长',
      subtitle: reflection.title,
      source: toRecommendedSource(reflection, recommended),
      status: reflectionStatus(reviewCount, changedDimensions),
      reason: '周复盘和画像版本会改变后续推荐，让地图不是一次性静态路线。',
      metric: `${reviewCount} 次复盘`,
    }),
  ];
}

function createNode(input: Omit<AbilityMapNode, 'x' | 'y' | 'statusText'>): AbilityMapNode {
  return {
    ...input,
    ...ABILITY_LAYOUT[input.id],
    statusText: STATUS_LABELS[input.status],
  };
}

function toRecommendedSource(
  node: KnowledgeNode,
  recommended: Map<string, RecommendedKnowledge>,
  activeDirection?: CareerDirection | null,
): RecommendedKnowledge {
  const source = recommended.get(node.id);
  const stageKey =
    source?.stage_key
    ?? (node.category === 'foundation'
      ? 'foundation'
      : node.category === 'direction'
        ? 'advancement'
        : 'practice');
  return {
    knowledge_id: node.id,
    knowledge_name: activeDirection?.title ?? source?.knowledge_name ?? node.title,
    reason: source?.reason ?? (activeDirection ? `${node.why} 该节点支撑「${activeDirection.title}」方向。` : node.why),
    suggested_difficulty: source?.suggested_difficulty ?? node.difficulty,
    stage_key: stageKey,
    stage_title:
      source?.stage_title
      ?? (stageKey === 'foundation'
        ? '阶段 1 · 基础定标'
        : stageKey === 'practice'
          ? '阶段 2 · 课堂练习'
          : stageKey === 'advancement'
            ? '阶段 3 · 进阶迁移'
            : '证据补强 · 方向复核'),
    validation_prompt: source?.validation_prompt ?? `围绕「${node.title}」完成一轮当前阶段验证。`,
    success_criteria: source?.success_criteria ?? '至少形成 1 条有效学习证据。',
    recommended_action: source?.recommended_action ?? `把「${node.title}」继续推进到培养方案或课堂页。`,
  };
}

function pickKnowledge(
  plan: ExplorationPlan,
  recommended: Map<string, RecommendedKnowledge>,
  category: KnowledgeNode['category'],
): KnowledgeNode {
  return plan.knowledge_map.find((node) => node.category === category && recommended.has(node.id))
    ?? plan.knowledge_map.find((node) => node.category === category)
    ?? plan.knowledge_map[0];
}

function pickDirectionKnowledge(
  plan: ExplorationPlan,
  activeDirection: CareerDirection | null,
  recommended: Map<string, RecommendedKnowledge>,
): KnowledgeNode {
  const byId = new Map(plan.knowledge_map.map((node) => [node.id, node]));
  const fromDirection = activeDirection?.related_knowledge_ids
    .map((id) => byId.get(id))
    .find((node): node is KnowledgeNode => Boolean(node));
  return fromDirection ?? pickKnowledge(plan, recommended, 'direction');
}

function pickResourceKnowledge(
  plan: ExplorationPlan,
  workspace: ExplorationWorkspace | null,
  recommended: Map<string, RecommendedKnowledge>,
): KnowledgeNode | null {
  const byId = new Map(plan.knowledge_map.map((node) => [node.id, node]));
  const resourceKnowledge = workspace?.resources
    .map((resource) => byId.get(resource.knowledge_id))
    .find((node): node is KnowledgeNode => Boolean(node));
  if (resourceKnowledge) return resourceKnowledge;
  const recommendedKnowledge = plan.recommended_knowledge
    .map((item) => byId.get(item.knowledge_id))
    .find((node): node is KnowledgeNode => Boolean(node));
  return recommendedKnowledge ?? plan.knowledge_map.find((node) => recommended.has(node.id)) ?? null;
}

function pickFallbackKnowledge(
  plan: ExplorationPlan,
  recommended: Map<string, RecommendedKnowledge>,
  dimensionKeys: string[],
): KnowledgeNode | null {
  const relatedCategory: KnowledgeNode['category'] = dimensionKeys.some((key) => key.includes('team') || key.includes('communication'))
    ? 'practice'
    : 'foundation';
  return plan.knowledge_map.find((node) => node.category === relatedCategory && recommended.has(node.id))
    ?? plan.knowledge_map.find((node) => node.category === relatedCategory)
    ?? null;
}

function statusForKnowledge(
  knowledgeId: string,
  recommended: Map<string, RecommendedKnowledge>,
  completedKnowledgeIds: Set<string>,
  openedKnowledgeIds: Set<string>,
  doneTaskKnowledgeIds: Set<string>,
): AbilityStatus {
  if (completedKnowledgeIds.has(knowledgeId) || doneTaskKnowledgeIds.has(knowledgeId)) return 'done';
  if (openedKnowledgeIds.has(knowledgeId) || recommended.has(knowledgeId)) return 'current';
  return 'available';
}

function coreStatus(
  node: KnowledgeNode,
  recommended: Map<string, RecommendedKnowledge>,
  completedKnowledgeIds: Set<string>,
  doneTaskKnowledgeIds: Set<string>,
  lowDimensions: ExplorationPlan['dimension_scores'],
  activeReport: ExplorationPlan['match_reports'][number] | undefined,
): AbilityStatus {
  if (completedKnowledgeIds.has(node.id) || doneTaskKnowledgeIds.has(node.id)) return 'done';
  if (activeReport?.priority_gap_dimensions.length) return 'challenge';
  if (lowDimensions.some((item) => ['professional_skills', 'problem_solving'].includes(item.key) && item.score < 65)) return 'challenge';
  if (recommended.has(node.id)) return 'current';
  return 'available';
}

function coreReason(
  node: KnowledgeNode,
  recommended: Map<string, RecommendedKnowledge>,
  activeReport: ExplorationPlan['match_reports'][number] | undefined,
): string {
  const source = recommended.get(node.id);
  if (source) return source.reason;
  const gap = activeReport?.priority_gap_dimensions[0];
  if (gap) return `${node.why} 当前方向的优先差距是「${gap}」，建议先补一条可验证证据。`;
  return node.why;
}

function directionStatus(
  knowledgeId: string,
  recommended: Map<string, RecommendedKnowledge>,
  completedKnowledgeIds: Set<string>,
  openedKnowledgeIds: Set<string>,
  activeDirection: CareerDirection | null,
  changedDimensions: Set<string>,
): AbilityStatus {
  if (changedDimensions.size > 0) return 'changed';
  if (completedKnowledgeIds.has(knowledgeId)) return 'done';
  if (activeDirection || openedKnowledgeIds.has(knowledgeId) || recommended.has(knowledgeId)) return 'current';
  return 'available';
}

function practiceStatus(
  knowledgeId: string,
  completedKnowledgeIds: Set<string>,
  doneTaskKnowledgeIds: Set<string>,
  doneTaskCount: number,
  totalTaskCount: number,
): AbilityStatus {
  if (completedKnowledgeIds.has(knowledgeId) || doneTaskKnowledgeIds.has(knowledgeId) || (totalTaskCount > 0 && doneTaskCount === totalTaskCount)) return 'done';
  if (doneTaskCount > 0) return 'current';
  return 'available';
}

function evidenceStatus(completedResourceCount: number, openedResourceCount: number, workspace: ExplorationWorkspace | null): AbilityStatus {
  if (completedResourceCount > 0) return 'done';
  if (openedResourceCount > 0 || (workspace?.resources.length ?? 0) > 0) return 'current';
  return 'available';
}

function portfolioStatus(workspace: ExplorationWorkspace | null, doneTaskCount: number, completedResourceCount: number): AbilityStatus {
  if (!workspace) return 'locked';
  if (doneTaskCount + completedResourceCount >= 4) return 'current';
  return 'locked';
}

function collaborationStatus(
  lowDimensions: ExplorationPlan['dimension_scores'],
  changedDimensions: Set<string>,
): AbilityStatus {
  if (['communication', 'teamwork', 'documentation_awareness'].some((key) => changedDimensions.has(key))) return 'changed';
  if (lowDimensions.some((item) => ['communication', 'teamwork', 'documentation_awareness'].includes(item.key) && item.score < 66)) return 'challenge';
  return 'available';
}

function reflectionStatus(reviewCount: number, changedDimensions: Set<string>): AbilityStatus {
  if (reviewCount > 0) return 'done';
  if (changedDimensions.size > 0) return 'changed';
  return 'available';
}

function lowestMetric(
  lowDimensions: ExplorationPlan['dimension_scores'],
  keys: string[],
): string | null {
  const target = lowDimensions.find((item) => keys.includes(item.key));
  if (!target) return null;
  return `${DIMENSION_LABELS[target.key] ?? target.title} ${target.score}`;
}

function findCurrentNode(nodes: AbilityMapNode[]): AbilityMapNode | null {
  return nodes.find((item) => item.status === 'current')
    ?? nodes.find((item) => item.status === 'challenge')
    ?? nodes.find((item) => item.status === 'changed')
    ?? [...nodes].reverse().find((item) => item.status === 'done')
    ?? nodes[0]
    ?? null;
}
