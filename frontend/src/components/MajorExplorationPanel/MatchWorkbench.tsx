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
      action={
        activeMatchDirection ? (
          <MajorButton variant="small" onClick={() => onCreateWorkspace(activeMatchDirection)} disabled={workspaceLoading}>
            {workspaceLoading ? '创建中…' : '生成路径'}
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
              <Muted>{compactText(activeMatchReport.narrative.overall_review, 22)}</Muted>
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
                <Probe>缺口 {item.gap > 0 ? item.gap : 0} · {item.missing_keywords.slice(0, 2).join('、') || '暂无'}</Probe>
              </div>
            ))}
          </div>

          <div className="major-advice-grid">
            {activeMatchReport.action_advices.map((advice) => (
              <div key={advice.key} className="major-advice-card">
                <strong>{advice.title}</strong>
                <Muted>{compactText(advice.why_it_matters, 18)}</Muted>
                <Probe>{compactText(advice.current_issue, 18)}</Probe>
                <List items={advice.next_actions.slice(0, 1).map((item) => compactText(item, 18))} />
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
                <Muted>{compactText(card.scenario, 18)}</Muted>
                <Probe>任务：{compactText(card.proof_task, 18)}</Probe>
                <div className="major-chip-row">
                  {card.requirement_keywords.slice(0, 4).map((item) => (
                    <Chip key={item} tone="soft">{item}</Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Panel title="候选方向清单" cream>
            <div className="major-list-stack">
              {plan.career_directions.map((direction) => (
                <div key={direction.id} className="major-mini-card">
                  <RowBetween>
                    <strong>{direction.title}</strong>
                    <ScorePill>{direction.fit_score}</ScorePill>
                  </RowBetween>
                  <Muted>{compactText(direction.why_explore.join(' '), 18)}</Muted>
                  <Probe>首题：{compactText(tasksById.get(direction.first_probe_task_id) || direction.first_probe_task_id, 18)}</Probe>
                  <div className="major-role-profile">
                    <Badge>{direction.exploration_domain || '探索方向'}</Badge>
                    <small>{direction.requirement_profile.core_skills.slice(0, 4).join('、')}</small>
                  </div>
                  {direction.requirement_profile.evidence_suggestions.length > 0 && (
                    <Probe>{compactText(direction.requirement_profile.evidence_suggestions[0], 18)}</Probe>
                  )}
                  <MajorButton variant="small" onClick={() => onCreateWorkspace(direction)} disabled={workspaceLoading}>
                    {workspaceLoading ? '创建中…' : '开工'}
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

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
