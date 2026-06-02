import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { RationalePanel } from '../RationalePanel';
import { VercelMeshNav as MeshNav } from '../VercelMeshRecipe';
import type { GenerateResults, Rationale } from '../../types/resources';
import '../../vercel-mesh.css';
import './teacher-mesh.css';

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
  { key: 'overview', title: 'Overview', caption: '班级风险与运行状态' },
  { key: 'generator', title: 'Generate', caption: '老师发起资源生产' },
  { key: 'review', title: 'Review', caption: '溯源、证据与审核' },
  { key: 'intervene', title: 'Intervene', caption: '闭环干预动作' } as never,
];

const TAB_ITEMS: { key: TabKey; title: string; caption: string }[] = [
  { key: 'overview', title: 'Overview', caption: '班级风险与运行状态' },
  { key: 'generator', title: 'Generate', caption: '老师发起资源生产' },
  { key: 'review', title: 'Review', caption: '溯源、证据与审核' },
  { key: 'intervention', title: 'Intervene', caption: '闭环干预动作' },
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
    { value: '96', label: 'active students' },
    { value: '20', label: 'weakness signals' },
    { value: results ? '1' : '312', label: results ? 'current bundle' : 'generated resources' },
    { value: '91%', label: 'traceable outputs' },
  ], [results]);

  const reviews = useMemo<ReviewItem[]>(() => {
    if (!results) {
      return [
        { id: 'demo-doc', title: '链表插入操作详解', type: 'Document', student: 'stu_001', status: 'pending', agent: 'DocumentAgent', reason: '针对“指针修改顺序”短板，自动降低难度并绑定步骤动画。', rationale: DEMO_RATIONALE },
        { id: 'demo-ex', title: '二叉树递归栈低阶练习', type: 'Exercise', student: 'stu_018', status: 'ready', agent: 'ExerciseAgent', reason: '把递归进入与回溯拆开训练，降低一次性认知负担。', rationale: { ...DEMO_RATIONALE, agent_name: 'ExerciseAgent', prompt_version: 'exercise_agent_v1', addressed_weakness: ['递归调用顺序混乱', '无法区分先序与中序的访问时机'] } },
      ];
    }
    const list: ReviewItem[] = [];
    if (results.document) list.push({ id: 'doc', title: results.document.document.title, type: 'Document', student: studentId, status: 'pending', agent: results.document.rationale.agent_name, reason: results.document.rationale.addressed_weakness[0] ?? '根据当前画像自动生成讲解材料。', rationale: results.document.rationale });
    if (results.exercise) list.push({ id: 'exercise', title: `${knowledgeName} · ${results.exercise.questions.length} 道自适应题`, type: 'Exercise', student: studentId, status: 'pending', agent: results.exercise.rationale.agent_name, reason: results.exercise.rationale.addressed_weakness[0] ?? '根据短板生成题目组合。', rationale: results.exercise.rationale });
    if (results.visual) list.push({ id: 'visual', title: `${knowledgeName} · 思维导图与动画`, type: 'Visual', student: studentId, status: 'pending', agent: results.visual.rationale.agent_name, reason: results.visual.rationale.matched_profile[0] ?? '根据图解偏好生成可视化资源。', rationale: results.visual.rationale });
    if (results.code) list.push({ id: 'code', title: `${knowledgeName} · 双语代码案例`, type: 'Code', student: studentId, status: 'pending', agent: results.code.rationale.agent_name, reason: results.code.rationale.matched_profile[0] ?? '根据编程语言偏好生成代码案例。', rationale: results.code.rationale });
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
          selection_context: { source: 'manual', reason: `TeacherConsole: ${goal}`, suggested_difficulty: activeStudent.risk === 'high' ? 2 : 3 },
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
      <div className="mesh-shell teacher-studio-shell">
        <MeshNav active="teacher" />
        <main className="mesh-main teacher-studio-main">
          <section className="teacher-studio-hero">
            <div className="teacher-studio-copy">
              <div className="mesh-kicker"><span className="mesh-pulse" /> Teacher Resource Studio / Vercel Mesh</div>
              <h1 className="teacher-studio-title">Generate personalized learning resources <span>with evidence.</span></h1>
              <p className="mesh-subtitle">老师从画像、短板证据和 Agent 生产线出发，生成、审核并下发可解释的个性化学习资源包。</p>
              <div className="mesh-actions">
                <button className="mesh-primary-button" onClick={() => setActive('generator')}>Generate bundle</button>
                <button className="mesh-ghost-button" onClick={() => setActive('review')}>Review queue</button>
              </div>
            </div>
            <div className="mesh-terminal teacher-studio-terminal">
              <div className="mesh-terminal-bar"><div className="mesh-dots"><span /><span /><span /></div><span>teacher-console.log</span></div>
              <div className="mesh-terminal-body">
                <Log scope="profile" text={`loaded ${activeStudent.id}: ${activeStudent.focus}`} />
                <Log scope="risk" text={`${activeStudent.risk.toUpperCase()} · mastery ${activeStudent.mastery}%`} />
                <Log scope="agent" text="7-agent DAG ready" />
                <Log scope="trace" text={taskId ? `active task ${taskId}` : 'waiting for teacher command'} />
              </div>
            </div>
          </section>

          <nav className="teacher-studio-tabs" aria-label="Teacher studio modules">
            {TAB_ITEMS.map((tab) => (
              <button key={tab.key} className={active === tab.key ? 'teacher-studio-tab is-active' : 'teacher-studio-tab'} onClick={() => setActive(tab.key)}>
                <strong>{tab.title}</strong><span>{tab.caption}</span>
              </button>
            ))}
          </nav>

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
  return (
    <section className="teacher-studio-section">
      <MetricGrid metrics={metrics} />
      <div className="teacher-studio-grid-2">
        <section className="mesh-panel">
          <PanelHead title="Class runtime" eyebrow="/classes" />
          <table className="mesh-table">
            <thead><tr><th>班级</th><th>学生</th><th>风险</th><th>进度</th><th>状态</th></tr></thead>
            <tbody>{CLASSES.map((item) => <tr key={item.name}><td><strong>{item.name}</strong></td><td>{item.students}</td><td>{item.risk}</td><td><Progress value={item.progress} /></td><td><span className={item.risk > 8 ? 'mesh-status warn' : 'mesh-status'}>{item.status}</span></td></tr>)}</tbody>
          </table>
        </section>
        <section className="mesh-panel">
          <PanelHead title="Risk queue" eyebrow="/risk-queue" />
          <div className="teacher-studio-risk-list">{STUDENTS.map((student) => <button key={student.id} className="teacher-studio-risk-row" onClick={() => onChooseStudent(student)}><div><strong>{student.id}</strong><span>{student.focus}</span></div><Progress value={student.mastery} /><em>{student.risk}</em></button>)}</div>
        </section>
      </div>
    </section>
  );
}

function Generator(props: { studentId: string; knowledgeId: string; knowledgeName: string; goal: string; runState: RunState; taskId: string | null; error: string | null; onStudentId: (v: string) => void; onKnowledgeId: (v: string) => void; onKnowledgeName: (v: string) => void; onGoal: (v: string) => void; onGenerate: () => void }) {
  const running = props.runState === 'submitting' || props.runState === 'running';
  return (
    <section className="teacher-studio-section teacher-studio-grid-2 teacher-studio-grid-heavy">
      <section className="mesh-panel">
        <PanelHead title="Generate bundle" eyebrow="/api/generate" />
        <div className="teacher-studio-form-grid"><Field label="student_id" value={props.studentId} onChange={props.onStudentId} /><Field label="knowledge_id" value={props.knowledgeId} onChange={props.onKnowledgeId} /><Field label="knowledge_name" value={props.knowledgeName} onChange={props.onKnowledgeName} /></div>
        <label className="teacher-studio-label">teacher_goal</label>
        <textarea className="teacher-studio-textarea" value={props.goal} onChange={(e) => props.onGoal(e.target.value)} />
        <div className="teacher-studio-button-row"><button className="mesh-primary-button" disabled={running} onClick={() => void props.onGenerate()}>{props.runState === 'submitting' ? 'Submitting…' : props.runState === 'running' ? 'Agents running…' : 'Generate resources'}</button><span className="mesh-mono">{props.taskId ? `task: ${props.taskId}` : 'ready'}</span></div>
        {props.error && <div className="teacher-studio-error">{props.error}</div>}
      </section>
      <section className="mesh-panel">
        <PanelHead title="Agent pipeline" eyebrow="/runtime" />
        <div className="teacher-studio-agent-grid">{AGENTS.map(([name, status, detail], index) => <article className="mesh-card" key={name}><small>{String(index + 1).padStart(2, '0')} · {name}</small><h3>{status}</h3><p>{detail}</p></article>)}</div>
      </section>
    </section>
  );
}

function Review({ reviews, onOpen }: { reviews: ReviewItem[]; onOpen: (rationale: Rationale) => void }) {
  return (
    <section className="teacher-studio-section">
      <div className="teacher-studio-section-head"><h2>Review generated resources by evidence, not vibes.</h2><span className="mesh-mono">/review</span></div>
      <div className="teacher-studio-grid-2">{reviews.map((item) => <article className="mesh-panel teacher-studio-review-card" key={item.id}><small>{item.type} · {item.agent}</small><h3>{item.title}</h3><p>{item.reason}</p><div className="teacher-studio-review-meta"><span>{item.student}</span><span>{item.status}</span></div><div className="mesh-actions"><button className="mesh-ghost-button" onClick={() => onOpen(item.rationale)}>Trace rationale</button><button className="mesh-primary-button">Approve</button></div></article>)}</div>
    </section>
  );
}

function Intervention({ activeStudent, onChooseStudent }: { activeStudent: Student; onChooseStudent: (student: Student) => void }) {
  return (
    <section className="teacher-studio-section teacher-studio-grid-2">
      <section className="mesh-panel"><PanelHead title="Interventions" eyebrow="/interventions" /><table className="mesh-table"><thead><tr><th>学生</th><th>证据</th><th>建议动作</th><th>操作</th></tr></thead><tbody>{STUDENTS.map((student) => <tr key={student.id}><td><strong>{student.id}</strong></td><td>{student.evidence}</td><td>{student.action}</td><td><button className="mesh-ghost-button" onClick={() => onChooseStudent(student)}>Generate</button></td></tr>)}</tbody></table></section>
      <section className="mesh-panel"><PanelHead title="Closed loop" eyebrow="/loop" /><div className="teacher-studio-loop-stack"><LoopCard label="risk signal" title={`${activeStudent.id} · ${activeStudent.focus}`} body={activeStudent.evidence} /><LoopCard label="teacher action" title={activeStudent.action} body="老师确认后触发资源生成，审核通过后回流学生端。" /><LoopCard label="profile update" title="EvaluationAgent 更新画像" body="答题表现、资源反馈与老师干预记录进入下一轮推荐依据。" /></div></section>
    </section>
  );
}

function Log({ scope, text }: { scope: string; text: string }) { return <div className="mesh-log-line"><strong>{scope}</strong><span><span className="mesh-log-ok">✓</span> {text}</span></div>; }
function PanelHead({ title, eyebrow }: { title: string; eyebrow: string }) { return <div className="teacher-studio-panel-head"><h2>{title}</h2><span className="mesh-mono">{eyebrow}</span></div>; }
function MetricGrid({ metrics }: { metrics: { value: string; label: string }[] }) { return <div className="mesh-metric-grid">{metrics.map((item) => <div className="mesh-metric" key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}</div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="teacher-studio-field"><span>{label}</span><input className="teacher-studio-input" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function LoopCard({ label, title, body }: { label: string; title: string; body: string }) { return <div className="teacher-studio-loop-card"><span className="mesh-mono">{label}</span><strong>{title}</strong><p>{body}</p></div>; }
function Progress({ value }: { value: number }) { return <div className="mesh-progress"><span style={{ '--value': `${value}%` } as CSSProperties} /></div>; }