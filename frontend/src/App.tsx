import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MajorExplorationPanel } from './components/MajorExplorationPanel';
import { InteractiveClassroomStudio } from './components/student-workspace/InteractiveClassroomStudio';
import { ProgressOverview } from './components/student-workspace/ProgressOverview';
import { StudentContextRail } from './components/student-workspace/StudentContextRail';
import { TrainingPlanBoard } from './components/student-workspace/TrainingPlanBoard';
import { TutorFloatingBall, type StudentPetActionDraft } from './components/TutorFloatingBall';
import type { RecommendedKnowledge } from './types/exploration';
import type { GenerateResults } from './types/resources';
import { buildStudentLearningSystem } from './components/student-workspace/model';
import type {
  GenerateSelectionContext,
  InteractiveClassroomJob,
  StudentDashboard,
  StudentPage,
  TrainingStageKey,
} from './components/student-workspace/model';
import './components/student-workspace/student-workspace.css';

interface GenerateResponse {
  task_id: string;
}

type StudentActionOverrides = StudentPetActionDraft & {
  selectionContext?: GenerateSelectionContext | null;
};

const DEFAULT_STUDENT_HASH = '#/student/exploration';

export function App() {
  const [studentHash, setStudentHash] = useState(() => window.location.hash || DEFAULT_STUDENT_HASH);
  const [knowledgeName, setKnowledgeName] = useState('链表');
  const [knowledgeId, setKnowledgeId] = useState('linked-list-basics');
  const [studentId, setStudentId] = useState('stu_001');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [results, setResults] = useState<GenerateResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectionContext, setSelectionContext] = useState<GenerateSelectionContext | null>(null);
  const [interactiveJob, setInteractiveJob] = useState<InteractiveClassroomJob | null>(null);
  const [studentDashboard, setStudentDashboard] = useState<StudentDashboard | null>(null);
  const [explorationBuildSignal, setExplorationBuildSignal] = useState(0);
  const [petCompletionSignal, setPetCompletionSignal] = useState(0);
  const [petCompletionMessage, setPetCompletionMessage] = useState('');

  const pollHandle = useRef<number | null>(null);
  const classroomPollHandle = useRef<number | null>(null);

  useEffect(() => {
    const syncHash = () => setStudentHash(window.location.hash || DEFAULT_STUDENT_HASH);
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => () => {
    if (pollHandle.current !== null) window.clearInterval(pollHandle.current);
    if (classroomPollHandle.current !== null) window.clearInterval(classroomPollHandle.current);
  }, []);

  useEffect(() => {
    void refreshStudentDashboard(studentId);
  }, [studentId]);

  const activePage = useMemo<StudentPage>(() => parseStudentPage(studentHash), [studentHash]);
  const activeTrainingStage = useMemo<TrainingStageKey | null>(() => parseTrainingStage(studentHash), [studentHash]);

  const refreshStudentDashboard = async (id: string) => {
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(id)}/dashboard`);
      if (!res.ok) return;
      setStudentDashboard((await res.json()) as StudentDashboard);
    } catch {
      // Dashboard adds context, but should never block exploration or generation.
    }
  };

  const navigateTo = (page: StudentPage, options?: { stage?: TrainingStageKey | null }) => {
    const suffix = page === 'training-plan' && options?.stage ? `/${options.stage}` : '';
    const nextHash = `#/student/${page}${suffix}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      setStudentHash(nextHash);
    }
  };

  const handleStart = async (overrides?: {
    studentId?: string;
    knowledgeId?: string;
    knowledgeName?: string;
    selectionContext?: GenerateSelectionContext | null;
  }): Promise<boolean> => {
    const nextStudentId = overrides?.studentId ?? studentId;
    const selectedKnowledgeId = overrides?.knowledgeId ?? knowledgeId;
    const selectedKnowledgeName = overrides?.knowledgeName ?? knowledgeName;
    const activeSelectionContext = overrides?.selectionContext ?? selectionContext;
    const difficulty = activeSelectionContext?.suggested_difficulty ?? 3;
    const learningGoal = activeSelectionContext?.reason
      ? `围绕「${selectedKnowledgeName}」完成互动课堂：${activeSelectionContext.reason}`
      : `理解并应用「${selectedKnowledgeName}」，完成课堂互动和测验反馈。`;

    setError(null);
    setResults(null);
    setTaskId(null);
    setInteractiveJob(null);
    if (nextStudentId !== studentId) setStudentId(nextStudentId);
    if (selectedKnowledgeId !== knowledgeId) setKnowledgeId(selectedKnowledgeId);
    if (selectedKnowledgeName !== knowledgeName) setKnowledgeName(selectedKnowledgeName);
    if (activeSelectionContext !== selectionContext) setSelectionContext(activeSelectionContext ?? null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(nextStudentId)}/interactive-classrooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: nextStudentId,
          target_knowledge_id: selectedKnowledgeId,
          target_knowledge_name: selectedKnowledgeName,
          learning_goal: learningGoal,
          selection_context: activeSelectionContext ?? {},
          difficulty,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = (await res.json()) as InteractiveClassroomJob;
      setInteractiveJob(data);
      setGenerating(data.status !== 'succeeded' && data.status !== 'failed');
      navigateTo('classroom');
      startClassroomPolling(nextStudentId, data.job_id);
      void refreshStudentDashboard(nextStudentId);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenerating(false);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleLightweightGenerate = async (overrides?: StudentActionOverrides): Promise<boolean> => {
    const nextStudentId = overrides?.studentId ?? studentId;
    const selectedKnowledgeId = overrides?.knowledgeId ?? knowledgeId;
    const selectedKnowledgeName = overrides?.knowledgeName ?? knowledgeName;
    const activeSelectionContext = overrides?.selectionContext ?? selectionContext;
    setError(null);
    setResults(null);
    if (nextStudentId !== studentId) setStudentId(nextStudentId);
    if (selectedKnowledgeId !== knowledgeId) setKnowledgeId(selectedKnowledgeId);
    if (selectedKnowledgeName !== knowledgeName) setKnowledgeName(selectedKnowledgeName);
    if (activeSelectionContext !== selectionContext) setSelectionContext(activeSelectionContext ?? null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: nextStudentId,
          knowledge_id: selectedKnowledgeId,
          knowledge_name: selectedKnowledgeName,
          conversation: [],
          selection_context: activeSelectionContext,
          exercise_count: 5,
          languages: ['python', 'java'],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const data = (await res.json()) as GenerateResponse;
      setTaskId(data.task_id);
      setGenerating(true);
      navigateTo('classroom');
      startLegacyPolling(data.task_id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenerating(false);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUseKnowledge = (item: RecommendedKnowledge) => {
    setSelectionContext({
      source: 'exploration',
      reason: item.reason,
      suggested_difficulty: item.suggested_difficulty,
      stage_key: item.stage_key,
      stage_title: item.stage_title,
      validation_prompt: item.validation_prompt,
      success_criteria: item.success_criteria,
      recommended_action: item.recommended_action,
    });
    setKnowledgeId(item.knowledge_id);
    setKnowledgeName(item.knowledge_name);
    navigateTo('training-plan', { stage: item.stage_key === 'evidence' ? 'practice' : item.stage_key });
  };

  const handleOpenTrainingStage = (payload: {
    knowledgeId: string;
    knowledgeName: string;
    selectionContext: GenerateSelectionContext;
  }) => {
    setKnowledgeId(payload.knowledgeId);
    setKnowledgeName(payload.knowledgeName);
    setSelectionContext(payload.selectionContext);
    navigateTo('classroom');
  };

  const handleBuildExplorationPlan = async () => {
    navigateTo('exploration');
    setExplorationBuildSignal((value) => value + 1);
  };

  const prepareStudentAction = (draft: StudentPetActionDraft = {}): StudentActionOverrides => {
    const nextStudentId = draft.studentId?.trim() || studentId;
    const nextKnowledgeName = draft.knowledgeName?.trim() || knowledgeName;
    const nextKnowledgeId = draft.knowledgeId?.trim() || (draft.knowledgeName ? buildKnowledgeId(draft.knowledgeName) : knowledgeId);
    const needsManualContext = Boolean(draft.knowledgeName || draft.knowledgeId || draft.stage);
    const nextSelectionContext = needsManualContext
      ? buildManualSelectionContext(nextKnowledgeId, nextKnowledgeName, draft.stage, selectionContext)
      : selectionContext;

    if (nextStudentId !== studentId) setStudentId(nextStudentId);
    if (nextKnowledgeId !== knowledgeId) setKnowledgeId(nextKnowledgeId);
    if (nextKnowledgeName !== knowledgeName) setKnowledgeName(nextKnowledgeName);
    if (nextSelectionContext !== selectionContext) setSelectionContext(nextSelectionContext);

    return {
      studentId: nextStudentId,
      knowledgeId: nextKnowledgeId,
      knowledgeName: nextKnowledgeName,
      stage: draft.stage,
      selectionContext: nextSelectionContext,
    };
  };

  const startClassroomPolling = (ownerStudentId: string, jobId: string) => {
    if (classroomPollHandle.current !== null) window.clearInterval(classroomPollHandle.current);
    classroomPollHandle.current = window.setInterval(async () => {
      try {
        const r = await fetch(
          `/api/students/${encodeURIComponent(ownerStudentId)}/interactive-classrooms/${encodeURIComponent(jobId)}`,
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as InteractiveClassroomJob;
        setInteractiveJob(data);
        if (data.status === 'succeeded' || data.status === 'failed') {
          setGenerating(false);
          void refreshStudentDashboard(ownerStudentId);
          if (data.status === 'succeeded') {
            setPetCompletionMessage('课堂验证已完成。');
            setPetCompletionSignal((value) => value + 1);
            navigateTo('progress');
          } else {
            setPetCompletionMessage('课堂生成失败。');
            setPetCompletionSignal((value) => value + 1);
          }
          if (classroomPollHandle.current !== null) {
            window.clearInterval(classroomPollHandle.current);
            classroomPollHandle.current = null;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPetCompletionMessage('课堂生成失败。');
        setPetCompletionSignal((value) => value + 1);
        if (classroomPollHandle.current !== null) {
          window.clearInterval(classroomPollHandle.current);
          classroomPollHandle.current = null;
        }
        setGenerating(false);
      }
    }, 1500);
  };

  const startLegacyPolling = (id: string) => {
    if (pollHandle.current !== null) window.clearInterval(pollHandle.current);
    pollHandle.current = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/tasks/${id}/results`);
        if (r.status === 404) return;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as GenerateResults;
        setResults(data);
        setGenerating(false);
        setPetCompletionMessage('轻量资源已完成。');
        setPetCompletionSignal((value) => value + 1);
        if (pollHandle.current !== null) {
          window.clearInterval(pollHandle.current);
          pollHandle.current = null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPetCompletionMessage('轻量资源失败。');
        setPetCompletionSignal((value) => value + 1);
        if (pollHandle.current !== null) {
          window.clearInterval(pollHandle.current);
          pollHandle.current = null;
        }
        setGenerating(false);
      }
    }, 1500);
  };

  const relatedEvaluation = interactiveJob
    ? studentDashboard?.recent_evaluations.find((item) => item.package_id === interactiveJob.resource_package_id)
    : studentDashboard?.recent_evaluations[0];
  const relatedPathStep = interactiveJob
    ? studentDashboard?.learning_path?.steps?.find((step) => step.package_id === interactiveJob.resource_package_id)
    : studentDashboard?.learning_path?.steps?.[0];
  const masteryDelta = relatedEvaluation?.mastery_delta_json;
  const rawEstimatedMastery = masteryDelta?.estimated_mastery;
  const estimatedMastery =
    typeof rawEstimatedMastery === 'number'
      ? Math.round(rawEstimatedMastery * 100)
      : relatedPathStep?.mastery_after;

  const heroCopy = useMemo(() => heroText(activePage), [activePage]);
  const learningSystem = useMemo(
    () =>
      buildStudentLearningSystem({
        dashboard: studentDashboard,
        knowledgeId,
        knowledgeName,
        selectionContext,
        interactiveJob,
        estimatedMastery,
        activePage,
        activeTrainingStage,
      }),
    [
      activePage,
      activeTrainingStage,
      estimatedMastery,
      interactiveJob,
      knowledgeId,
      knowledgeName,
      selectionContext,
      studentDashboard,
    ],
  );

  return (
    <div className="student-shell">
      <header className="student-system-hero">
        <div className="student-system-hero__copy">
          <span className="student-system-eyebrow">Personalized Learning System</span>
          <h1>学生个性化培养方案</h1>
          <p>{heroCopy.description}</p>
          <nav className="student-global-entry" aria-label="全局入口">
            <a href="/teacher" data-app-route>老师端</a>
            <a href="/landing" data-app-route>主页</a>
            <a href="/register" data-app-route>身份入口</a>
          </nav>
        </div>
        <div className="student-system-focus-card">
          <small>当前焦点</small>
          <strong>{learningSystem.focus.knowledgeName}</strong>
          <span>{learningSystem.focus.stageTitle}</span>
          <div
            className="student-score-ring"
            style={{ '--score': `${learningSystem.focus.score}%` } as CSSProperties}
            aria-label={`当前焦点准备度 ${learningSystem.focus.score}%`}
          >
            {learningSystem.focus.score}
          </div>
        </div>
      </header>

      <section className="student-lifecycle-rail" aria-label="学生学习生命周期">
        {learningSystem.stages.map((stage, index) => (
          <button
            key={stage.key}
            type="button"
            className={
              stage.key === learningSystem.currentStage.key
                ? `student-lifecycle-node student-lifecycle-node--${stage.status} student-lifecycle-node--active`
                : `student-lifecycle-node student-lifecycle-node--${stage.status}`
            }
            onClick={() => navigateTo(stage.route, { stage: stage.routeStage })}
          >
            <span className="student-lifecycle-node__index">{index + 1}</span>
            <span className="student-lifecycle-node__body">
              <strong>{stage.label}</strong>
              <small>{stage.subtitle}</small>
            </span>
            <span
              className="student-lifecycle-node__score"
              style={{ '--score': `${stage.score}%` } as CSSProperties}
            >
              {stage.score}
            </span>
          </button>
        ))}
      </section>

      <div className="student-system-layout">
        <main className="student-main-stage">
          <section className="student-main-console">
            <div>
              <small>{heroCopy.kicker}</small>
              <h2>{heroCopy.title}</h2>
              <p>{heroCopy.subline}</p>
            </div>
            <button
              type="button"
              className="student-primary-action"
              onClick={() => navigateTo(learningSystem.primaryAction.route, { stage: learningSystem.primaryAction.routeStage })}
            >
              <span>{learningSystem.primaryAction.label}</span>
              <small>{learningSystem.primaryAction.detail}</small>
            </button>
          </section>

          <section className="student-main-tabs" aria-label="学生端模块">
            <div className="student-main-tabs__actions">
              {[
                ['exploration', '画像与广度'],
                ['training-plan', '培养方案'],
                ['classroom', '课堂验证'],
                ['progress', '回写证据'],
              ].map(([page, label]) => (
                <button
                  key={page}
                  type="button"
                  className={activePage === page ? 'student-main-tab student-main-tab--active' : 'student-main-tab'}
                  onClick={() =>
                    navigateTo(page as StudentPage, {
                      stage: page === 'training-plan' ? (activeTrainingStage ?? normalizeTrainingStageKey(selectionContext?.stage_key) ?? null) : null,
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <div className="student-main-body">
            {error && <div className="freddie-error-card">生成链路出错：{error}</div>}

            {activePage === 'exploration' && (
              <MajorExplorationPanel
                studentId={studentId}
                buildSignal={explorationBuildSignal}
                onUseKnowledge={handleUseKnowledge}
              />
            )}

            {activePage === 'training-plan' && (
              <TrainingPlanBoard
                studentDashboard={studentDashboard}
                knowledgeId={knowledgeId}
                knowledgeName={knowledgeName}
                selectionContext={selectionContext}
                activeStageKey={activeTrainingStage}
                learningSystem={learningSystem}
                onOpenClassroom={handleOpenTrainingStage}
                onOpenStage={(stage) => navigateTo('training-plan', { stage })}
              />
            )}

            {activePage === 'classroom' && (
              <InteractiveClassroomStudio
                studentId={studentId}
                knowledgeId={knowledgeId}
                knowledgeName={knowledgeName}
                selectionContext={selectionContext}
                submitting={submitting}
                generating={generating}
                interactiveJob={interactiveJob}
                results={results}
                taskId={taskId}
                estimatedMastery={estimatedMastery}
                evaluationFeedback={relatedEvaluation?.feedback_markdown}
                pathFeedback={relatedPathStep?.updated_reason}
                canOpenProgress={Boolean(relatedEvaluation || relatedPathStep)}
                onKnowledgeId={(value) => {
                  setKnowledgeId(value);
                  setSelectionContext(null);
                }}
                onKnowledgeName={(value) => {
                  setKnowledgeName(value);
                  setSelectionContext(null);
                }}
                onStart={() => void handleStart()}
                onLightweightGenerate={() => void handleLightweightGenerate()}
                onOpenProgress={() => navigateTo('progress')}
                onOpenTrainingPlan={() =>
                  navigateTo('training-plan', {
                    stage: normalizeTrainingStageKey(selectionContext?.stage_key) ?? activeTrainingStage ?? null,
                  })
                }
              />
            )}

            {activePage === 'progress' && (
              <ProgressOverview
                studentDashboard={studentDashboard}
                interactiveJob={interactiveJob}
                estimatedMastery={estimatedMastery}
                evaluationFeedback={relatedEvaluation?.feedback_markdown}
                pathFeedback={relatedPathStep?.updated_reason}
                onOpenTrainingPlan={(stage) => navigateTo('training-plan', { stage })}
                onOpenClassroom={() => navigateTo('classroom')}
              />
            )}
          </div>
        </main>

        <StudentContextRail
          activePage={activePage}
          studentId={studentId}
          learningSystem={learningSystem}
          onStudentId={setStudentId}
          onNavigate={(page, stage) => navigateTo(page, { stage })}
        />
      </div>

      <TutorFloatingBall
        activePage={activePage}
        studentId={studentId}
        knowledgeId={knowledgeId}
        knowledgeName={knowledgeName}
        learningSystem={learningSystem}
        busy={submitting || generating}
        classroomUrl={interactiveJob?.classroom_url ?? null}
        completionSignal={petCompletionSignal}
        completionMessage={petCompletionMessage}
        onNavigate={(page, stage) => navigateTo(page, { stage })}
        onPrepareFocus={(draft) => {
          const prepared = prepareStudentAction(draft);
          navigateTo('classroom');
          return prepared;
        }}
        onRefreshDashboard={() => refreshStudentDashboard(studentId)}
        onStartClassroom={async (draft) => {
          const prepared = prepareStudentAction(draft);
          const ok = await handleStart(prepared);
          if (!ok) {
            throw new Error('课堂验证失败。');
          }
        }}
        onLightweightGenerate={async (draft) => {
          const prepared = prepareStudentAction(draft);
          const ok = await handleLightweightGenerate(prepared);
          if (!ok) {
            throw new Error('轻量资源失败。');
          }
        }}
        onBuildExplorationPlan={handleBuildExplorationPlan}
        onOpenClassroomUrl={() => {
          if (interactiveJob?.classroom_url) {
            window.open(interactiveJob.classroom_url, '_blank', 'noopener,noreferrer');
            return true;
          }
          return false;
        }}
      />
    </div>
  );
}

function buildManualSelectionContext(
  knowledgeId: string,
  knowledgeName: string,
  stage?: TrainingStageKey | null,
  fallback?: GenerateSelectionContext | null,
): GenerateSelectionContext {
  const stageKey = stage ?? normalizeTrainingStageKey(fallback?.stage_key) ?? 'practice';
  return {
    source: 'manual',
    reason: `${knowledgeName} · ${knowledgeId}`,
    suggested_difficulty: fallback?.suggested_difficulty ?? 3,
    stage_key: stageKey,
    stage_title: stageLabel(stageKey),
    validation_prompt: `围绕「${knowledgeName}」完成一轮课堂验证。`,
    success_criteria: '能完成练习，并把结果回写到画像。',
    recommended_action: '开始课堂验证',
  };
}

function stageLabel(stage: TrainingStageKey): string {
  if (stage === 'foundation') return '基础定标';
  if (stage === 'advancement') return '进阶迁移';
  return '课堂练习';
}

function buildKnowledgeId(value: string): string {
  const asciiSlug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (asciiSlug) return asciiSlug;
  const encoded = Array.from(value.trim())
    .slice(0, 8)
    .map((char) => char.charCodeAt(0).toString(36))
    .join('-');
  return encoded ? `topic-${encoded}` : 'manual-topic';
}

function parseStudentPage(hash: string): StudentPage {
  const route = hash.replace(/^#/, '');
  const path = route.replace(/^\/student\/?/, '');
  if (path.startsWith('training-plan')) return 'training-plan';
  if (path.startsWith('classroom')) return 'classroom';
  if (path.startsWith('progress')) return 'progress';
  return 'exploration';
}

function parseTrainingStage(hash: string): TrainingStageKey | null {
  const route = hash.replace(/^#/, '');
  const path = route.replace(/^\/student\/?/, '');
  const match = path.match(/^training-plan\/(foundation|practice|advancement)/);
  return (match?.[1] as TrainingStageKey | undefined) ?? null;
}

function normalizeTrainingStageKey(value?: GenerateSelectionContext['stage_key'] | null): TrainingStageKey | null {
  if (value === 'foundation' || value === 'practice' || value === 'advancement') return value;
  if (value === 'evidence') return 'practice';
  return null;
}

function heroText(page: StudentPage): { kicker: string; title: string; description: string; subline: string } {
  switch (page) {
    case 'training-plan':
      return {
        kicker: 'Stage Plan',
        title: '阶段化培养方案',
        description: '先用画像定标，再做广度探索，最后把兴趣方向拆成可验证的深度学习阶段。',
        subline: '每个阶段都有明确题目、证据目标和下一步动作。',
      };
    case 'classroom':
      return {
        kicker: 'Validation Classroom',
        title: '互动课堂验证',
        description: '把当前阶段的验证题转成课堂、练习和资源包，让学习结果可以回写到画像。',
        subline: '课堂不是孤立资源，而是培养方案中的一次证据采样。',
      };
    case 'progress':
      return {
        kicker: 'Evidence Writeback',
        title: '进度与证据回写',
        description: '把课堂结果、测验反馈和路径状态回写到学生画像，再反向修正下一阶段。',
        subline: '这里看的是学习体系如何自我更新。',
      };
    default:
      return {
        kicker: 'Profile And Breadth',
        title: '画像与广度探索',
        description: '先理解学生是谁，再横向探索方向和资源，找到真正值得深挖的兴趣点。',
        subline: '从人物画像开始，而不是从资源列表开始。',
      };
  }
}
