import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
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
        interests: interestText
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        weekly_hours: weeklyHours,
      };
      const res = await fetch('/api/exploration/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
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

  const postJson = async <T,>(url: string, body: unknown, method = 'POST'): Promise<T> => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()) as T;
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
        {
          status: task.status === 'done' ? 'pending' : 'done',
          note: task.status === 'done' ? '' : '已完成并记录证据',
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

  const handleAddReview = async () => {
    if (!workspace) return;
    setError(null);
    try {
      const next = await postJson<ExplorationWorkspace>(
        `/api/exploration/workspaces/${workspace.workspace_id}/reviews`,
        {
          review_type: 'weekly',
          phase: 'short_term',
          summary: reviewText,
        },
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
          values: profileValueText
            .split(/[，,]/)
            .map((item) => item.trim())
            .filter(Boolean),
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

  const handleResourceStatus = async (
    resource: WorkspaceResource,
    status: WorkspaceResource['status'],
  ) => {
    if (!workspace) return;
    setError(null);
    try {
      if (status === 'opened') {
        window.open(resource.url, '_blank', 'noopener,noreferrer');
      }
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
        {
          question: coachQuestion,
          tone: coachTone,
        },
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
      const res = await fetch(
        `/api/exploration/workspaces/${workspace.workspace_id}/growth-report/export?format=${format}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${workspace.favorite.direction.title}-专业探索成长报告.${
        format === 'html' ? 'html' : 'md'
      }`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div style={shellStyle}>
      <section style={controlBandStyle}>
        <div style={fieldStyle}>
          <label style={labelStyle}>专业</label>
          <input value={major} onChange={(e) => setMajor(e.target.value)} style={inputStyle} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>年级</label>
          <input value={grade} onChange={(e) => setGrade(e.target.value)} style={inputStyle} />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>学历</label>
          <input
            value={educationLevel}
            onChange={(e) => setEducationLevel(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>基础</label>
          <select
            value={foundationLevel}
            onChange={(e) => setFoundationLevel(e.target.value as ExplorationLevel)}
            style={inputStyle}
          >
            {LEVEL_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>每周小时</label>
          <input
            type="number"
            min={1}
            max={60}
            value={weeklyHours}
            onChange={(e) => setWeeklyHours(Number(e.target.value) || 1)}
            style={inputStyle}
          />
        </div>
        <div style={{ ...fieldStyle, minWidth: 220 }}>
          <label style={labelStyle}>兴趣关键词</label>
          <input
            value={interestText}
            onChange={(e) => setInterestText(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button onClick={handleBuild} disabled={loading} style={primaryButtonStyle}>
          {loading ? '生成中...' : '生成探索计划'}
        </button>
      </section>

      {error && <div style={errorStyle}>{error}</div>}

      {!plan ? (
        <div style={emptyStyle}>从专业开始生成探索计划，不需要简历，也不要求先确定目标岗位。</div>
      ) : (
        <div style={contentStyle}>
          <section style={summaryBandStyle}>
            <div>
              <h2 style={h2Style}>{plan.major} 探索工作台</h2>
              <p style={mutedTextStyle}>{plan.summary}</p>
            </div>
            <div style={summaryStatsStyle}>
              <strong>{plan.knowledge_map.length}</strong>
              <span>知识节点</span>
              <strong>{plan.career_directions.length}</strong>
              <span>候选方向</span>
            </div>
          </section>

          <div style={gridStyle}>
            <section style={panelStyle}>
              <h3 style={h3Style}>12 维探索画像</h3>
              <div style={scoreListStyle}>
                {plan.dimension_scores.map((item) => (
                  <div key={item.key} style={scoreItemStyle}>
                    <div style={scoreHeaderStyle}>
                      <span>{item.title}</span>
                      <strong>{item.score}</strong>
                    </div>
                    <div style={barTrackStyle}>
                      <div style={{ ...barFillStyle, width: `${item.score}%` }} />
                    </div>
                    <p style={probeStyle}>{item.next_probe}</p>
                  </div>
                ))}
              </div>
            </section>

            <section style={panelStyle}>
              <h3 style={h3Style}>专业知识广度地图</h3>
              <div style={knowledgeGridStyle}>
                {plan.knowledge_map.map((node) => (
                  <button
                    key={node.id}
                    onClick={() =>
                      onUseKnowledge({
                        knowledge_id: node.id,
                        knowledge_name: node.title,
                        reason: node.why,
                        suggested_difficulty: node.difficulty,
                      })
                    }
                    style={knowledgeButtonStyle}
                    title={node.why}
                  >
                    <span style={tagStyle}>{CATEGORY_LABELS[node.category]}</span>
                    <strong>{node.title}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section style={panelStyle}>
              <h3 style={h3Style}>候选职业方向</h3>
              <div style={directionListStyle}>
                {plan.career_directions.map((direction) => (
                  <div key={direction.id} style={directionItemStyle}>
                    <div style={scoreHeaderStyle}>
                      <strong>{direction.title}</strong>
                      <span style={fitStyle}>{direction.fit_score}</span>
                    </div>
                    <p style={mutedTextStyle}>{direction.why_explore.join(' ')}</p>
                    <p style={probeStyle}>
                      首个验证任务：{tasksById.get(direction.first_probe_task_id) || direction.first_probe_task_id}
                    </p>
                    <button
                      onClick={() => handleCreateWorkspace(direction)}
                      disabled={workspaceLoading}
                      style={smallButtonStyle}
                    >
                      {workspaceLoading ? '创建中...' : '收藏并生成路径'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section style={panelStyle}>
            <h3 style={h3Style}>三阶段学习路径</h3>
            <div style={pathGridStyle}>
              {plan.learning_path.map((phase) => (
                <div key={phase.phase} style={pathItemStyle}>
                  <div style={scoreHeaderStyle}>
                    <strong>{phase.label}</strong>
                    <span>{phase.horizon}</span>
                  </div>
                  <p style={mutedTextStyle}>{phase.goal}</p>
                  <ul style={listStyle}>
                    {phase.deliverables.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section style={panelStyle}>
            <h3 style={h3Style}>推荐生成学习资源的知识点</h3>
            <div style={recommendedGridStyle}>
              {plan.recommended_knowledge.map((item) => (
                <button
                  key={item.knowledge_id}
                  onClick={() => onUseKnowledge(item)}
                  style={recommendedButtonStyle}
                >
                  <strong>{item.knowledge_name}</strong>
                  <span>{item.reason}</span>
                </button>
              ))}
            </div>
          </section>

          {workspace && (
            <section style={panelStyle}>
              <div style={scoreHeaderStyle}>
                <h3 style={h3Style}>探索路径工作区：{workspace.favorite.direction.title}</h3>
                <button onClick={handleBuildReport} style={smallButtonStyle}>
                  生成成长报告
                </button>
              </div>
              <div style={profileEditorStyle}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>画像维度</label>
                  <select
                    value={profileKey}
                    onChange={(e) => {
                      const nextKey = e.target.value;
                      setProfileKey(nextKey);
                      setProfileValueText((workspace.profile[nextKey] || []).join('，'));
                    }}
                    style={inputStyle}
                  >
                    {Object.entries(PROFILE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ ...fieldStyle, flex: 1 }}>
                  <label style={labelStyle}>关键词</label>
                  <input
                    value={profileValueText}
                    onChange={(e) => setProfileValueText(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <button onClick={handleSaveProfile} style={smallButtonStyle}>
                  保存画像
                </button>
              </div>
              <div style={chipGridStyle}>
                {workspace.dimension_scores.map((item) => (
                  <div key={item.key} style={chipBoxStyle}>
                    <strong>{item.title}</strong>
                    <span>{item.score}</span>
                    <small>{item.evidence.slice(0, 3).join('、') || '待补充'}</small>
                  </div>
                ))}
              </div>
              {workspace.profile_versions.length > 0 && (
                <p style={probeStyle}>
                  最近画像更新：{PROFILE_LABELS[workspace.profile_versions[0].changed_dimension]} {'->'}{' '}
                  {workspace.profile_versions[0].next_values.join('、') || '空'}
                </p>
              )}
              {workspace.resources.length > 0 && (
                <div style={resourceSectionStyle}>
                  <h4 style={h4Style}>学习资源卡片</h4>
                  <div style={resourceGridStyle}>
                    {workspace.resources.map((resource) => (
                      <div key={resource.resource_id} style={resourceCardStyle}>
                        <div style={scoreHeaderStyle}>
                          <strong>{resource.title}</strong>
                          <span style={resourceStatusStyle(resource.status)}>
                            {resource.status === 'completed'
                              ? '已完成'
                              : resource.status === 'opened'
                                ? '已打开'
                                : '待学习'}
                          </span>
                        </div>
                        <p style={mutedTextStyle}>{resource.reason}</p>
                        <div style={resourceActionsStyle}>
                          <button
                            onClick={() => handleResourceStatus(resource, 'opened')}
                            style={smallButtonStyle}
                          >
                            打开资源
                          </button>
                          <button
                            onClick={() => handleResourceStatus(resource, 'completed')}
                            style={smallButtonStyle}
                          >
                            标记完成
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={coachBoxStyle}>
                <div style={scoreHeaderStyle}>
                  <h4 style={h4Style}>探索教练</h4>
                  <select
                    value={coachTone}
                    onChange={(e) => setCoachTone(e.target.value as CoachTone)}
                    style={compactSelectStyle}
                  >
                    <option value="encourage">鼓励</option>
                    <option value="diagnose">诊断</option>
                    <option value="challenge">挑战</option>
                  </select>
                </div>
                <div style={coachInputRowStyle}>
                  <input
                    value={coachQuestion}
                    onChange={(e) => setCoachQuestion(e.target.value)}
                    style={inputStyle}
                  />
                  <button onClick={handleAskCoach} style={smallButtonStyle}>
                    获取建议
                  </button>
                </div>
                {coach && (
                  <div style={coachResultStyle}>
                    <p style={mutedTextStyle}>{coach.summary}</p>
                    <div style={coachSuggestionGridStyle}>
                      {coach.suggestions.map((item) => (
                        <div key={`${item.title}-${item.action}`} style={coachSuggestionStyle}>
                          <strong>{item.title}</strong>
                          <p style={mutedTextStyle}>{item.reason}</p>
                          <p style={probeStyle}>{item.action}</p>
                          <small>{item.evidence_to_collect}</small>
                        </div>
                      ))}
                    </div>
                    <ul style={listStyle}>
                      {coach.follow_up_questions.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div style={workspaceGridStyle}>
                {workspace.phases.map((phase) => (
                  <div key={phase.phase} style={pathItemStyle}>
                    <div style={scoreHeaderStyle}>
                      <strong>{phase.label}</strong>
                      <span>{phase.progress_percent}%</span>
                    </div>
                    <div style={barTrackStyle}>
                      <div style={{ ...barFillStyle, width: `${phase.progress_percent}%` }} />
                    </div>
                    <p style={mutedTextStyle}>{phase.goal}</p>
                    <div style={taskListStyle}>
                      {phase.tasks.map((task) => (
                        <button
                          key={`${phase.phase}-${task.id}`}
                          onClick={() => handleToggleTask(task)}
                          style={taskButtonStyle(task.status === 'done')}
                        >
                          <span>{task.status === 'done' ? '已完成' : '待完成'}</span>
                          <strong>{task.title}</strong>
                          <small>{task.evidence_to_collect}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div style={reviewBoxStyle}>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  style={textareaStyle}
                />
                <button onClick={handleAddReview} style={smallButtonStyle}>
                  保存周复盘
                </button>
              </div>

              {workspace.reviews.length > 0 && (
                <div style={reviewListStyle}>
                  {workspace.reviews.map((review) => (
                    <div key={review.review_id} style={reviewItemStyle}>
                      <strong>{review.review_type === 'weekly' ? '周复盘' : '月复盘'}</strong>
                      <p style={mutedTextStyle}>{review.summary}</p>
                      <ul style={listStyle}>
                        {review.next_actions.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {growthReport && (
            <section style={panelStyle}>
              <div style={scoreHeaderStyle}>
                <div>
                  <h3 style={h3Style}>{growthReport.title}</h3>
                  <p style={probeStyle}>{growthReport.is_customized ? '已保存编辑稿' : '自动生成草稿'}</p>
                </div>
                <div style={reportActionsStyle}>
                  <button onClick={handleSaveReport} style={smallButtonStyle}>
                    保存编辑
                  </button>
                  <button onClick={() => handleDownloadReport('markdown')} style={smallButtonStyle}>
                    下载 MD
                  </button>
                  <button onClick={() => handleDownloadReport('html')} style={smallButtonStyle}>
                    下载 HTML
                  </button>
                </div>
              </div>
              <textarea
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                style={reportEditorStyle}
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

const shellStyle: CSSProperties = {
  padding: '0 24px 24px',
};

const controlBandStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'end',
  gap: 10,
  padding: '12px 0',
  flexWrap: 'wrap',
};

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 120,
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  color: '#5f6368',
};

const inputStyle: CSSProperties = {
  height: 32,
  border: '1px solid #d5d9df',
  borderRadius: 4,
  padding: '0 10px',
  background: '#fff',
  color: '#1f2328',
};

const compactSelectStyle: CSSProperties = {
  ...inputStyle,
  minWidth: 84,
};

const primaryButtonStyle: CSSProperties = {
  height: 34,
  padding: '0 16px',
  border: 'none',
  borderRadius: 6,
  background: '#256f6c',
  color: '#fff',
  cursor: 'pointer',
};

const errorStyle: CSSProperties = {
  padding: 10,
  borderRadius: 6,
  background: '#fff1f0',
  color: '#b42318',
  fontSize: 13,
};

const emptyStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minHeight: 360,
  color: '#6b7280',
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
};

const contentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const summaryBandStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 16,
  padding: 16,
  border: '1px solid #dbe3e1',
  borderRadius: 8,
  background: '#f8fbfa',
};

const h2Style: CSSProperties = {
  margin: 0,
  fontSize: 18,
};

const h3Style: CSSProperties = {
  margin: '0 0 10px',
  fontSize: 15,
};

const h4Style: CSSProperties = {
  margin: 0,
  fontSize: 14,
};

const mutedTextStyle: CSSProperties = {
  margin: '4px 0 0',
  color: '#5f6368',
  fontSize: 13,
  lineHeight: 1.55,
};

const summaryStatsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto auto',
  alignItems: 'center',
  gap: '2px 8px',
  minWidth: 120,
  color: '#374151',
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(260px, 0.9fr) minmax(320px, 1.2fr) minmax(260px, 0.9fr)',
  gap: 14,
};

const panelStyle: CSSProperties = {
  padding: 14,
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  background: '#fff',
};

const scoreListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const scoreItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const scoreHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'center',
  fontSize: 13,
};

const barTrackStyle: CSSProperties = {
  height: 7,
  borderRadius: 999,
  background: '#eef0f2',
  overflow: 'hidden',
};

const barFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: '#d97706',
};

const probeStyle: CSSProperties = {
  margin: 0,
  color: '#6b7280',
  fontSize: 12,
  lineHeight: 1.45,
};

const knowledgeGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 8,
};

const knowledgeButtonStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minHeight: 78,
  padding: 10,
  border: '1px solid #dde2e7',
  borderRadius: 6,
  background: '#fafafa',
  color: '#1f2328',
  textAlign: 'left',
  cursor: 'pointer',
};

const tagStyle: CSSProperties = {
  width: 'fit-content',
  padding: '2px 6px',
  borderRadius: 999,
  background: '#edf2f7',
  color: '#415466',
  fontSize: 11,
};

const directionListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const directionItemStyle: CSSProperties = {
  padding: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fcfcfd',
};

const fitStyle: CSSProperties = {
  minWidth: 34,
  textAlign: 'center',
  padding: '2px 6px',
  borderRadius: 999,
  background: '#e6f4f1',
  color: '#256f6c',
  fontWeight: 700,
};

const pathGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 12,
};

const pathItemStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: 12,
  background: '#fdfdfc',
};

const listStyle: CSSProperties = {
  margin: '8px 0 0',
  paddingLeft: 18,
  color: '#4b5563',
  fontSize: 13,
  lineHeight: 1.6,
};

const recommendedGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
};

const recommendedButtonStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 12,
  border: '1px solid #d8dee4',
  borderRadius: 6,
  background: '#f6f8fa',
  color: '#24292f',
  textAlign: 'left',
  cursor: 'pointer',
};

const smallButtonStyle: CSSProperties = {
  marginTop: 8,
  padding: '6px 10px',
  border: '1px solid #cfd8dc',
  borderRadius: 6,
  background: '#ffffff',
  color: '#256f6c',
  cursor: 'pointer',
  fontWeight: 700,
};

const resourceSectionStyle: CSSProperties = {
  margin: '12px 0',
};

const resourceGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 10,
  marginTop: 8,
};

const resourceCardStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: 10,
  background: '#fbfcfd',
};

const resourceActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
};

const resourceStatusStyle = (status: WorkspaceResource['status']): CSSProperties => ({
  minWidth: 52,
  textAlign: 'center',
  padding: '2px 6px',
  borderRadius: 999,
  background:
    status === 'completed' ? '#e7f7ed' : status === 'opened' ? '#fff7e6' : '#edf2f7',
  color: status === 'completed' ? '#18794e' : status === 'opened' ? '#9a6700' : '#4b5563',
  fontWeight: 700,
  fontSize: 12,
});

const coachBoxStyle: CSSProperties = {
  margin: '12px 0',
  padding: 10,
  border: '1px solid #dbe3e1',
  borderRadius: 6,
  background: '#f8fbfa',
};

const coachInputRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 10,
  alignItems: 'end',
};

const coachResultStyle: CSSProperties = {
  marginTop: 10,
};

const coachSuggestionGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
  marginTop: 10,
};

const coachSuggestionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fff',
  fontSize: 13,
};

const workspaceGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 12,
};

const taskListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginTop: 10,
};

const taskButtonStyle = (done: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  padding: 10,
  border: done ? '1px solid #b7dbc8' : '1px solid #e5e7eb',
  borderRadius: 6,
  background: done ? '#f0faf4' : '#fff',
  color: '#25313b',
  textAlign: 'left',
  cursor: 'pointer',
});

const reviewBoxStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'start',
  gap: 10,
  marginTop: 14,
};

const textareaStyle: CSSProperties = {
  minHeight: 74,
  resize: 'vertical',
  border: '1px solid #d8dee4',
  borderRadius: 6,
  padding: 10,
  font: 'inherit',
};

const reviewListStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 10,
  marginTop: 12,
};

const reviewItemStyle: CSSProperties = {
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: 10,
  background: '#fcfcfd',
};

const reportActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
};

const reportEditorStyle: CSSProperties = {
  width: '100%',
  minHeight: 360,
  resize: 'vertical',
  padding: 12,
  border: '1px solid #d8dee4',
  borderRadius: 6,
  background: '#f6f8fa',
  color: '#24292f',
  fontSize: 13,
  lineHeight: 1.55,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  boxSizing: 'border-box',
};

const profileEditorStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'end',
  gap: 10,
  margin: '8px 0 12px',
  flexWrap: 'wrap',
};

const chipGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 8,
  marginBottom: 12,
};

const chipBoxStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '4px 8px',
  padding: 8,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fbfcfd',
  fontSize: 12,
};
