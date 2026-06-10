import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentSystemsShowcase } from './components/AgentSystemsShowcase';
import { MajorExplorationPanel } from './components/MajorExplorationPanel';
import { InteractiveClassroomStudio } from './components/student-workspace/InteractiveClassroomStudio';
import { ProgressOverview } from './components/student-workspace/ProgressOverview';
import { StudentContextRail } from './components/student-workspace/StudentContextRail';
import { TrainingPlanBoard } from './components/student-workspace/TrainingPlanBoard';
import type { RecommendedKnowledge } from './types/exploration';
import type { GenerateResults } from './types/resources';
import type {
  GenerateSelectionContext,
  InteractiveClassroomJob,
  StudentDashboard,
  StudentPage,
} from './components/student-workspace/model';
import './components/student-workspace/student-workspace.css';

interface GenerateResponse {
  task_id: string;
}

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

  const refreshStudentDashboard = async (id: string) => {
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(id)}/dashboard`);
      if (!res.ok) return;
      setStudentDashboard((await res.json()) as StudentDashboard);
    } catch {
      // Dashboard adds context, but should never block exploration or generation.
    }
  };

  const navigateTo = (page: StudentPage) => {
    const nextHash = `#/student/${page}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    } else {
      setStudentHash(nextHash);
    }
  };

  const handleStart = async (overrides?: {
    knowledgeId?: string;
    knowledgeName?: string;
    selectionContext?: GenerateSelectionContext | null;
  }) => {
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
    setSubmitting(true);
    try {
      const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/interactive-classrooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
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
      startClassroomPolling(studentId, data.job_id);
      void refreshStudentDashboard(studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenerating(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLightweightGenerate = async () => {
    setError(null);
    setResults(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          knowledge_id: knowledgeId,
          knowledge_name: knowledgeName,
          conversation: [],
          selection_context: selectionContext,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGenerating(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUseKnowledge = (item: RecommendedKnowledge) => {
    setSelectionContext({
      source: 'exploration',
      reason: item.reason,
      suggested_difficulty: item.suggested_difficulty,
    });
    setKnowledgeId(item.knowledge_id);
    setKnowledgeName(item.knowledge_name);
    navigateTo('training-plan');
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
            navigateTo('progress');
          }
          if (classroomPollHandle.current !== null) {
            window.clearInterval(classroomPollHandle.current);
            classroomPollHandle.current = null;
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
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
        if (pollHandle.current !== null) {
          window.clearInterval(pollHandle.current);
          pollHandle.current = null;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
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
  const summaryText = useMemo(
    () => pageSummary(activePage, knowledgeName, interactiveJob, results),
    [activePage, interactiveJob, knowledgeName, results],
  );
  const agentSubtitle =
    activePage === 'exploration' || activePage === 'training-plan'
      ? '当前：专业探索与培养方案链路。'
      : '当前：互动课堂与回写链路。';
  const activeSuiteId = activePage === 'exploration' || activePage === 'training-plan' ? 'exploration' : 'generation';

  return (
    <div className="student-shell">
      <StudentContextRail
        activePage={activePage}
        studentId={studentId}
        knowledgeId={knowledgeId}
        knowledgeName={knowledgeName}
        selectionContext={selectionContext}
        studentDashboard={studentDashboard}
        interactiveJob={interactiveJob}
        estimatedMastery={estimatedMastery}
        onStudentId={setStudentId}
      />

      <main className="student-main-stage">
        <header className="student-main-hero">
          <div>
            <small>EduResource Student Side</small>
            <h1>{heroCopy.title}</h1>
            <p>{heroCopy.description}</p>
          </div>
          <div className="student-main-hero__meta">
            <small>Current Focus</small>
            <strong>{knowledgeName}</strong>
            <span>{selectionContext?.reason ?? '还没有来自探索模块的推荐，当前可手动输入知识点。'}</span>
          </div>
        </header>

        <section className="student-main-tabs">
          <div className="student-main-tabs__actions">
            {[
              ['exploration', '专业探索'],
              ['training-plan', '培养方案'],
              ['classroom', '互动课堂'],
              ['progress', '进度回写'],
            ].map(([page, label]) => (
              <button
                key={page}
                type="button"
                className={activePage === page ? 'freddie-tab freddie-tab-active student-main-tab' : 'freddie-tab student-main-tab'}
                onClick={() => navigateTo(page as StudentPage)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="student-main-tabs__summary">
            <small>当前页面说明</small>
            <p>{summaryText}</p>
          </div>
        </section>

        <section className="student-agent-band">
          <AgentSystemsShowcase
            eyebrow="Student workflow"
            title="学生主线现在拆成真正的多页面流程。"
            subtitle={agentSubtitle}
            activeSuiteId={activeSuiteId}
            framed
          />
        </section>

        <div className="student-main-body">
          {error && <div className="freddie-error-card">生成链路出错：{error}</div>}

          {activePage === 'exploration' && (
            <MajorExplorationPanel studentId={studentId} onUseKnowledge={handleUseKnowledge} />
          )}

          {activePage === 'training-plan' && (
            <TrainingPlanBoard
              studentDashboard={studentDashboard}
              knowledgeId={knowledgeId}
              knowledgeName={knowledgeName}
              selectionContext={selectionContext}
              onOpenClassroom={handleOpenTrainingStage}
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
              onOpenTrainingPlan={() => navigateTo('training-plan')}
            />
          )}

          {activePage === 'progress' && (
            <ProgressOverview
              studentDashboard={studentDashboard}
              interactiveJob={interactiveJob}
              estimatedMastery={estimatedMastery}
              evaluationFeedback={relatedEvaluation?.feedback_markdown}
              pathFeedback={relatedPathStep?.updated_reason}
              onOpenTrainingPlan={() => navigateTo('training-plan')}
              onOpenClassroom={() => navigateTo('classroom')}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function parseStudentPage(hash: string): StudentPage {
  const route = hash.replace(/^#/, '');
  const path = route.replace(/^\/student\/?/, '');
  if (path.startsWith('training-plan')) return 'training-plan';
  if (path.startsWith('classroom')) return 'classroom';
  if (path.startsWith('progress')) return 'progress';
  return 'exploration';
}

function heroText(page: StudentPage): { title: string; description: string } {
  switch (page) {
    case 'training-plan':
      return {
        title: '把学生的一整个个性化培养方案拆成阶段推进。',
        description: '这一页只做阶段设计、验证题和下一步动作，不再把探索、课堂生成和评估回写全塞进同一屏。',
      };
    case 'classroom':
      return {
        title: '把当前阶段的知识点推进成互动课堂。',
        description: '互动课堂页只保留生成、资源回写和课堂入口，专注把一个阶段真正做完。',
      };
    case 'progress':
      return {
        title: '把阶段验证后的回写结果单独收束成进度页。',
        description: '学生完成课堂测验后，掌握度、next focus、学习路径变化都应该有独立页面承接，而不是埋在生成页里。',
      };
    default:
      return {
        title: '先做专业探索，再把知识点送进培养方案和互动课堂。',
        description: '学生端现在不再依赖一个杂糅大页面，而是拆成探索、培养方案、课堂和回写四个明确页面。',
      };
  }
}

function pageSummary(
  page: StudentPage,
  knowledgeName: string,
  interactiveJob: InteractiveClassroomJob | null,
  results: GenerateResults | null,
): string {
  switch (page) {
    case 'training-plan':
      return '把长期目标拆成三阶段主线，每一阶段都明确一个要做的验证动作。';
    case 'classroom':
      return interactiveJob
        ? `${knowledgeName} 的课堂链路正在运行，当前状态：${interactiveJob.status}。`
        : results
          ? '轻量资源包已经产出，可以继续发起完整互动课堂。'
          : '知识点确定后，这里会展示 FastAPI 与 OpenMAIC 的真实对接链路。';
    case 'progress':
      return '专门查看阶段验证后的画像更新、学习路径调整和下一步系统建议。';
    default:
      return '先把专业、方向和证据结构理顺，再决定当前阶段要验证哪个知识点。';
  }
}
