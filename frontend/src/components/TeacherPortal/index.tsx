import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { RationalePanel } from '../RationalePanel';
import { VercelMeshNav as MeshNav } from '../VercelMeshRecipe';
import type { GenerateResults, Rationale } from '../../types/resources';
import '../../vercel-mesh.css';

type TabKey = 'overview' | 'generator' | 'review' | 'intervention';
type RunState = 'idle' | 'submitting' | 'running' | 'done' | 'error';

type Student = {
  id: string;
  focus: string;
  mastery: number;
  risk: 'high' | 'medium' | 'low';
  evidence: string;
  action: string;
  knowledgeId: string;
  knowledgeName: string;
};

type ReviewItem = {
  id: string;
  title: string;
  type: string;
  student: string;
  status: string;
  agent: string;
  reason: string;
  rationale: Rationale;
};

const TABS: { key: TabKey; title: string; caption: string }[] = [
  { key: 'overview', title: '总览', caption: '班级状态与风险雷达' },
  { key: 'generator', title: '资源生成', caption: '老师发起个性化资源包' },
  { key: 'review', title: '资源审核', caption: '生成结果与引用依据' },
  { key: 'intervention', title: '干预建议', caption: '下一步教学动作' },
];

const CLASSES = [
  { name: '软件工程 2301', students: 42, risk: 6, progress: 78, status: '正常推进' },
  { name: '数据结构强化班', students: 36, risk: 11, progress: 64, status: '需要干预' },
  { name: 'AI 应用项目组', students: 18, risk: 3, progress: 83, status: '正常推进' },
];

const STUDENTS: Student[] = [
  { id: 'stu_001', focus: '链表 / 指针修改顺序', mastery: 72, risk: 'medium', evidence: '链表插入最近 3 题错 1 题，资源停留时间偏短', action: '补一组可视化步骤题', knowledgeId: 'linked-list-basics', knowledgeName: '链表' },
  { id: 'stu_018', focus: '二叉树遍历 / 递归栈', mastery: 51, risk: 'high', evidence: '递归调用顺序连续 2 次错误，EvaluationAgent 标记为高风险', action: '生成低难度动画 + 安排代码走查', knowledgeId: 'binary-tree-traversal', knowledgeName: '二叉树遍历' },
  { id: 'stu_026', focus: '动态规划入门 / 状态转移', mastery: 67, risk: 'medium', evidence: '能写出递推式，但初始化边界漏写频繁', action: '降低题目梯度，先推 2 道填空题', knowledgeId: 'dynamic-programming', knowledgeName: '动态规划' },
  { id: 'stu_033', focus: '图算法 BFS / 队列过程', mastery: 86, risk: 'low', evidence: '掌握度稳定，适合进入挑战任务', action: '推荐挑战任务', knowledgeId: 'graph-algorithms', knowledgeName: '图算法 BFS' },
];

const AGENTS = [
  ['ProfileAgent', '画像同步', '抽取学生基础、偏好、短板与最近证据'],
  ['PlannerAgent', '任务编排', '拆成讲解、题目、代码、可视化任务'],
  ['DocumentAgent', '讲义生成', '输出可追溯 Markdown 讲解材料'],
  ['ExerciseAgent', '自适应题目', '按掌握度和短板调整难度'],
  ['CodeAgent', '代码案例', '生成 Python / Java 双语示例'],
  ['VisualAgent', '动画导图', '输出思维导图和步骤动画数据'],
  ['EvaluationAgent', '闭环评估', '把练习结果回写学习画像'],
];

const DEMO_RATIONALE: Rationale = {
  matched_profile: ['学习风格：偏好图解 + 分步骤讲解', '资源偏好：需要动画和代码案例同时出现'],
  addressed_weakness: ['历史易错点：指针修改顺序', '最近答题证据：链表插入题漏掉 prev.next 连接'],
  difficulty_adjusted_from: 3,
  difficulty_used: 2,
  agent_name: 'DocumentAgent',
  prompt_version: 'document_agent_v1',
  model_name: 'Spark X2',
  cited_sources: [{ title: '数据结构课程讲义：线性表与链表', page: '127-130', similarity: 0.89 }],
};

export function TeacherPortal() {
  const [active, setActive] = useState<TabKey>('overview');
  const [studentId, setStudentId] = useState('stu_018');
  const [knowledgeId, setKnowledgeId] = useState('binary-tree-traversal');
  const [knowledgeName, setKnowledgeName] = useState('二叉树遍历');
  const [goal, setGoal] = useState('为高风险学生生成一套低难度、可视化优先、可审核溯源的补救资源包');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>('idle');
  const [results, setResults] = useState<GenerateResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState<Rationale | null>(null);
  const pollRef = useRef<number | null>(null);

  const activeStudent = STUDENTS.find((item) => item.id === studentId) ?? STUDENTS[1];

  const metrics = useMemo(() => [
    { value: '96', label: '活跃学生' },
    { value: '20', label: '待干预短板' },
    { value: results ? '1' : '312', label: results ? '本轮资源包' : '历史生成资源' },
    { value: '91%', label: '资源可追溯率' },
  ], [results]);

  const reviews = useMemo<ReviewItem[]>(() => {
    if (!results) {
      return [
        { id: 'demo-doc', title: '链表插入操作详解', type: '讲解文档', student: 'stu_001', status: '待审核', agent: 'DocumentAgent', reason: '针对“指针修改顺序”短板，自动降低难度并绑定步骤动画。', rationale: DEMO_RATIONALE },
        { id: 'demo-ex', title: '二叉树递归栈低阶练习', type: '练习题', student: 'stu_018', status: '建议通过', agent: 'ExerciseAgent', reason: '把递归进入与回溯拆开训练，降低一次性认知负担。', rationale: { ...DEMO_RATIONALE, agent_name: 'ExerciseAgent', prompt_version: 'exercise_agent_v1', addressed_weakness: ['递归调用顺序混乱', '无法区分先序与中序的访问时机'] } },
      ];
    }
    const list: ReviewItem[] = [];
    if (results.document) list.push({ id: 'doc', title: results.document.document.title, type: '讲解文档', student: studentId, status: '待审核', agent: results.document.rationale.agent_name, reason: results.document.rationale.addressed_weakness[0] ?? '根据当前画像自动生成讲解材料。', rationale: results.document.rationale });
    if (results.exercise) list.push({ id: 'exercise', title: `${knowledgeName} · ${results.exercise.questions.length} 道自适应题`, type: '练习题', student: studentId, status: '待审核', agent: results.exercise.rationale.agent_name, reason: results.exercise.rationale.addressed_weakness[0] ?? '根据短板生成题目组合。', rationale: results.exercise.rationale });
    if (results.visual) list.push({ id: 'visual', title: `${knowledgeName} · 思维导图与动画`, type: '可视化资源', student: studentId, status: '待审核', agent: results.visual.rationale.agent_name, reason: results.visual.rationale.matched_profile[0] ?? '根据图解偏好生成可视化资源。', rationale: results.visual.rationale });
    if (results.code) list.push({ id: 'code', title: `${knowledgeName} · 双语代码案例`, type: '代码案例', student: studentId, status: '待审核', agent: results.code.rationale.agent_name, reason: results.code.rationale.matched_profile[0] ?? '根据编程语言偏好生成代码案例。', rationale: results.code.rationale });
    return list;
  }, [knowledgeName, results, studentId]);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (id: string) => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/tasks/${id}/results`);
        if (response.status === 404) return;
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        setResults((await response.json()) as GenerateResults);
        setRunState('done');
        stopPolling();
        setActive('review');
      } catch (err) {
        setRunState('error');
        setError(err instanceof Error ? err.message : String(err));
        stopPolling();
      }
    }, 1500);
  };

  const generate = async () => {
    setError(null);
    setResults(null);
    setRunState('submitting');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          knowledge_id: knowledgeId,
          knowledge_name: knowledgeName,
          conversation: [{ role: 'user', content: goal }],
          selection_context: { source: 'teacher_console', reason: goal, suggested_difficulty: activeStudent.risk === 'high' ? 2 : 3 },
          exercise_count: activeStudent.risk === 'high' ? 6 : 5,
          languages: ['python', 'java'],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = (await response.json()) as { task_id: string };
      setTaskId(data.task_id);
      setRunState('running');
      startPolling(data.task_id);
    } catch (err) {
      setRunState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const chooseStudent = (student: Student) => {
    setStudentId(student.id);
    setKnowledgeId(student.knowledgeId);
    setKnowledgeName(student.knowledgeName);
    setGoal(`针对 ${student.id} 的「${student.focus}」薄弱点，生成一套可解释、低负担、可审核的个性化学习资源。`);
    setActive('generator');
  };

  return (
    <div className="mesh-page">
      <div className="mesh-shell">
        <MeshNav active="teacher" />
        <main className="mesh-main" style={mainStyle}>
          <section className="mesh-dashboard-hero" style={heroStyle}>
            <div>
              <div className="mesh-kicker"><span className="mesh-pulse" /> Teacher Resource Studio / vercel-mesh</div>
              <h1 style={titleStyle}>给老师用的个性化资源生成台。</h1>
              <p className="mesh-subtitle">从学生画像、短板证据和 Agent 生产线出发，老师可以生成、审核并下发个性化学习资源包。</p>
              <div className="mesh-actions">
                <button className="mesh-primary-button" onClick={() => setActive('generator')}>发起资源生成</button>
                <button className="mesh-ghost-button" onClick={() => setActive('review')}>查看审核队列</button>
              </div>
            </div>
            <div className="mesh-terminal" style={terminalStyle}>
              <div className="mesh-terminal-bar"><div className="mesh-dots"><span /><span /><span /></div><span>teacher-console.log</span></div>
              <div className="mesh-terminal-body">
                <Log scope="profile" text={`loaded ${activeStudent.id}: ${activeStudent.focus}`} />
                <Log scope="risk" text={`${activeStudent.risk.toUpperCase()} · mastery ${activeStudent.mastery}%`} />
                <Log scope="agent" text="7-agent DAG ready" />
                <Log scope="trace" text={taskId ? `active task ${taskId}` : 'waiting for teacher command'} />
              </div>
            </div>
          </section>

          <aside className="mesh-sidebar" style={tabStyle}>
            {TABS.map((tab) => (
              <button key={tab.key} className={active === tab.key ? 'mesh-side-item is-active' : 'mesh-side-item'} onClick={() => setActive(tab.key)}>
                <strong>{tab.title}</strong><span>{tab.caption}</span>
              </button>
            ))}
          </aside>

          {active === 'overview' && <Overview metrics={metrics} onChooseStudent={chooseStudent} />}
          {active === 'generator' && <Generator studentId={studentId} knowledgeId={knowledgeId} knowledgeName={knowledgeName} goal={goal} runState={runState} taskId={taskId} error={error} onStudentId={setStudentId} onKnowledgeId={setKnowledgeId} onKnowledgeName={setKnowledgeName} onGoal={setGoal} onGenerate={generate} />}
          {active === 'review' && <Review reviews={reviews} onOpen={setRationale} />}
          {active === 'intervention' && <Intervention activeStudent={activeStudent} onChooseStudent={chooseStudent} />}
        </main>
        <footer className="mesh-footer">Teacher Resource Studio · Vercel Mesh visual language · Personalized learning loop</footer>
        {rationale && <RationalePanel rationale={rationale} title="老师审核视角：这份资源为什么被生成？" onClose={() => setRationale(null)} />}
      </div>
    </div>
  );
}

function Overview({ metrics, onChooseStudent }: { metrics: { value: string; label: string }[]; onChooseStudent: (student: Student) => void }) {
  return <section style={sectionStyle}><MetricGrid metrics={metrics} /><div className="mesh-grid-2" style={gapStyle}><section className="mesh-panel"><PanelHead title="班级运行状态" eyebrow="/classes" /><table className="mesh-table"><thead><tr><th>班级</th><th>学生</th><th>风险</th><th>进度</th><th>状态</th></tr></thead><tbody>{CLASSES.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.students}</td><td>{item.risk}</td><td><Progress value={item.progress} /></td><td><span className={item.risk > 8 ? 'mesh-status warn' : 'mesh-status'}>{item.status}</span></td></tr>)}</tbody></table></section><section className="mesh-panel"><PanelHead title="风险学生队列" eyebrow="/risk-queue" /><div style={stackStyle}>{STUDENTS.map((student) => <button key={student.id} style={riskRowStyle} onClick={() => onChooseStudent(student)}><div><strong>{student.id}</strong><span>{student.focus}</span></div><Progress value={student.mastery} /><em>{student.risk}</em></button>)}</div></section></div></section>;
}

function Generator(props: { studentId: string; knowledgeId: string; knowledgeName: string; goal: string; runState: RunState; taskId: string | null; error: string | null; onStudentId: (v: string) => void; onKnowledgeId: (v: string) => void; onKnowledgeName: (v: string) => void; onGoal: (v: string) => void; onGenerate: () => void }) {
  const running = props.runState === 'submitting' || props.runState === 'running';
  return <section className="mesh-grid-2" style={sectionGridStyle}><section className="mesh-panel"><PanelHead title="个性化资源生成" eyebrow="/api/generate" /><div style={formGridStyle}><Field label="学生 ID" value={props.studentId} onChange={props.onStudentId} /><Field label="知识点 ID" value={props.knowledgeId} onChange={props.onKnowledgeId} /><Field label="知识点名称" value={props.knowledgeName} onChange={props.onKnowledgeName} /></div><label style={labelStyle}>教师生成目标</label><textarea value={props.goal} onChange={(e) => props.onGoal(e.target.value)} style={textareaStyle} /><div className="mesh-actions"><button className="mesh-primary-button" disabled={running} onClick={() => void props.onGenerate()}>{props.runState === 'submitting' ? '正在提交…' : props.runState === 'running' ? 'Agent 生成中…' : '生成资源包'}</button><span className="mesh-mono">{props.taskId ? `task: ${props.taskId}` : 'ready'}</span></div>{props.error && <div style={errorStyle}>{props.error}</div>}</section><section className="mesh-panel"><PanelHead title="Agent 生产线" eyebrow="/runtime" /><div style={agentGridStyle}>{AGENTS.map(([name, status, detail], index) => <article className="mesh-card" key={name}><small>{String(index + 1).padStart(2, '0')} · {name}</small><h3>{status}</h3><p>{detail}</p></article>)}</div></section></section>;
}

function Review({ reviews, onOpen }: { reviews: ReviewItem[]; onOpen: (rationale: Rationale) => void }) {
  return <section style={sectionStyle}><div className="mesh-section-head"><h2>资源审核不是看结果，是看生成证据。</h2><span className="mesh-mono">/review</span></div><div className="mesh-grid-2" style={gapStyle}>{reviews.map((item) => <article className="mesh-panel" key={item.id}><small>{item.type} · {item.agent}</small><h3>{item.title}</h3><p>{item.reason}</p><div style={metaStyle}><span>{item.student}</span><span>{item.status}</span></div><div className="mesh-actions"><button className="mesh-ghost-button" onClick={() => onOpen(item.rationale)}>查看溯源</button><button className="mesh-primary-button">通过</button></div></article>)}</div></section>;
}

function Intervention({ activeStudent, onChooseStudent }: { activeStudent: Student; onChooseStudent: (student: Student) => void }) {
  return <section className="mesh-grid-2" style={sectionGridStyle}><section className="mesh-panel"><PanelHead title="可执行干预建议" eyebrow="/interventions" /><table className="mesh-table"><thead><tr><th>学生</th><th>证据</th><th>建议动作</th><th>操作</th></tr></thead><tbody>{STUDENTS.map((student) => <tr key={student.id}><td><strong>{student.id}</strong></td><td>{student.evidence}</td><td>{student.action}</td><td><button className="mesh-ghost-button" onClick={() => onChooseStudent(student)}>生成</button></td></tr>)}</tbody></table></section><section className="mesh-panel"><PanelHead title="闭环结果" eyebrow="/loop" /><LoopCard label="risk signal" title={`${activeStudent.id} · ${activeStudent.focus}`} body={activeStudent.evidence} /><LoopCard label="teacher action" title={activeStudent.action} body="老师确认后触发资源生成，审核通过后回流学生端。" /><LoopCard label="profile update" title="EvaluationAgent 更新画像" body="答题表现、资源反馈与老师干预记录进入下一轮推荐依据。" /></section></section>;
}

function Log({ scope, text }: { scope: string; text: string }) { return <div className="mesh-log-line"><strong>{scope}</strong><span><span className="mesh-log-ok">✓</span> {text}</span></div>; }
function PanelHead({ title, eyebrow }: { title: string; eyebrow: string }) { return <div className="mesh-section-head" style={panelHeadStyle}><h2 style={panelTitleStyle}>{title}</h2><span className="mesh-mono">{eyebrow}</span></div>; }
function MetricGrid({ metrics }: { metrics: { value: string; label: string }[] }) { return <div className="mesh-metric-grid" style={metricsStyle}>{metrics.map((item) => <div className="mesh-metric" key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label style={fieldStyle}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} /></label>; }
function LoopCard({ label, title, body }: { label: string; title: string; body: string }) { return <div style={loopCardStyle}><span className="mesh-mono">{label}</span><strong>{title}</strong><p>{body}</p></div>; }
function Progress({ value }: { value: number }) { return <div className="mesh-progress"><span style={{ '--value': `${value}%` } as CSSProperties} /></div>; }

const mainStyle: CSSProperties = { display: 'grid', gap: 18, padding: '24px 0 40px' };
const heroStyle: CSSProperties = { gridTemplateColumns: 'minmax(0, 1fr) minmax(340px, 0.64fr)' };
const titleStyle: CSSProperties = { margin: 0, fontSize: 'clamp(38px, 5vw, 76px)', lineHeight: 0.96, letterSpacing: '-0.07em', fontWeight: 620 };
const terminalStyle: CSSProperties = { alignSelf: 'stretch' };
const tabStyle: CSSProperties = { position: 'static', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' };
const sectionStyle: CSSProperties = { display: 'grid', gap: 18 };
const sectionGridStyle: CSSProperties = { ...sectionStyle, gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' };
const gapStyle: CSSProperties = { gap: 18 };
const stackStyle: CSSProperties = { display: 'grid', gap: 10 };
const riskRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 150px 68px', alignItems: 'center', gap: 14, width: '100%', padding: '12px', border: '1px solid var(--mesh-hairline)', borderRadius: 12, color: 'var(--mesh-text)', background: 'rgba(255,255,255,0.035)', textAlign: 'left', cursor: 'pointer' };
const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 14 };
const fieldStyle: CSSProperties = { display: 'grid', gap: 6, color: 'var(--mesh-muted)', fontSize: 12 };
const inputStyle: CSSProperties = { padding: '11px 12px', borderRadius: 12, border: '1px solid var(--mesh-hairline-strong)', background: 'rgba(0,0,0,0.4)', color: 'var(--mesh-text)', outline: 'none' };
const labelStyle: CSSProperties = { display: 'block', color: 'var(--mesh-muted)', fontSize: 12, marginBottom: 6 };
const textareaStyle: CSSProperties = { width: '100%', minHeight: 120, padding: 14, borderRadius: 16, border: '1px solid var(--mesh-hairline-strong)', background: 'rgba(0,0,0,0.4)', color: 'var(--mesh-text)', outline: 'none', resize: 'vertical' };
const agentGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 };
const metaStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 16, color: 'var(--mesh-muted)', fontSize: 12 };
const errorStyle: CSSProperties = { marginTop: 12, padding: 12, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 12, color: '#ffd2d2', background: 'rgba(255,0,80,0.1)' };
const loopCardStyle: CSSProperties = { display: 'grid', gap: 6, marginBottom: 12, padding: 14, border: '1px solid var(--mesh-hairline)', borderRadius: 12, background: 'rgba(255,255,255,0.035)' };
const panelHeadStyle: CSSProperties = { marginBottom: 18 };
const panelTitleStyle: CSSProperties = { fontSize: 24 };
const metricsStyle: CSSProperties = { marginBottom: 0 };