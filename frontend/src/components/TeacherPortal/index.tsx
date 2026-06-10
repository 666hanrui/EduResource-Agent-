import { useEffect, useMemo, useRef, useState } from 'react';
import { RationalePanel } from '../RationalePanel';
import { AgentSystemsShowcase } from '../AgentSystemsShowcase';
import { CinematicFooter, CinematicMasthead, useCinematicReveal } from '../ProjectLanding';
import type { GenerateResults, Rationale } from '../../types/resources';
import '../../vercel-mesh.css';
import '../ProjectLanding/cinematic-resource.css';
import './teacher-mesh.css';
import { AGENTS, CLASSES, STUDENTS, TAB_ITEMS } from './model';
import type { ReviewItem, RunState, Student, TabKey, TeacherDashboard, TeacherGenerationJob, TeacherStudentSnapshot } from './model';
import {
  buildTeacherArtifactLibrary,
  buildTeacherReviewItems,
  mergeReviewItems,
  pickLatestTeacherResults,
  TEACHER_DELIVERABLE_TYPES,
} from './artifacts';
import {
  GeneratorPanel,
  InterventionPanel,
  OverviewPanel,
  ReviewPanel,
  TeacherLog,
} from './panels';

const DEFAULT_TEACHER_ID = 'tch_001';
const DEFAULT_CLASS_ID = 'class-ds-boost';

export function TeacherPortal() {
  const [active, setActive] = useState<TabKey>('overview');
  const [teacherId] = useState(DEFAULT_TEACHER_ID);
  const [classId, setClassId] = useState(DEFAULT_CLASS_ID);
  const [studentId, setStudentId] = useState('stu_018');
  const [knowledgeId, setKnowledgeId] = useState('binary-tree-traversal');
  const [knowledgeName, setKnowledgeName] = useState('二叉树遍历');
  const [goal, setGoal] = useState('为高风险学生生成一套低难度、可视化优先、可审核溯源的补救资源包');
  const [dashboard, setDashboard] = useState<TeacherDashboard | null>(null);
  const [dashboardStudents, setDashboardStudents] = useState<Student[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>('idle');
  const [results, setResults] = useState<GenerateResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState<Rationale | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const pollRef = useRef<number | null>(null);
  useCinematicReveal();

  useEffect(() => {
    let cancelled = false;
    const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
    fetch(`/api/teachers/${teacherId}/dashboard${query}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return response.json() as Promise<TeacherDashboard>;
      })
      .then((data) => {
        if (cancelled) return;
        setDashboard(data);
        const nextStudents = normalizeStudents(data.attention_queue);
        setDashboardStudents(nextStudents);
        setReviewItems(normalizeReviewItems(data.review_items));
        if (data.active_class.class_id !== classId) {
          setClassId(data.active_class.class_id);
        }
        if (nextStudents.length && !nextStudents.some((student) => student.id === studentId)) {
          applyStudent(nextStudents[0]);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [classId, teacherId]);

  const classOptions = dashboard?.classes ?? CLASSES;
  const studentRows = dashboard ? dashboardStudents : STUDENTS;
  const activeClass = dashboard?.active_class ?? classOptions.find((item) => item.class_id === classId) ?? classOptions[0];
  const activeStudent = studentRows.find((item) => item.id === studentId) ?? studentRows[0] ?? STUDENTS[1];

  const metrics = useMemo(() => [
    { value: String(activeClass?.students ?? 96), label: 'active students' },
    { value: String(activeClass?.risk ?? 20), label: 'weakness signals' },
    { value: results ? '1' : String(dashboard?.recent_packages.length ?? 0), label: results ? 'current bundle' : 'teacher packages' },
    { value: '91%', label: 'traceable outputs' },
  ], [activeClass, dashboard, results]);

  const persistedResults = useMemo(
    () => pickLatestTeacherResults(dashboard?.recent_packages, studentId, knowledgeId),
    [dashboard?.recent_packages, knowledgeId, studentId],
  );
  const activeResults = results ?? persistedResults;
  const artifactLibrary = useMemo(
    () => buildTeacherArtifactLibrary({
      results: activeResults,
      knowledgeId,
      knowledgeName,
      studentId,
      goal,
      focus: activeStudent?.focus,
      risk: activeStudent?.risk,
    }),
    [activeResults, activeStudent?.focus, activeStudent?.risk, goal, knowledgeId, knowledgeName, studentId],
  );
  const deliverables = useMemo(
    () => TEACHER_DELIVERABLE_TYPES.flatMap((type) => artifactLibrary[type] ? [artifactLibrary[type]!] : []),
    [artifactLibrary],
  );
  const reviews = useMemo<ReviewItem[]>(
    () => mergeReviewItems(normalizeReviewItems(reviewItems), buildTeacherReviewItems(artifactLibrary)),
    [artifactLibrary, reviewItems],
  );

  const stopPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (id: string, nextClassId: string) => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/teachers/${teacherId}/classes/${nextClassId}/teaching-packages/${id}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const data = (await response.json()) as TeacherGenerationJob;
        if (data.status === 'queued' || data.status === 'running') return;
        if (data.status === 'failed') throw new Error(data.message);
        setResults(asGenerateResults(data.results));
        setReviewItems(normalizeReviewItems(data.review_items));
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
    const targetClassId = activeStudent.class_id ?? classId;
    setError(null);
    setResults(null);
    setReviewItems([]);
    setRunState('submitting');
    try {
      const response = await fetch(`/api/teachers/${teacherId}/classes/${targetClassId}/teaching-packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_student_id: studentId,
          target_knowledge_id: knowledgeId,
          target_knowledge_name: knowledgeName,
          teaching_goal: goal,
          difficulty: activeStudent.risk === 'high' ? 2 : 3,
          exercise_count: activeStudent.risk === 'high' ? 6 : 5,
          languages: ['python', 'java'],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = (await response.json()) as TeacherGenerationJob;
      setJobId(data.job_id);
      setTaskId(data.generate_task_id);
      setRunState('running');
      startPolling(data.job_id, targetClassId);
    } catch (err) {
      setRunState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const applyStudent = (student: Student) => {
    setStudentId(student.id);
    setKnowledgeId(student.knowledgeId);
    setKnowledgeName(student.knowledgeName);
    setGoal(`针对 ${student.id} 的「${student.focus}」薄弱点，生成一套可解释、低负担、可审核的个性化学习资源。`);
  };

  const chooseStudent = (student: Student) => {
    applyStudent(student);
    if (student.class_id && student.class_id !== classId) {
      setClassId(student.class_id);
    }
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
              <span className="word">Teacher</span>{' '}
              <span className="word">Resource</span>{' '}
              <span className="word"><em>Studio.</em></span>
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
                <h2 className="cinematic-section__title">Read evidence. Make resources. Close the <em>learning loop.</em></h2>
              </div>
              <div className="cinematic-section__aside">Active student<br />{activeStudent.risk} risk<br />{runState}</div>
            </div>

            <div className="teacher-cinematic-spread cinematic-reveal">
              <div className="teacher-cinematic-statement">
                <p className="cinematic-pull">先读证据，再生成资源。老师端应该像一张清爽的编辑台，而不是一块吵闹的后台屏幕。</p>
                <div className="cinematic-body">
                  <p>当前学生：{activeStudent.id}；短板：{activeStudent.evidence}。</p>
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
                  <TeacherLog scope="store" text={jobId ? `teacher job ${jobId}` : `class scope ${activeClass?.class_id ?? classId}`} />
                </div>
              </div>
            </div>

            <div className="cinematic-reveal">
              <AgentSystemsShowcase
                eyebrow="Two multi-agent systems"
                title="老师端也把两套 Agent 直接摊开。"
                subtitle="上游是专业探索，下游是资源生成；当前高亮资源生成链路。"
                activeSuiteId="generation"
              />
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
              {active === 'overview' && (
                <OverviewPanel
                  metrics={metrics}
                  onChooseStudent={chooseStudent}
                  classes={classOptions}
                  students={studentRows}
                  activeClassId={classId}
                  onClassId={setClassId}
                  deliverables={deliverables}
                  activeStudent={activeStudent}
                  goal={goal}
                />
              )}
              {active === 'generator' && <GeneratorPanel studentId={studentId} knowledgeId={knowledgeId} knowledgeName={knowledgeName} goal={goal} runState={runState} taskId={taskId} error={error} onStudentId={setStudentId} onKnowledgeId={setKnowledgeId} onKnowledgeName={setKnowledgeName} onGoal={setGoal} onGenerate={generate} />}
              {active === 'review' && <ReviewPanel reviews={reviews} artifactLibrary={artifactLibrary} onOpen={setRationale} />}
              {active === 'intervention' && <InterventionPanel activeStudent={activeStudent} onChooseStudent={chooseStudent} students={studentRows} />}
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

function asGenerateResults(value: unknown): GenerateResults | null {
  if (value && typeof value === 'object') return value as GenerateResults;
  return null;
}

function normalizeReviewItems(items: ReviewItem[] | undefined): ReviewItem[] {
  return (items ?? []).map((item) => ({
    ...item,
    student: item.student ?? null,
    rationale: item.rationale as Rationale,
  }));
}

function normalizeStudents(items: TeacherStudentSnapshot[] | undefined): Student[] {
  return (items ?? []).map((item) => ({
    id: item.id,
    class_id: item.class_id,
    focus: item.focus,
    mastery: item.mastery,
    risk: item.risk,
    evidence: item.evidence,
    action: item.action,
    knowledgeId: item.knowledge_id,
    knowledgeName: item.knowledge_name,
  }));
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
