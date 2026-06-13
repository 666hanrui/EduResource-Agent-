import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
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
import { createStudentExplorationSession } from '../../api/studentExploration';
import {
  Badge,
  EmptyPrompt,
  ErrorNotice,
  Eyebrow,
  Field,
  MajorButton,
  MajorInput,
  MajorSelect,
  Muted,
  Panel,
  Probe,
  ProgressBar,
  RowBetween,
  ScorePill,
} from './FreddiePrimitives';
import { AdventureExplorationMap } from './AdventureExplorationMap';
import { KnowledgeAtlas } from './KnowledgeAtlas';
import { MatchWorkbench } from './MatchWorkbench';
import { LEVEL_OPTIONS, buildExplorationMetrics } from './model';
import { WorkspaceSection } from './WorkspaceSection';
import './major-exploration.css';

interface Props {
  studentId: string;
  buildSignal?: number;
  onUseKnowledge: (item: RecommendedKnowledge) => void;
  onExplorationPersisted?: () => void;
}

interface RequestDraft {
  major: string;
  grade: string;
  educationLevel: string;
  foundationLevel: ExplorationLevel;
  weeklyHours: number;
  interestText: string;
}

interface MajorExplorationState {
  request: RequestDraft;
  plan: ExplorationPlan | null;
  activeMatchDirectionId: string | null;
  workspace: ExplorationWorkspace | null;
  growthReport: GrowthReport | null;
  reportText: string;
  reviewText: string;
  profileKey: string;
  profileValueText: string;
  coachQuestion: string;
  coachTone: CoachTone;
  coach: CoachResponse | null;
  loading: boolean;
  workspaceLoading: boolean;
  error: string | null;
}

type MajorExplorationAction =
  | { type: 'REQUEST_FIELD'; field: keyof RequestDraft; value: string | number }
  | { type: 'PLAN_STARTED' }
  | { type: 'PLAN_SUCCEEDED'; plan: ExplorationPlan }
  | { type: 'PLAN_FAILED'; error: string }
  | { type: 'SET_ACTIVE_MATCH'; directionId: string | null }
  | { type: 'WORKSPACE_STARTED' }
  | { type: 'WORKSPACE_SUCCEEDED'; workspace: ExplorationWorkspace }
  | { type: 'WORKSPACE_FAILED'; error: string }
  | { type: 'WORKSPACE_UPDATED'; workspace: ExplorationWorkspace }
  | { type: 'REPORT_SUCCEEDED'; report: GrowthReport }
  | { type: 'SET_REPORT_TEXT'; value: string }
  | { type: 'SET_REVIEW_TEXT'; value: string }
  | { type: 'SET_PROFILE_KEY'; key: string; valueText: string }
  | { type: 'SET_PROFILE_VALUE_TEXT'; value: string }
  | { type: 'SET_COACH_QUESTION'; value: string }
  | { type: 'SET_COACH_TONE'; tone: CoachTone }
  | { type: 'COACH_SUCCEEDED'; coach: CoachResponse }
  | { type: 'SET_ERROR'; error: string | null };

const INITIAL_STATE: MajorExplorationState = {
  request: {
    major: '计算机科学与技术',
    grade: '大一',
    educationLevel: '本科',
    foundationLevel: 'beginner',
    weeklyHours: 6,
    interestText: 'AI 应用，Web 开发',
  },
  plan: null,
  activeMatchDirectionId: null,
  workspace: null,
  growthReport: null,
  reportText: '',
  reviewText: '这周完成了一个小任务，发现自己更喜欢能看到结果的方向。',
  profileKey: 'professional_skills',
  profileValueText: 'Python，SQL，React',
  coachQuestion: '我不知道这个方向适不适合我',
  coachTone: 'encourage',
  coach: null,
  loading: false,
  workspaceLoading: false,
  error: null,
};

const handledExternalBuildSignals = new Set<string>();

function resetWorkspaceDerived(state: MajorExplorationState): MajorExplorationState {
  return {
    ...state,
    growthReport: null,
    reportText: '',
    coach: null,
  };
}

function majorExplorationReducer(
  state: MajorExplorationState,
  action: MajorExplorationAction,
): MajorExplorationState {
  switch (action.type) {
    case 'REQUEST_FIELD':
      return {
        ...state,
        request: { ...state.request, [action.field]: action.value } as RequestDraft,
      };
    case 'PLAN_STARTED':
      return { ...state, loading: true, error: null };
    case 'PLAN_SUCCEEDED':
      return {
        ...state,
        loading: false,
        plan: action.plan,
        activeMatchDirectionId: action.plan.match_reports[0]?.direction_id ?? null,
        workspace: null,
        growthReport: null,
        reportText: '',
        coach: null,
      };
    case 'PLAN_FAILED':
      return { ...state, loading: false, error: action.error };
    case 'SET_ACTIVE_MATCH':
      return { ...state, activeMatchDirectionId: action.directionId };
    case 'WORKSPACE_STARTED':
      return { ...state, workspaceLoading: true, error: null };
    case 'WORKSPACE_SUCCEEDED':
      return resetWorkspaceDerived({ ...state, workspaceLoading: false, workspace: action.workspace });
    case 'WORKSPACE_FAILED':
      return { ...state, workspaceLoading: false, error: action.error };
    case 'WORKSPACE_UPDATED':
      return resetWorkspaceDerived({ ...state, workspace: action.workspace });
    case 'REPORT_SUCCEEDED':
      return { ...state, growthReport: action.report, reportText: action.report.markdown };
    case 'SET_REPORT_TEXT':
      return { ...state, reportText: action.value };
    case 'SET_REVIEW_TEXT':
      return { ...state, reviewText: action.value };
    case 'SET_PROFILE_KEY':
      return { ...state, profileKey: action.key, profileValueText: action.valueText };
    case 'SET_PROFILE_VALUE_TEXT':
      return { ...state, profileValueText: action.value };
    case 'SET_COACH_QUESTION':
      return { ...state, coachQuestion: action.value };
    case 'SET_COACH_TONE':
      return { ...state, coachTone: action.tone };
    case 'COACH_SUCCEEDED':
      return { ...state, coach: action.coach };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    default:
      return state;
  }
}

export function MajorExplorationPanel({ studentId, buildSignal = 0, onUseKnowledge, onExplorationPersisted }: Props) {
  const [state, dispatch] = useReducer(majorExplorationReducer, INITIAL_STATE);
  const autoBuildStarted = useRef(false);
  const {
    request,
    plan,
    activeMatchDirectionId,
    workspace,
    growthReport,
    reportText,
    reviewText,
    profileKey,
    profileValueText,
    coachQuestion,
    coachTone,
    coach,
    loading,
    workspaceLoading,
    error,
  } = state;
  const { major, grade, educationLevel, foundationLevel, weeklyHours, interestText } = request;

  const tasksById = useMemo(() => {
    const map = new Map<string, string>();
    plan?.exploration_tasks.forEach((task) => map.set(task.id, task.title));
    return map;
  }, [plan]);

  useEffect(() => {
    if (!plan?.match_reports.length) {
      if (activeMatchDirectionId !== null) dispatch({ type: 'SET_ACTIVE_MATCH', directionId: null });
      return;
    }
    if (!activeMatchDirectionId || !plan.match_reports.some((item) => item.direction_id === activeMatchDirectionId)) {
      dispatch({ type: 'SET_ACTIVE_MATCH', directionId: plan.match_reports[0].direction_id });
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

  const heroMetrics = useMemo(
    () => (plan ? buildExplorationMetrics(plan, workspace, activeMatchDirection) : []),
    [activeMatchDirection, plan, workspace],
  );

  const primaryRecommendations = useMemo(
    () => plan?.recommended_knowledge.slice(0, 4) ?? [],
    [plan],
  );

  const postJson = async <T,>(url: string, body: unknown, method = 'POST'): Promise<T> => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
  };

  const handleBuild = useCallback(async () => {
    dispatch({ type: 'PLAN_STARTED' });
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
      const next = await createStudentExplorationSession(studentId, payload);
      dispatch({ type: 'PLAN_SUCCEEDED', plan: next.plan });
      onExplorationPersisted?.();
    } catch (err) {
      dispatch({ type: 'PLAN_FAILED', error: err instanceof Error ? err.message : String(err) });
    }
  }, [educationLevel, foundationLevel, grade, interestText, major, onExplorationPersisted, studentId, weeklyHours]);

  useEffect(() => {
    if (autoBuildStarted.current || plan || loading) return;
    autoBuildStarted.current = true;
    void handleBuild();
  }, [handleBuild, loading, plan]);

  useEffect(() => {
    if (buildSignal <= 0) return;
    const signalKey = `${studentId}:${buildSignal}`;
    if (handledExternalBuildSignals.has(signalKey)) return;
    handledExternalBuildSignals.add(signalKey);
    void handleBuild();
  }, [buildSignal, handleBuild, studentId]);

  const handleCreateWorkspace = async (direction: CareerDirection) => {
    if (!plan) return;
    dispatch({ type: 'WORKSPACE_STARTED' });
    try {
      const next = await postJson<ExplorationWorkspace>('/api/exploration/workspaces', {
        student_id: studentId,
        plan,
        direction_id: direction.id,
      });
      dispatch({ type: 'WORKSPACE_SUCCEEDED', workspace: next });
    } catch (err) {
      dispatch({ type: 'WORKSPACE_FAILED', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleToggleTask = async (task: WorkspaceTask) => {
    if (!workspace) return;
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const next = await postJson<ExplorationWorkspace>(
        `/api/exploration/workspaces/${workspace.workspace_id}/tasks/${task.id}`,
        { status: task.status === 'done' ? 'pending' : 'done', note: task.status === 'done' ? '' : '已完成并记录证据' },
        'PATCH',
      );
      dispatch({ type: 'WORKSPACE_UPDATED', workspace: next });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleAddReview = async () => {
    if (!workspace) return;
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const next = await postJson<ExplorationWorkspace>(
        `/api/exploration/workspaces/${workspace.workspace_id}/reviews`,
        { review_type: 'weekly', phase: 'short_term', summary: reviewText },
      );
      dispatch({ type: 'WORKSPACE_UPDATED', workspace: next });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleBuildReport = async () => {
    if (!workspace) return;
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const res = await fetch(`/api/exploration/workspaces/${workspace.workspace_id}/growth-report`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const next = (await res.json()) as GrowthReport;
      dispatch({ type: 'REPORT_SUCCEEDED', report: next });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleSaveProfile = async () => {
    if (!workspace) return;
    dispatch({ type: 'SET_ERROR', error: null });
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
      dispatch({ type: 'WORKSPACE_UPDATED', workspace: next });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleResourceStatus = async (resource: WorkspaceResource, status: WorkspaceResource['status']) => {
    if (!workspace) return;
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      if (status === 'opened') window.open(resource.url, '_blank', 'noopener,noreferrer');
      const next = await postJson<ExplorationWorkspace>(
        `/api/exploration/workspaces/${workspace.workspace_id}/resources/${resource.resource_id}`,
        { status },
        'PATCH',
      );
      dispatch({ type: 'WORKSPACE_UPDATED', workspace: next });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleAskCoach = async () => {
    if (!workspace) return;
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const next = await postJson<CoachResponse>(
        `/api/exploration/workspaces/${workspace.workspace_id}/coach`,
        { question: coachQuestion, tone: coachTone },
      );
      dispatch({ type: 'COACH_SUCCEEDED', coach: next });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleSaveReport = async () => {
    if (!workspace) return;
    dispatch({ type: 'SET_ERROR', error: null });
    try {
      const next = await postJson<GrowthReport>(
        `/api/exploration/workspaces/${workspace.workspace_id}/growth-report`,
        { markdown: reportText },
        'PATCH',
      );
      dispatch({ type: 'REPORT_SUCCEEDED', report: next });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleDownloadReport = async (format: 'markdown' | 'html') => {
    if (!workspace) return;
    dispatch({ type: 'SET_ERROR', error: null });
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
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const startRecommendedKnowledge = (item: RecommendedKnowledge) => {
    onUseKnowledge(item);
  };

  return (
    <div className="major-workshop major-workshop--adventure">
      <section className="major-profile-strip">
        <div className="major-profile-strip__main">
          <Badge>Student Map</Badge>
          <strong>{major} · {grade}</strong>
          <span>{educationLevel} · {LEVEL_OPTIONS.find((item) => item.value === foundationLevel)?.label ?? foundationLevel} · 每周 {weeklyHours}h</span>
        </div>
        <details className="major-profile-drawer">
          <summary>{loading ? '生成中…' : '调整画像'}</summary>
          <section className="major-control-card major-control-card--drawer">
            <Field label="专业">
              <MajorInput value={major} onChange={(e) => dispatch({ type: 'REQUEST_FIELD', field: 'major', value: e.target.value })} />
            </Field>
            <Field label="年级">
              <MajorInput value={grade} onChange={(e) => dispatch({ type: 'REQUEST_FIELD', field: 'grade', value: e.target.value })} />
            </Field>
            <Field label="学历">
              <MajorInput value={educationLevel} onChange={(e) => dispatch({ type: 'REQUEST_FIELD', field: 'educationLevel', value: e.target.value })} />
            </Field>
            <Field label="基础">
              <MajorSelect value={foundationLevel} onChange={(e) => dispatch({ type: 'REQUEST_FIELD', field: 'foundationLevel', value: e.target.value as ExplorationLevel })}>
                {LEVEL_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </MajorSelect>
            </Field>
            <Field label="每周小时">
              <MajorInput type="number" min={1} max={60} value={weeklyHours} onChange={(e) => dispatch({ type: 'REQUEST_FIELD', field: 'weeklyHours', value: Number(e.target.value) || 1 })} />
            </Field>
            <Field label="兴趣关键词" wide>
              <MajorInput value={interestText} onChange={(e) => dispatch({ type: 'REQUEST_FIELD', field: 'interestText', value: e.target.value })} />
            </Field>
            <MajorButton variant="primary" onClick={handleBuild} disabled={loading}>{loading ? '生成中…' : '刷新地图'}</MajorButton>
          </section>
        </details>
      </section>

      {error && <ErrorNotice>{error}</ErrorNotice>}

      {!plan ? (
        loading ? (
          <section className="major-map-loading">
            <Badge>Adventure Map</Badge>
            <h2>正在生成你的探索地图</h2>
            <Muted>根据专业、阶段、兴趣和画像分数摆放节点。</Muted>
          </section>
        ) : (
          <EmptyPrompt />
        )
      ) : (
        <div className="major-content major-content--adventure-first">
          <section className="major-adventure-shell">
            <AdventureExplorationMap
              plan={plan}
              workspace={workspace}
              activeDirection={activeMatchDirection}
              onUseKnowledge={onUseKnowledge}
            />

            <aside className="major-adventure-command" aria-label="当前探索任务">
              <div className="major-adventure-command__head">
                <Eyebrow>Current Quest</Eyebrow>
                <h2>{activeMatchDirection?.title ?? `${plan.major} 探索`}</h2>
                <Muted>{activeMatchReport?.narrative.overall_review ?? plan.summary}</Muted>
              </div>

              <div className="major-quest-metrics">
                {heroMetrics.slice(0, 3).map((item) => (
                  <article key={item.label} className="major-overview-card">
                    <small>{item.label}</small>
                    <strong>{item.value}</strong>
                    <span>{item.detail}</span>
                  </article>
                ))}
              </div>

              <div className="major-quest-actions">
                {activeMatchDirection && (
                  <MajorButton
                    type="button"
                    variant="primary"
                    onClick={() => handleCreateWorkspace(activeMatchDirection)}
                    disabled={workspaceLoading}
                  >
                    {workspace ? '重建路线' : workspaceLoading ? '建立中…' : '建立路线'}
                  </MajorButton>
                )}
                {primaryRecommendations[0] && (
                  <MajorButton type="button" onClick={() => startRecommendedKnowledge(primaryRecommendations[0])}>
                    开始第一站
                  </MajorButton>
                )}
              </div>

              <div className="major-next-quest-list">
                {primaryRecommendations.map((item, index) => (
                  <button key={item.knowledge_id} type="button" onClick={() => startRecommendedKnowledge(item)}>
                    <span>{index + 1}</span>
                    <strong>{item.knowledge_name}</strong>
                    <small>{item.stage_title}</small>
                  </button>
                ))}
              </div>
            </aside>
          </section>

          <details className="major-secondary-drawer">
            <summary>知识结构与方向匹配</summary>
            <div className="major-secondary-stack">
              <KnowledgeAtlas
                plan={plan}
                workspace={workspace}
                activeDirection={activeMatchDirection}
                onUseKnowledge={onUseKnowledge}
              />

              <MatchWorkbench
                plan={plan}
                activeMatchReport={activeMatchReport}
                activeMatchDirection={activeMatchDirection}
                tasksById={tasksById}
                workspaceLoading={workspaceLoading}
                onSelectDirection={(directionId) => dispatch({ type: 'SET_ACTIVE_MATCH', directionId })}
                onCreateWorkspace={handleCreateWorkspace}
              />
            </div>
          </details>

          <details className="major-secondary-drawer">
            <summary>画像、路径和 Agent 证据</summary>
            <div className="major-grid-2 major-grid-2--balanced">
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

              <Panel title="三阶段学习路径">
                <div className="major-path-grid">
                  {plan.learning_path.map((phase) => (
                    <div key={phase.phase} className="major-path-card">
                      <RowBetween><strong>{phase.label}</strong><Badge>{phase.horizon}</Badge></RowBetween>
                      <Muted>{phase.goal}</Muted>
                      <ul className="major-list">
                        {phase.deliverables.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <div className="major-grid-2 major-grid-2--balanced">
              {plan.agent_steps.length > 0 && (
                <Panel title="探索流水线" action={<Badge>{plan.agent_steps.length} Agents</Badge>} cream>
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
                        <div className="major-chip-row">
                          {step.evidence_refs.slice(0, 3).map((item) => <Badge key={item}>{item}</Badge>)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <Panel title="可转入课堂的知识点">
                <div className="major-card-grid">
                  {plan.recommended_knowledge.map((item) => (
                    <article
                      key={item.knowledge_id}
                      className="major-click-card major-click-card--stage"
                      role="button"
                      tabIndex={0}
                      onClick={() => startRecommendedKnowledge(item)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        startRecommendedKnowledge(item);
                      }}
                    >
                      <div className="major-click-card__stage-top">
                        <Badge>{item.stage_title}</Badge>
                        <ScorePill>{item.suggested_difficulty} 星</ScorePill>
                      </div>
                      <strong>{item.knowledge_name}</strong>
                      <span>{item.reason}</span>
                      <div className="major-click-card__detail">
                        <small>阶段验证题</small>
                        <p>{item.validation_prompt}</p>
                      </div>
                      <div className="major-click-card__detail">
                        <small>完成标准</small>
                        <p>{item.success_criteria}</p>
                      </div>
                      <div className="major-click-card__footer">
                        <Probe>{item.recommended_action}</Probe>
                        <MajorButton
                          type="button"
                          variant="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            startRecommendedKnowledge(item);
                          }}
                        >
                          去课堂
                        </MajorButton>
                      </div>
                    </article>
                  ))}
                </div>
              </Panel>
            </div>
          </details>

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
              setReportText={(value) => dispatch({ type: 'SET_REPORT_TEXT', value })}
              setReviewText={(value) => dispatch({ type: 'SET_REVIEW_TEXT', value })}
              setProfileKey={(key, valueText) => dispatch({ type: 'SET_PROFILE_KEY', key, valueText })}
              setProfileValueText={(value) => dispatch({ type: 'SET_PROFILE_VALUE_TEXT', value })}
              setCoachQuestion={(value) => dispatch({ type: 'SET_COACH_QUESTION', value })}
              setCoachTone={(tone) => dispatch({ type: 'SET_COACH_TONE', tone })}
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
