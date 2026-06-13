import { useEffect, useMemo, useRef, useState } from 'react';
import { CinematicMasthead, useCinematicReveal } from '../ProjectLanding';
import type { GenerateResults } from '../../types/resources';
import '../ProjectLanding/cinematic-resource.css';
import './teacher-mesh.css';
import { TeacherPet, type TeacherPetGenerateDraft } from './TeacherPet';
import {
  AgentFlow,
  GeneratorDesk,
  InterventionDesk,
  OverviewDesk,
  StatusPill,
  TalentSystemDesk,
} from './desks';
import { useTeacherRemoteData } from './hooks';
import { CLASSES, STUDENTS } from './model';
import type {
  ReviewItem,
  RunState,
  Student,
  TabKey,
  TeacherGenerationJob,
} from './model';
import {
  buildTeacherArtifactLibrary,
  buildTeacherReviewItems,
  mergeReviewItems,
  pickLatestTeacherResults,
  TEACHER_DELIVERABLE_TYPES,
  type TeacherArtifactType,
} from './artifacts';
import {
  asGenerateResults,
  filenameFromDisposition,
  normalizeReviewItems,
  pickLatestTeacherPackage,
} from './utils';

const DEFAULT_TEACHER_ID = 'tch_001';
const DEFAULT_CLASS_ID = 'class-se-2301';

type ExportState = 'idle' | 'exporting' | 'done' | 'error';

const NAV_ITEMS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '总览' },
  { key: 'review', label: '体系' },
  { key: 'generator', label: '生成' },
  { key: 'intervention', label: '干预' },
];

type TeacherGenerateOptions = TeacherPetGenerateDraft & {
  targetType?: TeacherArtifactType;
};

export function TeacherPortal() {
  const [active, setActive] = useState<TabKey>('overview');
  const [teacherId] = useState(DEFAULT_TEACHER_ID);
  const [classId, setClassId] = useState(DEFAULT_CLASS_ID);
  const [studentId, setStudentId] = useState('stu_001');
  const [knowledgeId, setKnowledgeId] = useState('linked-list-basics');
  const [knowledgeName, setKnowledgeName] = useState('链表');
  const [goal, setGoal] = useState('生成低负担补救包');
  const [teachingPackageId, setTeachingPackageId] = useState<string | null>(null);
  const [teachingPackageClassId, setTeachingPackageClassId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>('idle');
  const [pptExportState, setPptExportState] = useState<ExportState>('idle');
  const [lessonMarkdownExportState, setLessonMarkdownExportState] = useState<ExportState>('idle');
  const [results, setResults] = useState<GenerateResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [selectedReviewType, setSelectedReviewType] = useState<TeacherArtifactType>('TalentPlan');
  const pollRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  useCinematicReveal();
  const {
    dashboard,
    dashboardStudents,
    industrySummary,
    error: remoteDataError,
  } = useTeacherRemoteData({ teacherId, classId });

  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    if (remoteDataError) setError(remoteDataError);
  }, [remoteDataError]);

  useEffect(() => {
    if (!dashboard) return;

    setReviewItems(normalizeReviewItems(dashboard.review_items));
    if (dashboard.active_class.class_id !== classId) {
      setClassId(dashboard.active_class.class_id);
      return;
    }

    if (dashboardStudents.length && !dashboardStudents.some((student) => student.id === studentId)) {
      const firstStudent = dashboardStudents[0];
      setStudentId(firstStudent.id);
      setKnowledgeId(firstStudent.knowledgeId);
      setKnowledgeName(firstStudent.knowledgeName);
      setGoal(`${firstStudent.id} · ${firstStudent.focus} 补救包`);
      setResults(null);
      setTeachingPackageId(null);
      setTeachingPackageClassId(null);
      setPptExportState('idle');
      setLessonMarkdownExportState('idle');
    }
  }, [classId, dashboard, dashboardStudents, studentId]);

  useEffect(() => () => stopPolling(), []);

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
    setPptExportState('idle');
    setLessonMarkdownExportState('idle');
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
    setLessonMarkdownExportState('idle');
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
    setLessonMarkdownExportState('idle');
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

  const downloadPackageFile = async (url: string, fallbackFilename: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filenameFromDisposition(response.headers.get('Content-Disposition')) ?? fallbackFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const exportPptx = async () => {
    if (!activePackageId) return;
    setPptExportState('exporting');
    setError(null);
    try {
      await downloadPackageFile(
        `/api/teachers/${teacherId}/classes/${activePackageClassId}/teaching-packages/${activePackageId}/pptx`,
        `${activePackageId}.pptx`,
      );
      setPptExportState('done');
    } catch (err) {
      setPptExportState('error');
      const detail = err instanceof Error ? err.message : String(err);
      setError(`${detail}。PPTX 环境不可用时，可改用 Markdown 教案导出。`);
    }
  };

  const exportLessonMarkdown = async () => {
    if (!activePackageId) return;
    setLessonMarkdownExportState('exporting');
    setError(null);
    try {
      await downloadPackageFile(
        `/api/teachers/${teacherId}/classes/${activePackageClassId}/teaching-packages/${activePackageId}/lesson-plan.md`,
        `${activePackageId}-lesson-plan.md`,
      );
      setLessonMarkdownExportState('done');
    } catch (err) {
      setLessonMarkdownExportState('error');
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
                  lessonMarkdownExportState={lessonMarkdownExportState}
                  onSelectedType={setSelectedReviewType}
                  onExportPptx={exportPptx}
                  onExportLessonMarkdown={exportLessonMarkdown}
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
