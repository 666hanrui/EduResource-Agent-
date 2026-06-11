import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CinematicMasthead, useCinematicReveal } from '../ProjectLanding';
import type { GenerateResults } from '../../types/resources';
import '../ProjectLanding/cinematic-resource.css';
import './teacher-mesh.css';
import { TeacherPet, type TeacherPetGenerateDraft } from './TeacherPet';
import { AGENTS, CLASSES, STUDENTS } from './model';
import type {
  ClassProfile,
  ReviewItem,
  RunState,
  Student,
  TabKey,
  TeacherDashboard,
  TeacherGenerationJob,
  TeacherIndustryCourseReport,
  TeacherIndustrySummary,
  TeacherTeachingPackage,
  TeacherStudentSnapshot,
} from './model';
import {
  buildTeacherArtifactLibrary,
  buildTeacherReviewItems,
  mergeReviewItems,
  pickLatestTeacherResults,
  TEACHER_DELIVERABLE_TYPES,
  type TeacherArtifact,
  type TeacherArtifactLibrary,
  type TeacherArtifactType,
} from './artifacts';

const DEFAULT_TEACHER_ID = 'tch_001';
const DEFAULT_CLASS_ID = 'class-se-2301';

const NAV_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: 'review', label: '体系' },
  { key: 'generator', label: '生成' },
  { key: 'intervention', label: '干预' },
  { key: 'overview', label: '总览' },
];

const PLAN_MODULES: Array<{ type: TeacherArtifactType; label: string }> = [
  { type: 'TalentPlan', label: '人培方案' },
  { type: 'Syllabus', label: '大纲' },
  { type: 'LessonPlan', label: '教案' },
  { type: 'SlideDeck', label: 'PPT' },
  { type: 'KeyFocus', label: '重难点' },
];

const CURRICULUM_RESOURCE_MODULES: Array<{ type: TeacherArtifactType; label: string; role: string }> = [
  { type: 'Syllabus', label: '教学大纲', role: '课程结构' },
  { type: 'LessonPlan', label: '教案', role: '课堂设计' },
  { type: 'SlideDeck', label: 'PPT', role: '投屏页稿' },
  { type: 'KeyFocus', label: '重难点', role: '讲法提醒' },
];

type TeacherGenerateOptions = TeacherPetGenerateDraft & {
  targetType?: TeacherArtifactType;
};

export function TeacherPortal() {
  const [active, setActive] = useState<TabKey>('review');
  const [teacherId] = useState(DEFAULT_TEACHER_ID);
  const [classId, setClassId] = useState(DEFAULT_CLASS_ID);
  const [studentId, setStudentId] = useState('stu_001');
  const [knowledgeId, setKnowledgeId] = useState('linked-list-basics');
  const [knowledgeName, setKnowledgeName] = useState('链表');
  const [goal, setGoal] = useState('生成低负担补救包');
  const [dashboard, setDashboard] = useState<TeacherDashboard | null>(null);
  const [dashboardStudents, setDashboardStudents] = useState<Student[]>([]);
  const [teachingPackageId, setTeachingPackageId] = useState<string | null>(null);
  const [teachingPackageClassId, setTeachingPackageClassId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>('idle');
  const [pptExportState, setPptExportState] = useState<'idle' | 'exporting' | 'done' | 'error'>('idle');
  const [results, setResults] = useState<GenerateResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [selectedReviewType, setSelectedReviewType] = useState<TeacherArtifactType>('TalentPlan');
  const [industrySummary, setIndustrySummary] = useState<TeacherIndustrySummary | null>(null);
  const pollRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  useCinematicReveal();

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

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
        const nextStudents = normalizeStudents(data.attention_queue);
        setDashboard(data);
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

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/teachers/industry-data/summary?program=software-engineering')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        return response.json() as Promise<TeacherIndustrySummary>;
      })
      .then((data) => {
        if (!cancelled) setIndustrySummary(data);
      })
      .catch(() => {
        if (!cancelled) setIndustrySummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const classOptions = dashboard?.classes ?? CLASSES;
  const studentRows = dashboard ? dashboardStudents : STUDENTS;
  const activeClass = dashboard?.active_class ?? classOptions.find((item) => item.class_id === classId) ?? classOptions[0];
  const activeStudent = studentRows.find((item) => item.id === studentId) ?? studentRows[0] ?? STUDENTS[1];

  const persistedResults = useMemo(
    () => pickLatestTeacherResults(dashboard?.recent_packages, studentId, knowledgeId),
    [dashboard?.recent_packages, knowledgeId, studentId],
  );
  const persistedPackage = useMemo(
    () => pickLatestTeacherPackage(dashboard?.recent_packages, studentId, knowledgeId),
    [dashboard?.recent_packages, knowledgeId, studentId],
  );
  const activeResults = results ?? persistedResults;
  const activePackageId = results ? teachingPackageId : persistedPackage?.id ?? null;
  const activePackageClassId = results ? teachingPackageClassId ?? classId : persistedPackage?.class_id ?? classId;
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
  const metrics = useMemo(() => [
    { label: '班级人数', value: String(activeClass?.students ?? 0) },
    { label: '风险信号', value: String(activeClass?.risk ?? 0) },
    { label: '资源包', value: results ? '1' : String(dashboard?.recent_packages.length ?? 0) },
    { label: '可溯源', value: '91%' },
  ], [activeClass, dashboard, results]);

  const applyStudent = (student: Student) => {
    setStudentId(student.id);
    setKnowledgeId(student.knowledgeId);
    setKnowledgeName(student.knowledgeName);
    setGoal(`${student.id} · ${student.focus} 补救包`);
    setResults(null);
    setTeachingPackageId(null);
    setTeachingPackageClassId(null);
  };

  const chooseStudent = (student: Student) => {
    applyStudent(student);
    if (student.class_id && student.class_id !== classId) {
      setClassId(student.class_id);
    }
    setActive('generator');
    revealWorkbench();
  };

  const openTalentSystem = (type: TeacherArtifactType = 'TalentPlan') => {
    setSelectedReviewType(type);
    setActive('review');
    revealWorkbench();
  };

  const navigateTeacher = (tab: TabKey, type?: TeacherArtifactType) => {
    if (type) setSelectedReviewType(type);
    setActive(tab);
    revealWorkbench();
  };

  const prepareGenerationDraft = (draft: TeacherPetGenerateDraft) => {
    if (draft.studentId) setStudentId(draft.studentId);
    if (draft.knowledgeId) setKnowledgeId(draft.knowledgeId);
    if (draft.knowledgeName) setKnowledgeName(draft.knowledgeName);
    if (draft.goal) setGoal(draft.goal);
    setResults(null);
    setReviewItems([]);
    setTeachingPackageId(null);
    setTeachingPackageClassId(null);
    setPptExportState('idle');
    setActive('generator');
    revealWorkbench();
  };

  const revealWorkbench = () => {
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const stopPolling = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (id: string, nextClassId: string, targetType: TeacherArtifactType = 'TalentPlan') => {
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
        openTalentSystem(targetType);
      } catch (err) {
        setRunState('error');
        setError(err instanceof Error ? err.message : String(err));
        stopPolling();
      }
    }, 1500);
  };

  const generate = async (options: TeacherGenerateOptions = {}) => {
    const nextStudentId = options.studentId ?? studentId;
    const nextKnowledgeId = options.knowledgeId ?? knowledgeId;
    const nextKnowledgeName = options.knowledgeName ?? knowledgeName;
    const nextGoal = options.goal ?? goal;
    const targetType = options.targetType ?? 'TalentPlan';
    const targetStudent = studentRows.find((student) => student.id === nextStudentId) ?? activeStudent;
    const targetClassId = targetStudent.class_id ?? classId;
    if (nextStudentId !== studentId) setStudentId(nextStudentId);
    if (nextKnowledgeId !== knowledgeId) setKnowledgeId(nextKnowledgeId);
    if (nextKnowledgeName !== knowledgeName) setKnowledgeName(nextKnowledgeName);
    if (nextGoal !== goal) setGoal(nextGoal);
    setError(null);
    setResults(null);
    setReviewItems([]);
    setTeachingPackageId(null);
    setTeachingPackageClassId(null);
    setPptExportState('idle');
    setRunState('submitting');
    try {
      const response = await fetch(`/api/teachers/${teacherId}/classes/${targetClassId}/teaching-packages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_student_id: nextStudentId,
          target_knowledge_id: nextKnowledgeId,
          target_knowledge_name: nextKnowledgeName,
          teaching_goal: nextGoal,
          difficulty: targetStudent.risk === 'high' ? 2 : 3,
          exercise_count: targetStudent.risk === 'high' ? 6 : 5,
          languages: ['python', 'java'],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = (await response.json()) as TeacherGenerationJob;
      setTeachingPackageId(data.teaching_package_id);
      setTeachingPackageClassId(targetClassId);
      setTaskId(data.generate_task_id);
      setRunState('running');
      startPolling(data.job_id, targetClassId, targetType);
    } catch (err) {
      setRunState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const exportPptx = async () => {
    if (!activePackageId) return;
    setPptExportState('exporting');
    setError(null);
    try {
      const response = await fetch(
        `/api/teachers/${teacherId}/classes/${activePackageClassId}/teaching-packages/${activePackageId}/pptx`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filenameFromDisposition(response.headers.get('Content-Disposition')) ?? `${activePackageId}.pptx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setPptExportState('done');
    } catch (err) {
      setPptExportState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="cinematic-page teacher-cinematic-page">
      <CinematicMasthead active="teacher" />

      <section className="teacher-app-header" aria-label="老师端工作台概览">
        <div className="teacher-app-header__copy">
          <span className="cinematic-eyebrow"><span className="num">Teacher</span><span className="bar" />Resource system</span>
          <h1>{activeClass?.name ?? '软件工程班'}</h1>
          <p>人培总纲 / 学期课程 / 课堂资源</p>
        </div>
        <div className="teacher-app-header__meta">
          <StatusPill label="班级" value={activeClass?.name ?? '课堂'} />
          <StatusPill label="焦点" value={knowledgeName} />
          <StatusPill label="状态" value={runState} tone={runState === 'error' ? 'danger' : runState === 'running' ? 'active' : undefined} />
        </div>
        <div className="teacher-app-header__actions">
          <button type="button" onClick={() => navigateTeacher('review', 'TalentPlan')}>看人培体系</button>
          <button type="button" onClick={() => navigateTeacher('review', 'SlideDeck')}>看 PPT</button>
          <button type="button" onClick={() => navigateTeacher('generator')}>生成资源包</button>
        </div>
      </section>

      <main className="teacher-console-main">
        <section ref={workspaceRef} className="cinematic-section teacher-workspace-section">
          <div className="cinematic-section__inner">
            <div className="teacher-workbench-head cinematic-reveal in">
              <div>
                <span className="cinematic-eyebrow"><span className="num">01</span><span className="bar" />Teacher console</span>
                <h2 className="cinematic-section__title">教学体系.</h2>
              </div>
              <div className="cinematic-section__aside teacher-console-status">
                <StatusPill label="对象" value={activeStudent.id} />
                <StatusPill label="状态" value={runState} tone={runState === 'error' ? 'danger' : runState === 'running' ? 'active' : undefined} />
              </div>
            </div>

            <nav className="teacher-console-tabs cinematic-reveal" aria-label="老师端模块">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={active === item.key ? 'is-active' : ''}
                  onClick={() => setActive(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="teacher-console-panel cinematic-reveal">
              {active === 'overview' && (
                <OverviewDesk
                  metrics={metrics}
                  classes={classOptions}
                  activeClassId={classId}
                  onClassId={setClassId}
                  students={studentRows}
                  activeStudent={activeStudent}
                  deliverables={deliverables}
                  onChooseStudent={chooseStudent}
                  onOpenTalentSystem={openTalentSystem}
                />
              )}

              {active === 'generator' && (
                <GeneratorDesk
                  studentId={studentId}
                  knowledgeId={knowledgeId}
                  knowledgeName={knowledgeName}
                  goal={goal}
                  runState={runState}
                  taskId={taskId}
                  error={error}
                  onStudentId={setStudentId}
                  onKnowledgeId={setKnowledgeId}
                  onKnowledgeName={setKnowledgeName}
                  onGoal={setGoal}
                  onGenerate={() => {
                    void generate({ targetType: 'TalentPlan' });
                  }}
                />
              )}

              {active === 'review' && (
                <TalentSystemDesk
                  activeClass={activeClass}
                  activeStudent={activeStudent}
                  industrySummary={industrySummary}
                  artifactLibrary={artifactLibrary}
                  reviews={reviews}
                  selectedType={selectedReviewType}
                  canExportPptx={Boolean(activePackageId)}
                  pptExportState={pptExportState}
                  onSelectedType={setSelectedReviewType}
                  onExportPptx={exportPptx}
                />
              )}

              {active === 'intervention' && (
                <InterventionDesk
                  students={studentRows}
                  activeStudent={activeStudent}
                  onChooseStudent={chooseStudent}
                />
              )}
            </div>

            <AgentFlow runState={runState} taskId={taskId} />
          </div>
        </section>
      </main>

      <TeacherPet
        activeTab={active}
        runState={runState}
        autoCloseKey={`${active}:${selectedReviewType}:${classId}:${studentId}:${knowledgeId}`}
        activeClassName={activeClass?.name ?? '课堂'}
        classes={classOptions}
        students={studentRows}
        activeStudent={activeStudent}
        knowledgeId={knowledgeId}
        knowledgeName={knowledgeName}
        goal={goal}
        selectedType={selectedReviewType}
        canExportPptx={Boolean(activePackageId)}
        pptExportState={pptExportState}
        onNavigate={navigateTeacher}
        onClassId={setClassId}
        onChooseStudent={chooseStudent}
        onPrepareGeneration={prepareGenerationDraft}
        onGenerate={generate}
        onExportPptx={exportPptx}
      />
    </div>
  );
}

function OverviewDesk({
  metrics,
  classes,
  activeClassId,
  onClassId,
  students,
  activeStudent,
  deliverables,
  onChooseStudent,
  onOpenTalentSystem,
}: {
  metrics: { label: string; value: string }[];
  classes: ClassProfile[];
  activeClassId: string;
  onClassId: (value: string) => void;
  students: Student[];
  activeStudent: Student;
  deliverables: TeacherArtifact[];
  onChooseStudent: (student: Student) => void;
  onOpenTalentSystem: (type?: TeacherArtifactType) => void;
}) {
  const filteredStudents = activeClassId
    ? students.filter((student) => !student.class_id || student.class_id === activeClassId)
    : students;
  const plan = deliverables.find((item) => item.type === 'TalentPlan');

  return (
    <section className="teacher-console-grid teacher-console-grid--overview">
      <div className="teacher-console-card teacher-console-card--metrics">
        {metrics.map((item) => (
          <MetricCell key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <section className="teacher-console-card">
        <PanelHead title="班级" aside={
          <select value={activeClassId} onChange={(event) => onClassId(event.target.value)}>
            {classes.map((item) => (
              <option key={item.class_id} value={item.class_id}>{item.name}</option>
            ))}
          </select>
        } />
        <div className="teacher-class-list">
          {classes.map((item) => (
            <button
              key={item.class_id}
              type="button"
              className={item.class_id === activeClassId ? 'is-active' : ''}
              onClick={() => onClassId(item.class_id)}
            >
              <strong>{item.name}</strong>
              <span>{item.students} 人</span>
              <em>{item.risk} 风险</em>
            </button>
          ))}
        </div>
      </section>

      <section className="teacher-console-card teacher-console-card--wide">
        <PanelHead title="人培方案体系" aside={<button type="button" onClick={() => onOpenTalentSystem('TalentPlan')}>进入</button>} />
        <div className="teacher-plan-entry">
          <div>
            <span>{activeStudent.id}</span>
            <strong>{plan?.title ?? '人培方案体系'}</strong>
          </div>
          <div className="teacher-plan-modules">
            {PLAN_MODULES.map((module) => (
              <button key={module.type} type="button" onClick={() => onOpenTalentSystem(module.type)}>
                {module.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="teacher-console-card">
        <PanelHead title="风险队列" />
        <div className="teacher-risk-list">
          {filteredStudents.map((student) => (
            <button key={student.id} type="button" onClick={() => onChooseStudent(student)}>
              <strong>{student.id}</strong>
              <span>{compactText(student.focus, 16)}</span>
              <em className={`is-${student.risk}`}>{student.mastery}%</em>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function GeneratorDesk({
  studentId,
  knowledgeId,
  knowledgeName,
  goal,
  runState,
  taskId,
  error,
  onStudentId,
  onKnowledgeId,
  onKnowledgeName,
  onGoal,
  onGenerate,
}: {
  studentId: string;
  knowledgeId: string;
  knowledgeName: string;
  goal: string;
  runState: RunState;
  taskId: string | null;
  error: string | null;
  onStudentId: (value: string) => void;
  onKnowledgeId: (value: string) => void;
  onKnowledgeName: (value: string) => void;
  onGoal: (value: string) => void;
  onGenerate: () => void;
}) {
  const running = runState === 'submitting' || runState === 'running';

  return (
    <section className="teacher-console-grid teacher-console-grid--split">
      <div className="teacher-console-card">
        <PanelHead title="生成参数" aside={<span>{taskId ?? 'standby'}</span>} />
        <div className="teacher-form-grid">
          <Field label="对象" value={studentId} onChange={onStudentId} />
          <Field label="知识点 ID" value={knowledgeId} onChange={onKnowledgeId} />
          <Field label="知识点" value={knowledgeName} onChange={onKnowledgeName} />
        </div>
        <label className="teacher-field teacher-field--full">
          <span>目标</span>
          <textarea value={goal} onChange={(event) => onGoal(event.target.value)} />
        </label>
        <div className="teacher-action-row">
          <button type="button" className="teacher-primary-button" disabled={running} onClick={onGenerate}>
            {running ? '生成中' : '生成资源包'}
          </button>
          {error && <strong className="teacher-error">{error}</strong>}
        </div>
      </div>

      <div className="teacher-console-card">
        <PanelHead title="主控 Agent" />
        <div className="teacher-runtime-compact">
          {AGENTS.map(([name, label]) => (
            <div key={name} className={name === 'PlannerAgent' ? 'is-main' : ''}>
              <span>{label}</span>
              <strong>{name}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TalentSystemDesk({
  activeClass,
  activeStudent,
  industrySummary,
  artifactLibrary,
  reviews,
  selectedType,
  canExportPptx,
  pptExportState,
  onSelectedType,
  onExportPptx,
}: {
  activeClass: ClassProfile;
  activeStudent: Student;
  industrySummary: TeacherIndustrySummary | null;
  artifactLibrary: TeacherArtifactLibrary;
  reviews: ReviewItem[];
  selectedType: TeacherArtifactType;
  canExportPptx: boolean;
  pptExportState: 'idle' | 'exporting' | 'done' | 'error';
  onSelectedType: (type: TeacherArtifactType) => void;
  onExportPptx: () => void;
}) {
  const planArtifact = artifactLibrary.TalentPlan;
  const blueprint = planArtifact?.presentation;
  const semesters = blueprint?.semesterPlan ?? [];
  const defaultSemesterId = semesters.find((semester) => semester.id === 'year1-fall')?.id ?? semesters[0]?.id ?? '';
  const [selectedSemesterId, setSelectedSemesterId] = useState(defaultSemesterId);
  const selectedSemester =
    semesters.find((semester) => semester.id === selectedSemesterId) ??
    semesters.find((semester) => semester.id === defaultSemesterId) ??
    semesters[0];
  const [selectedCourse, setSelectedCourse] = useState(selectedSemester?.courses[0] ?? '');
  const resourceModules = CURRICULUM_RESOURCE_MODULES.filter((module) => artifactLibrary[module.type]);
  const activeType = selectedType === 'TalentPlan' || resourceModules.some((module) => module.type === selectedType)
    ? selectedType
    : 'TalentPlan';
  const activeArtifact = artifactLibrary[activeType] ?? planArtifact;
  const activeReview = reviews.find((item) => item.type === activeType);

  useEffect(() => {
    if (!defaultSemesterId || semesters.some((semester) => semester.id === selectedSemesterId)) return;
    setSelectedSemesterId(defaultSemesterId);
  }, [defaultSemesterId, selectedSemesterId, semesters]);

  useEffect(() => {
    if (!selectedSemester) return;
    if (selectedCourse && selectedSemester.courses.includes(selectedCourse)) return;
    setSelectedCourse(selectedSemester.courses[0] ?? '');
  }, [selectedCourse, selectedSemester]);

  if (!activeArtifact || !planArtifact || !selectedSemester) {
    return (
      <section className="teacher-console-card">
        <PanelHead title="人培方案体系" />
        <p className="teacher-empty">暂无内容</p>
      </section>
    );
  }

  const industryReport = pickIndustryCourseReport(industrySummary, selectedCourse);
  const courseMilestones = buildCourseMilestones(selectedCourse, selectedSemester, activeStudent, activeArtifact, industryReport);
  const detailSections = activeArtifact.sections.slice(0, activeType === 'TalentPlan' ? 3 : 4);
  const focusTitle = activeType === 'TalentPlan'
    ? `${activeClass.name} · 人培总纲`
    : `${selectedCourse || selectedSemester.courses[0]} · ${activeArtifact.label}`;

  return (
    <section className="teacher-curriculum-board">
      <aside className="teacher-program-spine">
        <button
          type="button"
          className={activeType === 'TalentPlan' ? 'teacher-program-card is-active' : 'teacher-program-card'}
          onClick={() => onSelectedType('TalentPlan')}
        >
          <span>人培总纲</span>
          <strong>{activeClass.name}</strong>
          <em>{blueprint?.direction ?? '软件工程方向'}</em>
          <i>4 年 · 8 学期 · 课程 / 项目 / 作品集</i>
        </button>

        <div className="teacher-stage-ladder" aria-label="学期路线">
          {semesters.map((semester) => (
            <button
              key={semester.id}
              type="button"
              className={semester.id === selectedSemester.id ? 'is-active' : ''}
              onClick={() => setSelectedSemesterId(semester.id)}
            >
              <span>{semester.label}</span>
              <strong>{semester.theme}</strong>
              <em>{semester.courses.slice(0, 2).join(' / ')}</em>
            </button>
          ))}
        </div>
      </aside>

      <article className="teacher-course-system">
        <header className="teacher-course-system__head">
          <div>
            <span>{selectedSemester.stage}</span>
            <h2>{selectedSemester.label} · {selectedSemester.theme}</h2>
          </div>
          <strong>{compactText(selectedSemester.output, 24)}</strong>
        </header>

        <div className="teacher-course-tabs" aria-label="当前学期课程">
          {selectedSemester.courses.map((course) => (
            <button
              key={course}
              type="button"
              className={course === selectedCourse ? 'is-active' : ''}
              onClick={() => setSelectedCourse(course)}
            >
              {course}
            </button>
          ))}
        </div>

        <div className="teacher-semester-brief">
          <section>
            <span>目标</span>
            <strong>{compactText(selectedSemester.target, 42)}</strong>
          </section>
          <section>
            <span>工程训练</span>
            <strong>{selectedSemester.engineering.slice(0, 2).join(' / ')}</strong>
          </section>
          <section>
            <span>学生焦点</span>
            <strong>{activeStudent.id} · {activeStudent.knowledgeName}</strong>
          </section>
        </div>

        <div className="teacher-course-milestones" aria-label="课程执行链路">
          {courseMilestones.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item.label}</strong>
              <em>{item.value}</em>
            </div>
          ))}
        </div>

        <IndustryAlignmentPanel
          selectedCourse={selectedCourse}
          report={industryReport}
          summary={industrySummary}
        />

        <div className="teacher-resource-stack">
          <div className="teacher-resource-rail" aria-label="当前课程资源">
            <button
              type="button"
              className={activeType === 'TalentPlan' ? 'is-active is-plan' : 'is-plan'}
              onClick={() => onSelectedType('TalentPlan')}
            >
              总纲
            </button>
            {resourceModules.map((module) => (
              <button
                key={module.type}
                type="button"
                className={activeType === module.type ? 'is-active' : ''}
                onClick={() => onSelectedType(module.type)}
              >
                <strong>{module.label}</strong>
                <span>{module.role}</span>
              </button>
            ))}
          </div>

          <section className="teacher-resource-sheet">
            <div className="teacher-resource-sheet__head">
              <div>
                <span>{activeReview?.agent ?? activeArtifact.agent}</span>
                <h3>{focusTitle}</h3>
              </div>
              <div className="teacher-system-actions">
                {activeType === 'SlideDeck' && (
                  <button type="button" disabled={!canExportPptx || pptExportState === 'exporting'} onClick={onExportPptx}>
                    {pptExportState === 'exporting' ? '导出中' : pptExportState === 'done' ? '已导出' : '导出 PPTX'}
                  </button>
                )}
                <strong>{activeArtifact.status}</strong>
              </div>
            </div>

            <div className="teacher-resource-marks">
              {activeArtifact.chips.slice(0, 3).map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>

            <div className="teacher-resource-sections">
              {detailSections.map((section) => (
                <section key={section.heading}>
                  <span>{section.heading}</span>
                  <strong>{compactText(summarizeSection(section.body, 1), 38)}</strong>
                </section>
              ))}
            </div>
          </section>
        </div>
      </article>
    </section>
  );
}

function buildCourseMilestones(
  course: string,
  semester: NonNullable<TeacherArtifact['presentation']>['semesterPlan'][number],
  student: Student,
  artifact: TeacherArtifact,
  industryReport: TeacherIndustryCourseReport | null,
) {
  const normalizedCourse = course || semester.courses[0] || '专业课程';
  const anchor = student.knowledgeName || artifact.label;
  const hours = industryReport?.hours ?? inferCourseHours(normalizedCourse);
  const lessons = industryReport?.lessons ?? Math.round(hours / 2);

  return [
    { label: '学时课时', value: `${hours} 学时 / ${lessons} 课时` },
    { label: '课程要求', value: compactText(industryReport?.requirements[0] ?? `${normalizedCourse} · ${semester.theme}`, 28) },
    { label: '学生状态', value: compactText(industryReport?.student_outcomes[0] ?? `${anchor} / ${artifact.outline[0] ?? '核心概念'}`, 28) },
    { label: '行业对接', value: compactText((industryReport?.roles ?? []).slice(0, 2).join(' / ') || semester.project, 28) },
    { label: '前沿发展', value: compactText(industryReport?.frontier_signals[0] ?? artifact.chips[0] ?? '持续跟踪', 28) },
  ];
}

function IndustryAlignmentPanel({
  selectedCourse,
  report,
  summary,
}: {
  selectedCourse: string;
  report: TeacherIndustryCourseReport | null;
  summary: TeacherIndustrySummary | null;
}) {
  const sourceLabel = summary?.source.exists
    ? summary.source.label
    : '行业数据 · 等待接入';
  const keywords = report?.top_keywords.length ? report.top_keywords.slice(0, 6) : ['Java', 'SQL', '接口', '文档'];
  const requirements = report?.requirements ?? ['明确课程要求', '沉淀可验证证据'];
  const outcomes = report?.student_outcomes ?? ['形成课程作品', '完成课堂复盘'];
  const frontiers = report?.frontier_signals ?? ['跟踪 AI 编程、云服务与安全合规'];

  return (
    <section className="teacher-industry-bridge" aria-label="课程行业对齐">
      <header>
        <div>
          <span>行业数据</span>
          <strong>{selectedCourse || report?.course || '课程'} · 岗位对齐</strong>
        </div>
        <em>{sourceLabel}</em>
      </header>

      <div className="teacher-industry-stats">
        <div>
          <span>学时</span>
          <strong>{report ? `${report.hours}/${report.lessons}` : '--'}</strong>
        </div>
        <div>
          <span>岗位样本</span>
          <strong>{report?.job_sample_count ?? '--'}</strong>
        </div>
        <div>
          <span>行业</span>
          <strong>{report?.industries.slice(0, 2).join(' / ') || '待匹配'}</strong>
        </div>
        <div>
          <span>薪资</span>
          <strong>{report?.salary.label ?? '样本不足'}</strong>
        </div>
      </div>

      <div className="teacher-industry-grid">
        <section>
          <span>课程要求</span>
          <strong>{requirements.slice(0, 2).join(' / ')}</strong>
        </section>
        <section>
          <span>学生应达到</span>
          <strong>{outcomes.slice(0, 2).join(' / ')}</strong>
        </section>
        <section>
          <span>岗位关键词</span>
          <div className="teacher-industry-keywords">
            {keywords.map((keyword) => <i key={keyword}>{keyword}</i>)}
          </div>
        </section>
        <section>
          <span>前沿发展</span>
          <strong>{frontiers.slice(0, 2).join(' / ')}</strong>
        </section>
      </div>
    </section>
  );
}

function pickIndustryCourseReport(
  summary: TeacherIndustrySummary | null,
  course: string,
): TeacherIndustryCourseReport | null {
  if (!summary) return null;
  const normalized = normalizeCourseName(course);
  return summary.course_reports.find((item) => normalizeCourseName(item.course) === normalized)
    ?? summary.course_reports.find((item) => normalized.includes(normalizeCourseName(item.course)) || normalizeCourseName(item.course).includes(normalized))
    ?? null;
}

function normalizeCourseName(value: string): string {
  return value.replace(/[·\s]/g, '').replace(/入门|基础/g, '').toLowerCase();
}

function inferCourseHours(course: string): number {
  if (/数据结构|程序设计|面向对象/.test(course)) return 64;
  if (/组成|操作系统|数据库/.test(course)) return 56;
  if (/网络|算法|离散|软件工程/.test(course)) return 48;
  return 40;
}

function InterventionDesk({
  students,
  activeStudent,
  onChooseStudent,
}: {
  students: Student[];
  activeStudent: Student;
  onChooseStudent: (student: Student) => void;
}) {
  return (
    <section className="teacher-console-grid teacher-console-grid--split">
      <div className="teacher-console-card">
        <PanelHead title="干预队列" />
        <div className="teacher-intervention-table">
          {students.map((student) => (
            <button
              key={student.id}
              type="button"
              className={student.id === activeStudent.id ? 'is-active' : ''}
              onClick={() => onChooseStudent(student)}
            >
              <strong>{student.id}</strong>
              <span>{compactText(student.focus, 18)}</span>
              <em>{student.action}</em>
            </button>
          ))}
        </div>
      </div>
      <div className="teacher-console-card teacher-intervention-focus">
        <PanelHead title="当前对象" />
        <strong>{activeStudent.id}</strong>
        <span>{activeStudent.mastery}%</span>
        <p>{compactText(activeStudent.evidence, 46)}</p>
      </div>
    </section>
  );
}

function AgentFlow({ runState, taskId }: { runState: RunState; taskId: string | null }) {
  const status = taskId ? runState : 'idle';

  return (
    <section className="teacher-agent-flow" aria-label="老师端多 Agent">
      <div>
        <span>Multi-Agent</span>
        <strong>{taskId ?? status}</strong>
      </div>
      <ol>
        {AGENTS.map(([name, label]) => (
          <li key={name} className={name === 'PlannerAgent' ? 'is-main' : ''}>
            <span>{label}</span>
            <strong>{name}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PanelHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="teacher-panel-head">
      <h2>{title}</h2>
      {aside && <div>{aside}</div>}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="teacher-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="teacher-metric-cell">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone?: 'active' | 'danger' }) {
  return (
    <div className={tone ? `teacher-status-pill is-${tone}` : 'teacher-status-pill'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function asGenerateResults(value: unknown): GenerateResults | null {
  if (value && typeof value === 'object') return value as GenerateResults;
  return null;
}

function pickLatestTeacherPackage(
  packages: TeacherTeachingPackage[] | undefined,
  studentId?: string,
  knowledgeId?: string,
): TeacherTeachingPackage | null {
  const candidates = (packages ?? []).filter((item) => item.status === 'ready' && item.results);
  if (!candidates.length) return null;
  return (
    candidates.find((item) => studentId && item.target_student_id === studentId) ??
    candidates.find((item) => knowledgeId && item.target_knowledge_id === knowledgeId) ??
    candidates[0]
  );
}

function normalizeReviewItems(items: ReviewItem[] | undefined): ReviewItem[] {
  return (items ?? []).map((item) => ({
    ...item,
    student: item.student ?? null,
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

function summarizeSection(text: string, maxLines: number): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join(' / ');
}

function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}
