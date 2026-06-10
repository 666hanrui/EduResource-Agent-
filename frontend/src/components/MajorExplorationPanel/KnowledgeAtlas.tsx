import type { CareerDirection, ExplorationPlan, ExplorationWorkspace, RecommendedKnowledge } from '../../types/exploration';
import { Badge, Chip, Muted, Panel, Probe, RowBetween, ScorePill } from './FreddiePrimitives';
import { buildKnowledgeAtlas, type KnowledgeNodeState } from './model';

interface Props {
  plan: ExplorationPlan;
  workspace: ExplorationWorkspace | null;
  activeDirection: CareerDirection | null;
  onUseKnowledge: (item: RecommendedKnowledge) => void;
}

const STATE_LABELS: Record<KnowledgeNodeState, string> = {
  recommended: '推荐生成',
  active: '方向核心',
  in_progress: '已在进行',
  completed: '已有证据',
  candidate: '可继续拓展',
  locked: '待解锁',
};

export function KnowledgeAtlas({ plan, workspace, activeDirection, onUseKnowledge }: Props) {
  const atlas = buildKnowledgeAtlas(plan, workspace, activeDirection);

  return (
    <Panel
      title="专业探索地图"
      subtitle="这次不再把探索地图做成装饰插画，而是直接把知识层、方向层和证据层组织成可点击的数据地图。"
      action={<Badge>{atlas.activeDirectionLabel}</Badge>}
      cream
    >
      <div className="knowledge-atlas-metrics">
        {atlas.metrics.map((item) => (
          <div key={item.label} className="knowledge-atlas-metric">
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>

      <div className="knowledge-atlas-grid">
        {atlas.lanes.map((lane) => (
          <section key={lane.key} className="knowledge-atlas-lane">
            <header className="knowledge-atlas-lane__header">
              <div>
                <h4>{lane.title}</h4>
                <Muted>{lane.description}</Muted>
              </div>
              <ScorePill>{lane.nodes.length}</ScorePill>
            </header>

            <div className="knowledge-atlas-node-list">
              {lane.nodes.map((node) => (
                <button
                  type="button"
                  key={node.id}
                  className={`knowledge-atlas-node knowledge-atlas-node--${node.state}`}
                  disabled={node.state === 'locked'}
                  onClick={() => onUseKnowledge(node.source)}
                >
                  <RowBetween>
                    <strong>{node.title}</strong>
                    <Chip tone={node.state === 'completed' ? 'soft' : node.state === 'locked' ? 'gap' : undefined}>
                      {STATE_LABELS[node.state]}
                    </Chip>
                  </RowBetween>
                  <p>{node.summary}</p>
                  <div className="knowledge-atlas-node__meta">
                    <span>{node.difficultyLabel}</span>
                    {node.prerequisites.length > 0 && <span>前置：{node.prerequisites.slice(0, 2).join('、')}</span>}
                  </div>
                  <Probe>{node.reason}</Probe>
                  <div className="knowledge-atlas-node__evidence">
                    {node.evidence.map((item) => (
                      <small key={item}>{item}</small>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="knowledge-atlas-focus">
        <div className="knowledge-atlas-focus__main">
          <small>当前最值得推进的入口</small>
          <strong>{atlas.currentFocus?.title ?? '先生成探索计划'}</strong>
          <p>{atlas.currentFocus?.reason ?? '生成后，这里会显示当前最适合转成互动课堂的知识点。'}</p>
          {atlas.currentFocus && (
            <div className="knowledge-atlas-focus__detail">
              <span>{atlas.currentFocus.source.stage_title}</span>
              <span>{atlas.currentFocus.source.validation_prompt}</span>
              <span>完成标准：{atlas.currentFocus.source.success_criteria}</span>
            </div>
          )}
        </div>
        <div className="knowledge-atlas-focus__aside">
          <Chip>点击任一节点</Chip>
          <span>会直接把知识点回填到互动课堂生成器，避免学生在两个流程之间反复切换。</span>
        </div>
      </div>
    </Panel>
  );
}
