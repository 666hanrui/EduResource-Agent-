import type { CareerDirection, ExplorationPlan, ExplorationWorkspace, RecommendedKnowledge } from '../../types/exploration';
import { Badge, Chip, Muted, Panel, RowBetween, ScorePill } from './FreddiePrimitives';
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
      title="探索地图"
      action={<Badge>{atlas.activeDirectionLabel}</Badge>}
      cream
    >
      <div className="knowledge-atlas-metrics">
        {atlas.metrics.map((item) => (
          <div key={item.label} className="knowledge-atlas-metric">
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{compactText(item.detail, 16)}</span>
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
                  <p>{compactText(node.summary, 16)}</p>
                  <div className="knowledge-atlas-node__meta">
                    <span>{node.difficultyLabel}</span>
                    {node.prerequisites.length > 0 && <span>前置：{node.prerequisites.slice(0, 2).join('、')}</span>}
                  </div>
                  <div className="knowledge-atlas-node__evidence">
                    {node.evidence.slice(0, 1).map((item) => (
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
          <small>当前入口</small>
          <strong>{atlas.currentFocus?.title ?? '先生成探索计划'}</strong>
          {atlas.currentFocus && (
            <div className="knowledge-atlas-focus__detail">
              <span>{atlas.currentFocus.source.stage_title}</span>
              <span>{compactText(atlas.currentFocus.source.validation_prompt, 18)}</span>
            </div>
          )}
        </div>
        <div className="knowledge-atlas-focus__aside">
          <Chip>点击节点</Chip>
        </div>
      </div>
    </Panel>
  );
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
