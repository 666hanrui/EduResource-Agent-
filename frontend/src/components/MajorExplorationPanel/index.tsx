import { useEffect, useMemo, useState } from 'react';
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
    return (
      plan.match_reports.find((item) => item.direction_id === activeMatchDirectionId) ||
      plan.match_reports[0]
    );
  }, [activeMatchDirectionId, plan]);

  const activeMatchDirection = useMemo(() => {
    if (!plan || !activeMatchReport) return null;
    return plan.career_directions.find((item) => item.id === activeMatchReport.direction_id) || null;
  }, [activeMatchReport, plan]);

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

          {plan.agent_steps.length > 0 && (
            <section style={agentPipelineStyle}>
              <div style={sectionHeaderStyle}>
                <div>
                  <h3 style={h3Style}>专业探索多 Agent 流水线</h3>
                  <p style={probeStyle}>从专业广度、12 维画像、方向匹配到蜗牛路径，全部以结构化证据串联。</p>
                </div>
                <span style={pipelineBadgeStyle}>{plan.agent_steps.length} Agents</span>
              </div>
              <div style={agentStepGridStyle}>
                {plan.agent_steps.map((step, index) => (
                  <div key={step.id} style={agentStepStyle}>
                    <div style={agentStepTopStyle}>
                      <span style={agentIndexStyle}>{index + 1}</span>
                      <strong>{step.agent_name}</strong>
                      <span style={agentStatusStyle}>{step.status}</span>
                    </div>
                    <div style={agentTitleStyle}>{step.title}</div>
                    <p style={mutedTextStyle}>{step.summary}</p>
                    <div style={agentEvidenceStyle}>
                      {step.evidence_refs.slice(0, 3).map((item) => (
                        <span key={item} style={smallChipStyle}>{item}</span>
                      ))}
                    </div>
                    <small style={probeStyle}>输出 {step.output_count} 项</small>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeMatchReport && (
            <section style={panelStyle}>
              <div style={sectionHeaderStyle}>
                <div>
                  <h3 style={h3Style}>职业匹配分析</h3>
                  <p style={probeStyle}>复用参考仓的“12 维画像 × 岗位要求”报告形态，但入口改成专业探索。</p>
                </div>
                {activeMatchDirection && (
                  <button
                    onClick={() => handleCreateWorkspace(activeMatchDirection)}
                    disabled={workspaceLoading}
                    style={smallButtonStyle}
                  >
                    {workspaceLoading ? '创建中...' : '收藏并生成路径'}
                  </button>
                )}
              </div>
              <div style={matchLayoutStyle}>
                <aside style={matchNavStyle}>
                  {plan.match_reports.map((report) => (
                    <button
                      key={report.report_id}
                      onClick={() => setActiveMatchDirectionId(report.direction_id)}
                      style={matchNavButtonStyle(report.direction_id === activeMatchReport.direction_id)}
                    >
                      <strong>{report.target_title}</strong>
                      <span>{report.exploration_domain}</span>
                      <em>{report.overall_match}</em>
                    </button>
                  ))}
                </aside>
                <div style={matchContentStyle}>
                  <div style={matchHeroStyle}>
                    <div style={matchScoreStyle}>
                      <span>{activeMatchReport.overall_match}</span>
                      <small>综合匹配</small>
                    </div>
                    <div>
                      <h4 style={h4Style}>{activeMatchReport.target_title}</h4>
                      <p style={mutedTextStyle}>{activeMatchReport.narrative.overall_review}</p>
                      <div style={chipRowStyle}>
                        {activeMatchReport.strength_dimensions.slice(0, 4).map((item) => (
                          <span key={item} style={strengthChipStyle}>{item}</span>
                        ))}
                        {activeMatchReport.priority_gap_dimensions.slice(0, 4).map((item) => (
                          <span key={item} style={gapChipStyle}>{item}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={comparisonGridStyle}>
                    {activeMatchReport.comparison_dimensions.map((item) => (
                      <div key={item.key} style={comparisonItemStyle}>
                        <div style={scoreHeaderStyle}>
                          <strong>{item.title}</strong>
                          <span style={gapValueStyle(item.gap)}>{item.status_label}</span>
                        </div>
                        <div style={dualBarStyle}>
                          <span style={dualBarLabelStyle}>市场</span>
                          <div style={barTrackStyle}>
                            <div style={{ ...marketBarFillStyle, width: `${item.market_importance}%` }} />
                          </div>
                          <strong>{item.market_importance}</strong>
                        </div>
                        <div style={dualBarStyle}>
                          <span style={dualBarLabelStyle}>个人</span>
                          <div style={barTrackStyle}>
                            <div style={{ ...barFillStyle, width: `${item.user_readiness}%` }} />
                          </div>
                          <strong>{item.user_readiness}</strong>
                        </div>
                        <p style={probeStyle}>
                          缺口 {item.gap > 0 ? item.gap : 0} · 缺失关键词：
                          {item.missing_keywords.slice(0, 3).join('、') || '暂无'}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div style={adviceGridStyle}>
                    {activeMatchReport.action_advices.map((advice) => (
                      <div key={advice.key} style={adviceItemStyle}>
                        <strong>{advice.title}</strong>
                        <p style={mutedTextStyle}>{advice.why_it_matters}</p>
                        <p style={probeStyle}>{advice.current_issue}</p>
                        <ul style={listStyle}>
                          {advice.next_actions.slice(0, 2).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div style={evidenceGridStyle}>
                    {activeMatchReport.evidence_cards.map((card) => (
                      <div key={card.id} style={evidenceCardStyle}>
                        <div style={scoreHeaderStyle}>
                          <strong>{card.title}</strong>
                          <span style={fitStyle}>{card.match_score}</span>
                        </div>
                        <p style={mutedTextStyle}>{card.scenario}</p>
                        <p style={probeStyle}>证据任务：{card.proof_task}</p>
                        <div style={chipRowStyle}>
                          {card.requirement_keywords.slice(0, 4).map((item) => (
                            <span key={item} style={smallChipStyle}>{item}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

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
                    <div style={roleProfileStyle}>
                      <span style={tagStyle}>{direction.exploration_domain || '探索方向'}</span>
                      <small>{direction.requirement_profile.core_skills.slice(0, 4).join('、')}</small>
                    </div>
                    {direction.requirement_profile.evidence_suggestions.length > 0 && (
                      <p style={probeStyle}>
                        证据建议：{direction.requirement_profile.evidence_suggestions[0]}
                      </p>
                    )}
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
              {workspace.match_report && (
                <div style={workspaceMatchStripStyle}>
                  <div style={matchScoreMiniStyle}>
                    <strong>{workspace.match_report.overall_match}</strong>
                    <span>匹配度</span>
                  </div>
                  <div>
                    <strong>{workspace.match_report.target_title}</strong>
                    <p style={probeStyle}>
                      优势：{workspace.match_report.strength_dimensions.slice(0, 3).join('、') || '待补证据'} ·
                      差距：{workspace.match_report.priority_gap_dimensions.slice(0, 3).join('、') || '待观察'}
                    </p>
                  </div>
                </div>
              )}
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
                          <div style={resourceTitleStyle}>
                            <span style={sourceBadgeStyle}>{resource.logo_hint}</span>
                            <strong>{resource.title}</strong>
                          </div>
                          <div style={resourceMetaStyle}>
                            <span style={qualityStyle}>{resource.quality_score}</span>
                            <span style={resourceStatusStyle(resource.status)}>
                              {resource.status === 'completed'
                                ? '已完成'
                                : resource.status === 'opened'
                                  ? '已打开'
                                  : '待学习'}
                            </span>
                          </div>
                        </div>
                        <p style={probeStyle}>
                          {resource.source_name} / {resource.resource_type}
                        </p>
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

const roleProfileStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 8,
  color: '#4b5563',
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

const resourceTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minWidth: 0,
};

const sourceBadgeStyle: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  minWidth: 26,
  height: 22,
  padding: '0 5px',
  borderRadius: 4,
  background: '#1f2328',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
};

const resourceMetaStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const qualityStyle: CSSProperties = {
  minWidth: 30,
  textAlign: 'center',
  padding: '2px 6px',
  borderRadius: 999,
  background: '#e6f4f1',
  color: '#256f6c',
  fontSize: 12,
  fontWeight: 700,
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

const sectionHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'start',
  gap: 12,
  marginBottom: 12,
};

const agentPipelineStyle: CSSProperties = {
  ...panelStyle,
  borderColor: '#c9ddd9',
  background: '#f8fbfa',
};

const pipelineBadgeStyle: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 999,
  background: '#256f6c',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: 'nowrap',
};

const agentStepGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
  gap: 10,
};

const agentStepStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 10,
  border: '1px solid #dbe3e1',
  borderRadius: 6,
  background: '#fff',
};

const agentStepTopStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr auto',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
};

const agentIndexStyle: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 22,
  height: 22,
  borderRadius: 999,
  background: '#e6f4f1',
  color: '#256f6c',
  fontWeight: 800,
};

const agentStatusStyle: CSSProperties = {
  padding: '2px 6px',
  borderRadius: 999,
  background: '#e7f7ed',
  color: '#18794e',
  fontWeight: 700,
};

const agentTitleStyle: CSSProperties = {
  color: '#1f2328',
  fontSize: 13,
  fontWeight: 700,
};

const agentEvidenceStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
};

const smallChipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  maxWidth: '100%',
  padding: '2px 6px',
  borderRadius: 999,
  background: '#edf2f7',
  color: '#415466',
  fontSize: 11,
  lineHeight: 1.4,
};

const matchLayoutStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '220px minmax(0, 1fr)',
  gap: 14,
};

const matchNavStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const matchNavButtonStyle = (active: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '3px 8px',
  padding: 10,
  border: active ? '1px solid #256f6c' : '1px solid #e5e7eb',
  borderRadius: 6,
  background: active ? '#e6f4f1' : '#fff',
  color: '#1f2328',
  textAlign: 'left',
  cursor: 'pointer',
});

const matchContentStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
};

const matchHeroStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '96px minmax(0, 1fr)',
  gap: 12,
  alignItems: 'center',
  padding: 12,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fcfcfd',
};

const matchScoreStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  height: 82,
  borderRadius: 6,
  background: '#1f2328',
  color: '#fff',
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 8,
};

const strengthChipStyle: CSSProperties = {
  ...smallChipStyle,
  background: '#e7f7ed',
  color: '#18794e',
};

const gapChipStyle: CSSProperties = {
  ...smallChipStyle,
  background: '#fff7e6',
  color: '#9a6700',
};

const comparisonGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
};

const comparisonItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  padding: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fff',
};

const dualBarStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '36px 1fr 34px',
  gap: 8,
  alignItems: 'center',
  fontSize: 12,
};

const dualBarLabelStyle: CSSProperties = {
  color: '#6b7280',
};

const marketBarFillStyle: CSSProperties = {
  ...barFillStyle,
  background: '#4f46e5',
};

const gapValueStyle = (gap: number): CSSProperties => ({
  padding: '2px 6px',
  borderRadius: 999,
  background: gap > 12 ? '#fff7e6' : '#e7f7ed',
  color: gap > 12 ? '#9a6700' : '#18794e',
  fontSize: 12,
  fontWeight: 700,
});

const adviceGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: 10,
};

const adviceItemStyle: CSSProperties = {
  padding: 10,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  background: '#fbfcfd',
};

const evidenceGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
  gap: 10,
};

const evidenceCardStyle: CSSProperties = {
  padding: 10,
  border: '1px solid #dbe3e1',
  borderRadius: 6,
  background: '#f8fbfa',
};

const workspaceMatchStripStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '76px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'center',
  padding: 10,
  margin: '8px 0 12px',
  border: '1px solid #dbe3e1',
  borderRadius: 6,
  background: '#f8fbfa',
};

const matchScoreMiniStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  height: 56,
  borderRadius: 6,
  background: '#e6f4f1',
  color: '#256f6c',
};
