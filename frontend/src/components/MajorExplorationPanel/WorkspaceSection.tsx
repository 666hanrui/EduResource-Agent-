import type {
  CoachResponse,
  CoachTone,
  ExplorationWorkspace,
  GrowthReport,
  WorkspaceResource,
  WorkspaceTask,
} from '../../types/exploration';
import { Field, List, MajorButton, MajorInput, MajorSelect, MajorTextarea, Muted, Panel, Probe, ProgressBar, RowBetween, ScorePill, Chip, Badge } from './FreddiePrimitives';
import { PROFILE_LABELS } from './model';

interface Props {
  workspace: ExplorationWorkspace;
  growthReport: GrowthReport | null;
  reportText: string;
  reviewText: string;
  profileKey: string;
  profileValueText: string;
  coachQuestion: string;
  coachTone: CoachTone;
  coach: CoachResponse | null;
  setReportText: (value: string) => void;
  setReviewText: (value: string) => void;
  setProfileKey: (key: string, valueText: string) => void;
  setProfileValueText: (value: string) => void;
  setCoachQuestion: (value: string) => void;
  setCoachTone: (value: CoachTone) => void;
  handleBuildReport: () => void;
  handleSaveReport: () => void;
  handleDownloadReport: (format: 'markdown' | 'html') => void;
  handleSaveProfile: () => void;
  handleResourceStatus: (resource: WorkspaceResource, status: WorkspaceResource['status']) => void;
  handleAskCoach: () => void;
  handleToggleTask: (task: WorkspaceTask) => void;
  handleAddReview: () => void;
}

export function WorkspaceSection({
  workspace,
  growthReport,
  reportText,
  reviewText,
  profileKey,
  profileValueText,
  coachQuestion,
  coachTone,
  coach,
  setReportText,
  setReviewText,
  setProfileKey,
  setProfileValueText,
  setCoachQuestion,
  setCoachTone,
  handleBuildReport,
  handleSaveReport,
  handleDownloadReport,
  handleSaveProfile,
  handleResourceStatus,
  handleAskCoach,
  handleToggleTask,
  handleAddReview,
}: Props) {
  return (
    <>
      <Panel
        title={`工作区：${workspace.favorite.direction.title}`}
        action={<MajorButton variant="small" onClick={handleBuildReport}>成长报告</MajorButton>}
        cream
      >
        {workspace.match_report && (
          <div className="major-workspace-strip">
            <div className="major-mini-score"><strong>{workspace.match_report.overall_match}</strong><span>匹配度</span></div>
            <div>
              <strong>{workspace.match_report.target_title}</strong>
              <Probe>优势：{workspace.match_report.strength_dimensions.slice(0, 2).join('、') || '待补'} · 差距：{workspace.match_report.priority_gap_dimensions.slice(0, 2).join('、') || '待观察'}</Probe>
            </div>
          </div>
        )}

        <div className="major-profile-editor">
          <Field label="画像维度">
            <MajorSelect
              value={profileKey}
              onChange={(e) => {
                const nextKey = e.target.value;
                setProfileKey(nextKey, (workspace.profile[nextKey] || []).join('，'));
              }}
            >
              {Object.entries(PROFILE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </MajorSelect>
          </Field>
          <Field label="关键词">
            <MajorInput value={profileValueText} onChange={(e) => setProfileValueText(e.target.value)} />
          </Field>
          <MajorButton variant="small" onClick={handleSaveProfile}>保存画像</MajorButton>
        </div>

        <div className="major-chip-grid">
          {workspace.dimension_scores.map((item) => (
            <div key={item.key} className="major-chip-box">
              <strong>{item.title}</strong>
              <ScorePill>{item.score}</ScorePill>
              <small>{compactText(item.evidence.slice(0, 2).join('、') || '待补充', 16)}</small>
            </div>
          ))}
        </div>

        {workspace.profile_versions.length > 0 && (
          <Probe>
            最近画像更新：{PROFILE_LABELS[workspace.profile_versions[0].changed_dimension]} →
            {' '}
            {compactText(workspace.profile_versions[0].next_values.join('、') || '空', 18)}
          </Probe>
        )}

        {workspace.resources.length > 0 && (
          <div className="major-resource-grid">
            {workspace.resources.map((resource) => (
              <div key={resource.resource_id} className="major-resource-card">
                <RowBetween>
                  <div className="major-chip-row"><Badge>{resource.logo_hint}</Badge><strong>{resource.title}</strong></div>
                  <div className="major-chip-row"><ScorePill>{resource.quality_score}</ScorePill><Chip tone="soft">{statusLabel(resource.status)}</Chip></div>
                </RowBetween>
                <Probe>{resource.source_name} / {resource.resource_type}</Probe>
                <Muted>{compactText(resource.reason, 20)}</Muted>
                <div className="major-resource-actions">
                  <MajorButton variant="small" onClick={() => handleResourceStatus(resource, 'opened')}>打开资源</MajorButton>
                  <MajorButton variant="small" onClick={() => handleResourceStatus(resource, 'completed')}>标记完成</MajorButton>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="major-workspace-grid">
          {workspace.phases.map((phase) => (
            <div key={phase.phase} className="major-path-card">
              <RowBetween><strong>{phase.label}</strong><ScorePill>{phase.progress_percent}%</ScorePill></RowBetween>
              <ProgressBar value={phase.progress_percent} />
              <Muted>{compactText(phase.goal, 18)}</Muted>
              <div className="major-list-stack">
                {phase.tasks.map((task) => (
                  <button
                    type="button"
                    key={`${phase.phase}-${task.id}`}
                    onClick={() => handleToggleTask(task)}
                    className={task.status === 'done' ? 'major-task-card major-task-card--done' : 'major-task-card'}
                  >
                    <Chip>{task.status === 'done' ? '已完成' : '待完成'}</Chip>
                    <strong>{task.title}</strong>
                    <small>{compactText(task.evidence_to_collect, 16)}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="major-coach-card">
          <RowBetween>
            <h4>教练</h4>
            <MajorSelect value={coachTone} onChange={(e) => setCoachTone(e.target.value as CoachTone)}>
              <option value="encourage">鼓励</option>
              <option value="diagnose">诊断</option>
              <option value="challenge">挑战</option>
            </MajorSelect>
          </RowBetween>
          <div className="major-coach-row">
            <MajorInput value={coachQuestion} onChange={(e) => setCoachQuestion(e.target.value)} />
            <MajorButton variant="small" onClick={handleAskCoach}>建议</MajorButton>
          </div>
          {coach && (
            <div>
              <Muted>{compactText(coach.summary, 18)}</Muted>
              <div className="major-suggestion-grid">
                {coach.suggestions.map((item) => (
                  <div key={`${item.title}-${item.action}`} className="major-coach-card">
                    <strong>{item.title}</strong>
                    <Muted>{compactText(item.reason, 16)}</Muted>
                    <Probe>{compactText(item.action, 16)}</Probe>
                    <small>{compactText(item.evidence_to_collect, 16)}</small>
                  </div>
                ))}
              </div>
              <List items={coach.follow_up_questions.slice(0, 2).map((item) => compactText(item, 16))} />
            </div>
          )}
        </div>

        <div className="major-review-row">
          <MajorTextarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
          <MajorButton variant="small" onClick={handleAddReview}>保存复盘</MajorButton>
        </div>

        {workspace.reviews.length > 0 && (
          <div className="major-review-grid">
            {workspace.reviews.map((review) => (
              <div key={review.review_id} className="major-review-card">
                <strong>{review.review_type === 'weekly' ? '周复盘' : '月复盘'}</strong>
                <Muted>{compactText(review.summary, 18)}</Muted>
                <List items={review.next_actions.slice(0, 2).map((item) => compactText(item, 16))} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {growthReport && (
        <Panel
          title={growthReport.title}
          subtitle={growthReport.is_customized ? '已保存' : '草稿'}
          action={
            <div className="major-report-actions">
              <MajorButton variant="small" onClick={handleSaveReport}>保存</MajorButton>
              <MajorButton variant="small" onClick={() => handleDownloadReport('markdown')}>下载 MD</MajorButton>
              <MajorButton variant="small" onClick={() => handleDownloadReport('html')}>下载 HTML</MajorButton>
            </div>
          }
        >
          <MajorTextarea className="major-report-editor" value={reportText} onChange={(e) => setReportText(e.target.value)} />
        </Panel>
      )}
    </>
  );
}

function statusLabel(status: WorkspaceResource['status']) {
  if (status === 'completed') return '已完成';
  if (status === 'opened') return '已打开';
  return '待学习';
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
