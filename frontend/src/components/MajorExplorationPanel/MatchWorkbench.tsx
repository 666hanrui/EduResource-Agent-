import type { CareerDirection, CareerMatchReport, ExplorationPlan } from '../../types/exploration';
import { Badge, Chip, DualBar, List, MajorButton, Muted, Panel, Probe, RowBetween, ScorePill } from './FreddiePrimitives';

interface Props {
  plan: ExplorationPlan;
  activeMatchReport: CareerMatchReport | null;
  activeMatchDirection: CareerDirection | null;
  tasksById: Map<string, string>;
  workspaceLoading: boolean;
  onSelectDirection: (directionId: string) => void;
  onCreateWorkspace: (direction: CareerDirection) => void;
}

export function MatchWorkbench({
  plan,
  activeMatchReport,
  activeMatchDirection,
  tasksById,
  workspaceLoading,
  onSelectDirection,
  onCreateWorkspace,
}: Props) {
  if (!activeMatchReport) return null;

  return (
    <Panel
      title="方向匹配工作台"
      subtitle="保留 12 维画像 × 方向要求的分析骨架，但把输出改成“值得探索什么、先验证什么、证据要怎么收”。"
      action={
        activeMatchDirection ? (
          <MajorButton variant="small" onClick={() => onCreateWorkspace(activeMatchDirection)} disabled={workspaceLoading}>
            {workspaceLoading ? '创建中…' : '收藏并生成路径'}
          </MajorButton>
        ) : undefined
      }
    >
      <div className="major-match-layout">
        <aside className="major-match-nav">
          {plan.match_reports.map((report) => (
            <button
              key={report.report_id}
              type="button"
              onClick={() => onSelectDirection(report.direction_id)}
              className={
                report.direction_id === activeMatchReport.direction_id
                  ? 'major-match-nav-button major-match-nav-button--active'
                  : 'major-match-nav-button'
              }
            >
              <strong>{report.target_title}</strong>
              <span>{report.exploration_domain}</span>
              <em>{report.overall_match}</em>
            </button>
          ))}
        </aside>

        <div className="major-match-content">
          <div className="major-match-hero">
            <div className="major-match-score">
              <span>{activeMatchReport.overall_match}</span>
              <small>综合匹配</small>
            </div>
            <div>
              <h4>{activeMatchReport.target_title}</h4>
              <Muted>{activeMatchReport.narrative.overall_review}</Muted>
              <div className="major-chip-row">
                {activeMatchReport.strength_dimensions.slice(0, 4).map((item) => (
                  <Chip key={item}>{item}</Chip>
                ))}
                {activeMatchReport.priority_gap_dimensions.slice(0, 4).map((item) => (
                  <Chip key={item} tone="gap">{item}</Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="major-comparison-grid">
            {activeMatchReport.comparison_dimensions.map((item) => (
              <div key={item.key} className="major-comparison-card">
                <RowBetween>
                  <strong>{item.title}</strong>
                  <ScorePill>{item.status_label}</ScorePill>
                </RowBetween>
                <div className="major-bars">
                  <DualBar label="市场" value={item.market_importance} tone="market" />
                  <DualBar label="个人" value={item.user_readiness} />
                </div>
                <Probe>缺口 {item.gap > 0 ? item.gap : 0} · 缺失关键词：{item.missing_keywords.slice(0, 3).join('、') || '暂无'}</Probe>
              </div>
            ))}
          </div>

          <div className="major-advice-grid">
            {activeMatchReport.action_advices.map((advice) => (
              <div key={advice.key} className="major-advice-card">
                <strong>{advice.title}</strong>
                <Muted>{advice.why_it_matters}</Muted>
                <Probe>{advice.current_issue}</Probe>
                <List items={advice.next_actions.slice(0, 2)} />
              </div>
            ))}
          </div>

          <div className="major-evidence-grid">
            {activeMatchReport.evidence_cards.map((card) => (
              <div key={card.id} className="major-evidence-card">
                <RowBetween>
                  <strong>{card.title}</strong>
                  <ScorePill>{card.match_score}</ScorePill>
                </RowBetween>
                <Muted>{card.scenario}</Muted>
                <Probe>证据任务：{card.proof_task}</Probe>
                <div className="major-chip-row">
                  {card.requirement_keywords.slice(0, 4).map((item) => (
                    <Chip key={item} tone="soft">{item}</Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Panel title="候选方向清单" subtitle="这里不直接给“你就适合这个”的结论，而是给出每个方向的第一步验证动作。" cream>
            <div className="major-list-stack">
              {plan.career_directions.map((direction) => (
                <div key={direction.id} className="major-mini-card">
                  <RowBetween>
                    <strong>{direction.title}</strong>
                    <ScorePill>{direction.fit_score}</ScorePill>
                  </RowBetween>
                  <Muted>{direction.why_explore.join(' ')}</Muted>
                  <Probe>首个验证任务：{tasksById.get(direction.first_probe_task_id) || direction.first_probe_task_id}</Probe>
                  <div className="major-role-profile">
                    <Badge>{direction.exploration_domain || '探索方向'}</Badge>
                    <small>{direction.requirement_profile.core_skills.slice(0, 4).join('、')}</small>
                  </div>
                  {direction.requirement_profile.evidence_suggestions.length > 0 && (
                    <Probe>证据建议：{direction.requirement_profile.evidence_suggestions[0]}</Probe>
                  )}
                  <MajorButton variant="small" onClick={() => onCreateWorkspace(direction)} disabled={workspaceLoading}>
                    {workspaceLoading ? '创建中…' : '围绕这个方向开工'}
                  </MajorButton>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Panel>
  );
}
