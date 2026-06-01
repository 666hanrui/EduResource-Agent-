import { useEffect, useMemo, useState } from 'react';
import type {
  CareerDirection,
  CoachResponse,
  CoachTone,
  ExplorationLevel,
  ExplorationPlan,
  ExplorationRequest,
  ExplorationWorkspace,
  GrowthReport,
  RecommendedKnowledge,
  WorkspaceResource,
  WorkspaceTask,
} from '../../types/exploration';
import {
  Badge,
  Chip,
  DualBar,
  EmptyPrompt,
  ErrorNotice,
  Eyebrow,
  Field,
  List,
  MajorButton,
  MajorInput,
  MajorSelect,
  MajorTextarea,
  Muted,
  Panel,
  Probe,
  ProgressBar,
  RowBetween,
  ScorePill,
} from './FreddiePrimitives';
import './major-exploration.css';

interface Props {
  studentId: string;
  onUseKnowledge: (item: RecommendedKnowledge) => void;
}

const LEVEL_OPTIONS: Array<{ value: ExplorationLevel; label: string }> = [
  { value: 'beginner', label: '刚入门' },
  { value: 'basic', label: '有一点基础' },
  { value: 'intermediate', label: '做过小项目' },
];

const CATEGORY_LABELS = {
  foundation: '基础',
  core: '核心',
  direction: '方向',
  practice: '实践',
};

const PROFILE_LABELS: Record<string, string> = {
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

export function MajorExplorationPanel({ studentId, onUseKnowledge }: Props) {
  const [major, setMajor] = useState('计算机科学与技术');
  const [grade, setGrade] = useState('大一');
  const [educationLevel, setEducationLevel] = useState('本科');
  const [foundationLevel, setFoundationLevel] = useState<ExplorationLevel>('beginner');
  const [weeklyHours, setWeeklyHours] = useState(6);
  const [interestText, setInterestText] = useState('AI 应用，Web 开发');
  const [plan, setPlan] = useState<ExplorationPlan | null>(null);
  const [activeMatchDirectionId, setActiveMatchDirectionId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<ExplorationWorkspace | null>(null);
  const [growthReport, setGrowthReport] = useState<GrowthReport | null>(null);
  const [reportText, setReportText] = useState('');
  const [reviewText, setReviewText] = useState('这周完成了一个小任务，发现自己更喜欢能看到结果的方向。');
  const [profileKey, setProfileKey] = useState('professional_skills');
  const [profileValueText, setProfileValueText] = useState('Python，SQL，React');
  const [coachQuestion, setCoachQuestion] = useState('我不知道这个方向适不适合我');
  const [coachTone, setCoachTone] = useState<CoachTone>('encourage');
  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasksById = useMemo(() => {
    const map = new Map<string, string>();
    plan?.exploration_tasks.forEach((task) => map.set(task.id, task.title));
    return map;
  }, [plan]);

  useEffect(() => {
    if (!plan?.match_reports.length) {
      setActiveMatchDirectionId(null);
      return;
    }
    if (!activeMatchDirectionId || !plan.match_reports.some((item) => item.direction_id === activeMatchDirectionId)) {
      setActiveMatchDirectionId(plan.match_reports[0].direction_id);
    }
  }, [activeMatchDirectionId, plan]);

  const activeMatchReport = useMemo(() => {
    if (!plan?.match_reports.length) return null;
    return plan.match_reports.find((item) => item.direction_id === activeMatchDirectionId) || plan.match_reports[0];
  }, [activeMatchDirectionId, plan]);

  const activeMatchDirection = useMemo(() => {
    if (!plan || !activeMatchReport) return null;
    return plan.career_directions.find((item) => item.id === activeMatchReport.direction_id) || null;
  }, [activeMatchReport, plan]);

  const postJson = async <T,>(url: string, body: unknown, method = 'POST'): Promise<T> => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  };

  const handleBuild = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: ExplorationRequest = {
        student_id: studentId,
        major,
        grade,
        education_level: educationLevel,
        foundation_level: foundationLevel,
        interests: interestText.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
        weekly_hours: weeklyHours,
      };
      const res = await fetch('/api/exploration/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      setPlan((await res.json()) as ExplorationPlan);
      setWorkspace(null);
      setGrowthReport(null);
      setReportText('');
      setCoach(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateWorkspace = async (direction: CareerDirection) => {
    if (!plan) return;
    setWorkspaceLoading(true);
    setError(null);
    try {
      const next = await postJson<ExplorationWorkspace>('/api/exploration/workspaces', {
        student_id: studentId,
        plan,
        direction_id: direction.id,
      });
      setWorkspace(next);
      setGrowthReport(null);
      setReportText('');
      setCoach(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setWorkspaceLoading(false);
    }
  };

  const handleToggleTask = async (task: WorkspaceTask) => {
    if (!workspace) return;
    setError(null);
    try {
      const next = await postJson<ExplorationWorkspace>(
        `/api/exploration/workspaces/${workspace.workspace_id}/tasks/${task.id}`,
        { status: task.status === 'done' ? 'pending' : 'done', note: task.status === 'done' ? '' : '已完成并记录证据' },
        'PATCH',
      );
      setWorkspace(next);
      setGrowthReport(null);
      setReportText('');
      setCoach(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddReview = async () => {
    if (!workspace) return;
    setError(null);
    try {
      const next = await postJson<ExplorationWorkspace>(
        `/api/exploration/workspaces/${workspace.workspace_id}/reviews`,
        { review_type: 'weekly', phase: 'short_term', summary: reviewText },
      );
      setWorkspace(next);
      setGrowthReport(null);
      setReportText('');
      setCoach(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleBuildReport = async () => {
    if (!workspace) return;
    setError(null);
    try {
      const res = await fetch(`/api/exploration/workspaces/${workspace.workspace_id}/growth-report`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const next = (await res.json()) as GrowthReport;
      setGrowthReport(next);
      setReportText(next.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveProfile = async () => {
    if (!workspace) return;
    setError(null);
    try {
      const next = await postJson<ExplorationWorkspace>(
        `/api/exploration/workspaces/${workspace.workspace_id}/profile`,
        {
          dimension_key: profileKey,
          values: profileValueText.split(/[，,]/).map((item) => item.trim()).filter(Boolean),
          note: '前端工作台手动编辑',
        },
        'PATCH',
      );
      setWorkspace(next);
      setGrowthReport(null);
      setReportText('');
      setCoach(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResourceStatus = async (resource: WorkspaceResource, status: WorkspaceResource['status']) => {
    if (!workspace) return;
    setError(null);
    try {
      if (status === 'opened') window.open(resource.url, '_blank', 'noopener,noreferrer');
      const next = await postJson<ExplorationWorkspace>(
        `/api/exploration/workspaces/${workspace.workspace_id}/resources/${resource.resource_id}`,
        { status },
        'PATCH',
      );
      setWorkspace(next);
      setGrowthReport(null);
      setReportText('');
      setCoach(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAskCoach = async () => {
    if (!workspace) return;
    setError(null);
    try {
      const next = await postJson<CoachResponse>(
        `/api/exploration/workspaces/${workspace.workspace_id}/coach`,
        { question: coachQuestion, tone: coachTone },
      );
      setCoach(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveReport = async () => {
    if (!workspace) return;
    setError(null);
    try {
      const next = await postJson<GrowthReport>(
        `/api/exploration/workspaces/${workspace.workspace_id}/growth-report`,
        { markdown: reportText },
        'PATCH',
      );
      setGrowthReport(next);
      setReportText(next.markdown);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDownloadReport = async (format: 'markdown' | 'html') => {
    if (!workspace) return;
    setError(null);
    try {
      const res = await fetch(`/api/exploration/workspaces/${workspace.workspace_id}/growth-report/export?format=${format}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${workspace.favorite.direction.title}-专业探索成长报告.${format === 'html' ? 'html' : 'md'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="major-workshop">
      <section className="major-control-card">
        <Field label="专业"><MajorInput value={major} onChange={(e) => setMajor(e.target.value)} /></Field>
        <Field label="年级"><MajorInput value={grade} onChange={(e) => setGrade(e.target.value)} /></Field>
        <Field label="学历"><MajorInput value={educationLevel} onChange={(e) => setEducationLevel(e.target.value)} /></Field>
        <Field label="基础">
          <MajorSelect value={foundationLevel} onChange={(e) => setFoundationLevel(e.target.value as ExplorationLevel)}>
            {LEVEL_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </MajorSelect>
        </Field>
        <Field label="每周小时"><MajorInput type="number" min={1} max={60} value={weeklyHours} onChange={(e) => setWeeklyHours(Number(e.target.value) || 1)} /></Field>
        <Field label="兴趣关键词" wide><MajorInput value={interestText} onChange={(e) => setInterestText(e.target.value)} /></Field>
        <MajorButton variant="primary" onClick={handleBuild} disabled={loading}>{loading ? '生成中…' : '生成探索计划'}</MajorButton>
      </section>

      {error && <ErrorNotice>{error}</ErrorNotice>}

      {!plan ? (
        <EmptyPrompt />
      ) : (
        <div className="major-content">
          <section className="major-hero">
            <div>
              <Eyebrow>Major Exploration</Eyebrow>
              <h2>{plan.major} 探索工作台</h2>
              <Muted>{plan.summary}</Muted>
            </div>
            <div className="major-hero-stats">
              <strong>{plan.knowledge_map.length}</strong><span>知识节点</span>
              <strong>{plan.career_directions.length}</strong><span>候选方向</span>
            </div>
          </section>

          {plan.agent_steps.length > 0 && (
            <Panel title="专业探索多 Agent 流水线" subtitle="从专业广度、12 维画像、方向匹配到蜗牛路径，全部以结构化证据串联。" action={<Badge>{plan.agent_steps.length} Agents</Badge>} cream>
              <div className="major-agent-grid">
                {plan.agent_steps.map((step, index) => (
                  <div key={step.id} className="major-agent-step">
                    <div className="major-agent-step__top">
                      <span className="major-step-index">{index + 1}</span>
                      <strong>{step.agent_name}</strong>
                      <Badge>{step.status}</Badge>
                    </div>
                    <strong>{step.title}</strong>
                    <Probe>{step.summary}</Probe>
                    <div className="major-chip-row">{step.evidence_refs.slice(0, 3).map((item) => <Chip key={item} tone="soft">{item}</Chip>)}</div>
                    <Probe>输出 {step.output_count} 项</Probe>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {activeMatchReport && (
            <Panel
              title="职业匹配分析"
              subtitle="复用参考仓的“12 维画像 × 岗位要求”报告形态，但入口改成专业探索。"
              action={activeMatchDirection && <MajorButton variant="small" onClick={() => handleCreateWorkspace(activeMatchDirection)} disabled={workspaceLoading}>{workspaceLoading ? '创建中…' : '收藏并生成路径'}</MajorButton>}
            >
              <div className="major-match-layout">
                <aside className="major-match-nav">
                  {plan.match_reports.map((report) => (
                    <button key={report.report_id} onClick={() => setActiveMatchDirectionId(report.direction_id)} className={report.direction_id === activeMatchReport.direction_id ? 'major-match-nav-button major-match-nav-button--active' : 'major-match-nav-button'}>
                      <strong>{report.target_title}</strong>
                      <span>{report.exploration_domain}</span>
                      <em>{report.overall_match}</em>
                    </button>
                  ))}
                </aside>
                <div className="major-match-content">
                  <div className="major-match-hero">
                    <div className="major-match-score"><span>{activeMatchReport.overall_match}</span><small>综合匹配</small></div>
                    <div>
                      <h4>{activeMatchReport.target_title}</h4>
                      <Muted>{activeMatchReport.narrative.overall_review}</Muted>
                      <div className="major-chip-row">
                        {activeMatchReport.strength_dimensions.slice(0, 4).map((item) => <Chip key={item}>{item}</Chip>)}
                        {activeMatchReport.priority_gap_dimensions.slice(0, 4).map((item) => <Chip key={item} tone="gap">{item}</Chip>)}
                      </div>
                    </div>
                  </div>

                  <div className="major-comparison-grid">
                    {activeMatchReport.comparison_dimensions.map((item) => (
                      <div key={item.key} className="major-comparison-card">
                        <RowBetween><strong>{item.title}</strong><ScorePill>{item.status_label}</ScorePill></RowBetween>
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
                        <RowBetween><strong>{card.title}</strong><ScorePill>{card.match_score}</ScorePill></RowBetween>
                        <Muted>{card.scenario}</Muted>
                        <Probe>证据任务：{card.proof_task}</Probe>
                        <div className="major-chip-row">{card.requirement_keywords.slice(0, 4).map((item) => <Chip key={item} tone="soft">{item}</Chip>)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          <div className="major-grid-3">
            <Panel title="12 维探索画像">
              <div className="major-score-list">
                {plan.dimension_scores.map((item) => (
                  <div key={item.key} className="major-mini-card">
                    <RowBetween><strong>{item.title}</strong><ScorePill>{item.score}</ScorePill></RowBetween>
                    <ProgressBar value={item.score} />
                    <Probe>{item.next_probe}</Probe>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="专业知识广度地图">
              <div className="major-card-grid">
                {plan.knowledge_map.map((node) => (
                  <button key={node.id} onClick={() => onUseKnowledge({ knowledge_id: node.id, knowledge_name: node.title, reason: node.why, suggested_difficulty: node.difficulty })} className="major-click-card" title={node.why}>
                    <Chip>{CATEGORY_LABELS[node.category]}</Chip>
                    <strong>{node.title}</strong>
                    <Probe>难度 {node.difficulty}</Probe>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel title="候选职业方向">
              <div className="major-list-stack">
                {plan.career_directions.map((direction) => (
                  <div key={direction.id} className="major-mini-card">
                    <RowBetween><strong>{direction.title}</strong><ScorePill>{direction.fit_score}</ScorePill></RowBetween>
                    <Muted>{direction.why_explore.join(' ')}</Muted>
                    <Probe>首个验证任务：{tasksById.get(direction.first_probe_task_id) || direction.first_probe_task_id}</Probe>
                    <div className="major-role-profile"><Chip>{direction.exploration_domain || '探索方向'}</Chip><small>{direction.requirement_profile.core_skills.slice(0, 4).join('、')}</small></div>
                    {direction.requirement_profile.evidence_suggestions.length > 0 && <Probe>证据建议：{direction.requirement_profile.evidence_suggestions[0]}</Probe>}
                    <MajorButton variant="small" onClick={() => handleCreateWorkspace(direction)} disabled={workspaceLoading}>{workspaceLoading ? '创建中…' : '收藏并生成路径'}</MajorButton>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <Panel title="三阶段学习路径">
            <div className="major-path-grid">
              {plan.learning_path.map((phase) => (
                <div key={phase.phase} className="major-path-card">
                  <RowBetween><strong>{phase.label}</strong><Chip tone="soft">{phase.horizon}</Chip></RowBetween>
                  <Muted>{phase.goal}</Muted>
                  <List items={phase.deliverables} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="推荐生成学习资源的知识点">
            <div className="major-card-grid">
              {plan.recommended_knowledge.map((item) => (
                <button key={item.knowledge_id} onClick={() => onUseKnowledge(item)} className="major-click-card">
                  <strong>{item.knowledge_name}</strong>
                  <span>{item.reason}</span>
                </button>
              ))}
            </div>
          </Panel>

          {workspace && (
            <WorkspaceSection
              workspace={workspace}
              growthReport={growthReport}
              reportText={reportText}
              reviewText={reviewText}
              profileKey={profileKey}
              profileValueText={profileValueText}
              coachQuestion={coachQuestion}
              coachTone={coachTone}
              coach={coach}
              setReportText={setReportText}
              setReviewText={setReviewText}
              setProfileKey={setProfileKey}
              setProfileValueText={setProfileValueText}
              setCoachQuestion={setCoachQuestion}
              setCoachTone={setCoachTone}
              handleBuildReport={handleBuildReport}
              handleSaveReport={handleSaveReport}
              handleDownloadReport={handleDownloadReport}
              handleSaveProfile={handleSaveProfile}
              handleResourceStatus={handleResourceStatus}
              handleAskCoach={handleAskCoach}
              handleToggleTask={handleToggleTask}
              handleAddReview={handleAddReview}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface WorkspaceSectionProps {
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
  setProfileKey: (value: string) => void;
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

function WorkspaceSection({
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
}: WorkspaceSectionProps) {
  return (
    <>
      <Panel title={`探索路径工作区：${workspace.favorite.direction.title}`} action={<MajorButton variant="small" onClick={handleBuildReport}>生成成长报告</MajorButton>} cream>
        {workspace.match_report && (
          <div className="major-workspace-strip">
            <div className="major-mini-score"><strong>{workspace.match_report.overall_match}</strong><span>匹配度</span></div>
            <div>
              <strong>{workspace.match_report.target_title}</strong>
              <Probe>优势：{workspace.match_report.strength_dimensions.slice(0, 3).join('、') || '待补证据'} · 差距：{workspace.match_report.priority_gap_dimensions.slice(0, 3).join('、') || '待观察'}</Probe>
            </div>
          </div>
        )}

        <div className="major-profile-editor">
          <Field label="画像维度">
            <MajorSelect
              value={profileKey}
              onChange={(e) => {
                const nextKey = e.target.value;
                setProfileKey(nextKey);
                setProfileValueText((workspace.profile[nextKey] || []).join('，'));
              }}
            >
              {Object.entries(PROFILE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </MajorSelect>
          </Field>
          <Field label="关键词"><MajorInput value={profileValueText} onChange={(e) => setProfileValueText(e.target.value)} /></Field>
          <MajorButton variant="small" onClick={handleSaveProfile}>保存画像</MajorButton>
        </div>

        <div className="major-chip-grid">
          {workspace.dimension_scores.map((item) => (
            <div key={item.key} className="major-chip-box">
              <strong>{item.title}</strong>
              <ScorePill>{item.score}</ScorePill>
              <small>{item.evidence.slice(0, 3).join('、') || '待补充'}</small>
            </div>
          ))}
        </div>

        {workspace.profile_versions.length > 0 && <Probe>最近画像更新：{PROFILE_LABELS[workspace.profile_versions[0].changed_dimension]} → {workspace.profile_versions[0].next_values.join('、') || '空'}</Probe>}

        {workspace.resources.length > 0 && (
          <div className="major-resource-grid">
            {workspace.resources.map((resource) => (
              <div key={resource.resource_id} className="major-resource-card">
                <RowBetween>
                  <div className="major-chip-row"><Badge>{resource.logo_hint}</Badge><strong>{resource.title}</strong></div>
                  <div className="major-chip-row"><ScorePill>{resource.quality_score}</ScorePill><Chip tone="soft">{statusLabel(resource.status)}</Chip></div>
                </RowBetween>
                <Probe>{resource.source_name} / {resource.resource_type}</Probe>
                <Muted>{resource.reason}</Muted>
                <div className="major-resource-actions">
                  <MajorButton variant="small" onClick={() => handleResourceStatus(resource, 'opened')}>打开资源</MajorButton>
                  <MajorButton variant="small" onClick={() => handleResourceStatus(resource, 'completed')}>标记完成</MajorButton>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="major-coach-card">
          <RowBetween>
            <h4>探索教练</h4>
            <MajorSelect value={coachTone} onChange={(e) => setCoachTone(e.target.value as CoachTone)}>
              <option value="encourage">鼓励</option>
              <option value="diagnose">诊断</option>
              <option value="challenge">挑战</option>
            </MajorSelect>
          </RowBetween>
          <div className="major-coach-row">
            <MajorInput value={coachQuestion} onChange={(e) => setCoachQuestion(e.target.value)} />
            <MajorButton variant="small" onClick={handleAskCoach}>获取建议</MajorButton>
          </div>
          {coach && (
            <div>
              <Muted>{coach.summary}</Muted>
              <div className="major-suggestion-grid">
                {coach.suggestions.map((item) => (
                  <div key={`${item.title}-${item.action}`} className="major-coach-card">
                    <strong>{item.title}</strong>
                    <Muted>{item.reason}</Muted>
                    <Probe>{item.action}</Probe>
                    <small>{item.evidence_to_collect}</small>
                  </div>
                ))}
              </div>
              <List items={coach.follow_up_questions} />
            </div>
          )}
        </div>

        <div className="major-workspace-grid">
          {workspace.phases.map((phase) => (
            <div key={phase.phase} className="major-path-card">
              <RowBetween><strong>{phase.label}</strong><ScorePill>{phase.progress_percent}%</ScorePill></RowBetween>
              <ProgressBar value={phase.progress_percent} />
              <Muted>{phase.goal}</Muted>
              <div className="major-list-stack">
                {phase.tasks.map((task) => (
                  <button key={`${phase.phase}-${task.id}`} onClick={() => handleToggleTask(task)} className={task.status === 'done' ? 'major-task-card major-task-card--done' : 'major-task-card'}>
                    <Chip>{task.status === 'done' ? '已完成' : '待完成'}</Chip>
                    <strong>{task.title}</strong>
                    <small>{task.evidence_to_collect}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="major-review-row">
          <MajorTextarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} />
          <MajorButton variant="small" onClick={handleAddReview}>保存周复盘</MajorButton>
        </div>

        {workspace.reviews.length > 0 && (
          <div className="major-review-grid">
            {workspace.reviews.map((review) => (
              <div key={review.review_id} className="major-review-card">
                <strong>{review.review_type === 'weekly' ? '周复盘' : '月复盘'}</strong>
                <Muted>{review.summary}</Muted>
                <List items={review.next_actions} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {growthReport && (
        <Panel
          title={growthReport.title}
          subtitle={growthReport.is_customized ? '已保存编辑稿' : '自动生成草稿'}
          action={
            <div className="major-report-actions">
              <MajorButton variant="small" onClick={handleSaveReport}>保存编辑</MajorButton>
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
