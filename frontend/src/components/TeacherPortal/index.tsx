import { useMemo, useRef, useState } from 'react';
import { RationalePanel } from '../RationalePanel';
import { CinematicFooter, CinematicMasthead, useCinematicReveal } from '../ProjectLanding';
import type { GenerateResults, Rationale } from '../../types/resources';
import '../../vercel-mesh.css';
import '../ProjectLanding/cinematic-resource.css';
import './teacher-mesh.css';
import { AGENTS, DEMO_RATIONALE, STUDENTS, TAB_ITEMS } from './model';
import type { ReviewItem, RunState, Student, TabKey } from './model';
import {
  GeneratorPanel,
  InterventionPanel,
  OverviewPanel,
  ReviewPanel,
  TeacherLog,
} from './panels';

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
  useCinematicReveal();

  const activeStudent = STUDENTS.find((item) => item.id === studentId) ?? STUDENTS[1];

  const metrics = useMemo(() => [
    { value: '96', label: 'active students' },
    { value: '20', label: 'weakness signals' },
    { value: results ? '1' : '312', label: results ? 'current bundle' : 'generated resources' },
    { value: '91%', label: 'traceable outputs' },
  ], [results]);

  const reviews = useMemo<ReviewItem[]>(() => buildReviewItems({ results, studentId, knowledgeName }), [knowledgeName, results, studentId]);

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
          conversation: [{ role: 'student', text: goal }],
          selection_context: {
            source: 'teacher_console',
            reason: goal,
            suggested_difficulty: activeStudent.risk === 'high' ? 2 : 3,
          },
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
    <div className="cinematic-page teacher-cinematic-page">
      <CinematicMasthead active="teacher" />
      <section className="cinematic-hero teacher-cinematic-hero">
        <div className="cinematic-hero__media">
          <img className="cinematic-hero__img" src="https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=2400&q=88" alt="老师资源工作室" />
          <div className="cinematic-hero__veil" />
          <div className="cinematic-grain" />
        </div>
        <div className="cinematic-hero__content">
          <div className="cinematic-hero__lede">
            <div className="cinematic-eyebrow">
              <span className="num">T° 01</span>
              <span className="bar" />
              <span>Teacher Resource Studio</span>
            </div>
            <h1 className="cinematic-hero__title teacher-cinematic-title">
              <span className="word">Generate</span>{' '}
              <span className="word">resources</span>{' '}
              <span className="word">with</span>{' '}
              <span className="word"><em>teacher</em></span>{' '}
              <span className="word"><em>evidence.</em></span>
            </h1>
            <div className="cinematic-byline">
              <em>{activeStudent.id}</em>
              <span className="cinematic-dot" />
              <span>{activeStudent.focus}</span>
              <span className="cinematic-dot" />
              <span>掌握度 {activeStudent.mastery}%</span>
            </div>
            <div className="cinematic-hero__meta">
              <div className="cinematic-meta-cell">
                <span className="cinematic-meta-label">Current student</span>
                <span className="cinematic-meta-value">{activeStudent.id}</span>
              </div>
              <div className="cinematic-meta-cell">
                <span className="cinematic-meta-label">Knowledge</span>
                <span className="cinematic-meta-value">{knowledgeName}</span>
              </div>
              <div className="cinematic-meta-cell">
                <span className="cinematic-meta-label">Runtime</span>
                <span className="cinematic-meta-value">{taskId ? taskId : 'Standby'}</span>
              </div>
              <button className="cinematic-button cinematic-button--light" onClick={() => setActive('generator')}>Generate</button>
            </div>
          </div>
        </div>
      </section>

      <main className="teacher-cinematic-main">
        <section className="cinematic-section">
          <div className="cinematic-section__inner">
            <div className="cinematic-section__head cinematic-reveal">
              <div>
                <span className="cinematic-eyebrow"><span className="num">01</span><span className="bar" />Teacher console</span>
                <h2 className="cinematic-section__title">Generate, review, and intervene from one <em>studio surface.</em></h2>
              </div>
              <div className="cinematic-section__aside">Active student<br />{activeStudent.risk} risk<br />{runState}</div>
            </div>

            <div className="teacher-cinematic-spread cinematic-reveal">
              <div className="teacher-cinematic-statement">
                <p className="cinematic-pull">老师端不是后台表格，而是资源生产工作室：先看风险和证据，再生成、审核、下发。</p>
                <div className="cinematic-body">
                  <p>当前学生：{activeStudent.id}；短板：{activeStudent.evidence}。</p>
                  <p>点击下方模块可以切换总览、生成、审核和干预闭环。生成调用真实 `/api/generate`，并由主 Agent 拆解后派发。</p>
                </div>
              </div>
              <div className="teacher-cinematic-terminal">
                <div className="teacher-cinematic-terminal__bar">teacher-console.log</div>
                <div className="teacher-cinematic-terminal__body">
                  <TeacherLog scope="profile" text={`loaded ${activeStudent.id}: ${activeStudent.focus}`} />
                  <TeacherLog scope="risk" text={`${activeStudent.risk.toUpperCase()} · mastery ${activeStudent.mastery}%`} />
                  <TeacherLog scope="main" text="PlannerAgent owns the learning DAG blueprint" />
                  <TeacherLog scope="dispatch" text="Orchestrator routes one task_id through all agents" />
                  <TeacherLog scope="trace" text={taskId ? `active task ${taskId}` : 'waiting for teacher command'} />
                </div>
              </div>
            </div>

            <MainAgentTopology runState={runState} taskId={taskId} />

            <nav className="teacher-studio-tabs cinematic-reveal" aria-label="Teacher studio modules">
              {TAB_ITEMS.map((tab) => (
                <button key={tab.key} className={active === tab.key ? 'teacher-studio-tab is-active' : 'teacher-studio-tab'} onClick={() => setActive(tab.key)}>
                  <strong>{tab.title}</strong><span>{tab.caption}</span>
                </button>
              ))}
            </nav>

            <div className="teacher-cinematic-panels cinematic-reveal">
              {active === 'overview' && <OverviewPanel metrics={metrics} onChooseStudent={chooseStudent} />}
              {active === 'generator' && <GeneratorPanel studentId={studentId} knowledgeId={knowledgeId} knowledgeName={knowledgeName} goal={goal} runState={runState} taskId={taskId} error={error} onStudentId={setStudentId} onKnowledgeId={setKnowledgeId} onKnowledgeName={setKnowledgeName} onGoal={setGoal} onGenerate={generate} />}
              {active === 'review' && <ReviewPanel reviews={reviews} onOpen={setRationale} />}
              {active === 'intervention' && <InterventionPanel activeStudent={activeStudent} onChooseStudent={chooseStudent} />}
            </div>
          </div>
        </section>
      </main>
      <CinematicFooter />
      <div className="cinematic-rail cinematic-rail--left"><span className="tick" /><span>Teacher Studio · MMXXVI</span></div>
      <div className="cinematic-rail cinematic-rail--right"><span>Evidence first</span><span className="tick" /></div>
      {rationale && <RationalePanel rationale={rationale} title="老师审核视角：这份资源为什么被生成？" onClose={() => setRationale(null)} />}
    </div>
  );
}

function buildReviewItems({ results, studentId, knowledgeName }: { results: GenerateResults | null; studentId: string; knowledgeName: string }): ReviewItem[] {
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
}

function MainAgentTopology({ runState, taskId }: { runState: RunState; taskId: string | null }) {
  const workerAgents = AGENTS.filter(([name]) => name !== 'PlannerAgent');
  const status = taskId ? (runState === 'done' ? 'done' : runState === 'error' ? 'error' : 'running') : 'waiting';

  return (
    <section className="teacher-main-agent-map cinematic-reveal in" aria-label="主控 Agent 拓扑">
      <div className="teacher-main-agent-map__head">
        <span className="cinematic-eyebrow"><span className="num">DAG</span><span className="bar" />Main agent topology</span>
        <div className={`teacher-main-agent-map__status is-${status}`}>
          {taskId ? taskId : 'no active task'}
        </div>
      </div>

      <div className="teacher-main-agent-map__grid">
        <div className="teacher-main-agent-node teacher-main-agent-node--control">
          <span>Control layer</span>
          <strong>Orchestrator / GenerateFlow</strong>
          <p>统一接收老师目标、绑定 task_id、驱动 SSE 事件流。</p>
        </div>

        <div className="teacher-main-agent-arrow" aria-hidden="true">→</div>

        <div className="teacher-main-agent-node teacher-main-agent-node--main">
          <span>Main Agent</span>
          <strong>PlannerAgent</strong>
          <p>读取画像和知识点，拆出讲解、题目、代码、可视化与评估任务。</p>
        </div>

        <div className="teacher-main-agent-arrow" aria-hidden="true">→</div>

        <div className="teacher-main-agent-workers">
          {workerAgents.map(([name, label, body]) => (
            <div className="teacher-main-agent-worker" key={name}>
              <span>{label}</span>
              <strong>{name}</strong>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
