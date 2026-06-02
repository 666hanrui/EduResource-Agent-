import { useMemo, useRef, useState } from 'react';
import { RationalePanel } from '../RationalePanel';
import { VercelMeshNav as MeshNav } from '../VercelMeshRecipe';
import type { GenerateResults, Rationale } from '../../types/resources';
import '../../vercel-mesh.css';
import './teacher-mesh.css';
import { DEMO_RATIONALE, STUDENTS, TAB_ITEMS } from './model';
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
                <TeacherLog scope="profile" text={`loaded ${activeStudent.id}: ${activeStudent.focus}`} />
                <TeacherLog scope="risk" text={`${activeStudent.risk.toUpperCase()} · mastery ${activeStudent.mastery}%`} />
                <TeacherLog scope="agent" text="7-agent DAG ready" />
                <TeacherLog scope="trace" text={taskId ? `active task ${taskId}` : 'waiting for teacher command'} />
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

          {active === 'overview' && <OverviewPanel metrics={metrics} onChooseStudent={chooseStudent} />}
          {active === 'generator' && <GeneratorPanel studentId={studentId} knowledgeId={knowledgeId} knowledgeName={knowledgeName} goal={goal} runState={runState} taskId={taskId} error={error} onStudentId={setStudentId} onKnowledgeId={setKnowledgeId} onKnowledgeName={setKnowledgeName} onGoal={setGoal} onGenerate={generate} />}
          {active === 'review' && <ReviewPanel reviews={reviews} onOpen={setRationale} />}
          {active === 'intervention' && <InterventionPanel activeStudent={activeStudent} onChooseStudent={chooseStudent} />}
        </main>
        <footer className="mesh-footer">Teacher Resource Studio · Vercel Mesh visual language · Personalized learning loop</footer>
        {rationale && <RationalePanel rationale={rationale} title="老师审核视角：这份资源为什么被生成？" onClose={() => setRationale(null)} />}
      </div>
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
