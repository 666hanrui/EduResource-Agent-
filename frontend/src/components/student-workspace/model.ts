export interface GenerateSelectionContext {
  source: 'manual' | 'exploration';
  reason: string;
  suggested_difficulty?: number;
  stage_key?: 'foundation' | 'practice' | 'advancement' | 'evidence';
  stage_title?: string;
  validation_prompt?: string;
  success_criteria?: string;
  recommended_action?: string;
}

export type StudentPage = 'exploration' | 'training-plan' | 'classroom' | 'progress';
export type InteractiveClassroomStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface InteractiveClassroomJob {
  job_id: string;
  student_id: string;
  resource_package_id: string;
  openmaic_job_id: string;
  status: InteractiveClassroomStatus;
  classroom_url: string | null;
  package_url: string;
  message: string;
  created_at: string;
  updated_at: string;
}

export interface StudentDashboard {
  profile: { knowledge_mastery?: Record<string, number>; mistake_points?: string[]; current_progress?: Record<string, unknown> } | null;
  learning_path: { steps?: Array<{ package_id?: string | null; evaluation_id?: string | null; mastery_after?: number; status?: string; updated_reason?: string }> } | null;
  training_plan:
    | {
        plan_id: string;
        title: string;
        summary: string;
        stages: Array<{
          stage_id: string;
          key: 'foundation' | 'practice' | 'advancement';
          title: string;
          horizon: string;
          goal: string;
          summary: string;
          status: 'recommended' | 'in_progress' | 'completed' | 'needs_review';
          focus_knowledge_ids: string[];
          linked_step_ids: string[];
          evidence_targets: string[];
          next_action: string;
          validation_question: {
            question_id: string;
            prompt: string;
            answer_format: 'short_answer' | 'single_choice' | 'artifact' | 'reflection';
            success_criteria: string;
            target_knowledge_id: string;
            target_knowledge_name: string;
            suggested_difficulty: number;
          };
        }>;
      }
    | null;
  recent_packages: Array<{ id: string; title: string; status: string }>;
  recent_evaluations: Array<{ id: string; package_id: string; mastery_delta_json?: Record<string, unknown>; feedback_markdown?: string }>;
  next_suggestions: string[];
}

export interface ClassroomFlowStep {
  id: string;
  title: string;
  owner: string;
  endpoint: string;
  status: 'ready' | 'running' | 'done' | 'error';
  summary: string;
}

export const INTERACTIVE_STATUS_LABELS: Record<InteractiveClassroomStatus, string> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
};

export function buildClassroomFlow({
  knowledgeName,
  interactiveJob,
  hasEvaluation,
}: {
  knowledgeName: string;
  interactiveJob: InteractiveClassroomJob | null;
  hasEvaluation: boolean;
}): ClassroomFlowStep[] {
  const generationStatus =
    interactiveJob?.status === 'failed'
      ? 'error'
      : interactiveJob?.status === 'succeeded'
        ? 'done'
        : interactiveJob
          ? 'running'
          : 'ready';

  const writebackStatus =
    hasEvaluation
      ? 'done'
      : interactiveJob?.status === 'failed'
        ? 'error'
        : interactiveJob?.status === 'succeeded'
          ? 'running'
          : interactiveJob
            ? 'ready'
            : 'ready';

  return [
    {
      id: 'student-select',
      title: `学生选择知识点：${knowledgeName}`,
      owner: 'Student UI',
      endpoint: '#/student',
      status: 'done',
      summary: '专业探索模块把知识点回填到互动课堂生成器，学生不需要重复录入。',
    },
    {
      id: 'fastapi-request',
      title: '学生端提交互动课堂任务',
      owner: 'FastAPI',
      endpoint: 'POST /api/students/{student_id}/interactive-classrooms',
      status: interactiveJob ? 'done' : 'ready',
      summary: '后端创建 ResourcePackage 草稿、学习路径步骤，并准备发送给 OpenMAIC。',
    },
    {
      id: 'openmaic-generate',
      title: 'OpenMAIC 生成课堂',
      owner: 'OpenMAIC',
      endpoint: 'POST /api/generate-classroom',
      status: generationStatus,
      summary: interactiveJob
        ? `${INTERACTIVE_STATUS_LABELS[interactiveJob.status]} · Job ${interactiveJob.openmaic_job_id}`
        : '等待学生端发起课堂生成。',
    },
    {
      id: 'resource-writeback',
      title: '资源包与课堂结构回写',
      owner: 'OpenMAIC -> EduResource',
      endpoint: 'POST /api/integrations/openmaic/resource-package',
      status: writebackStatus,
      summary: interactiveJob
        ? 'OpenMAIC 会把 Stage/Scene、资源项和测验结构导回 EduResource。'
        : '生成成功后才会发生。',
    },
    {
      id: 'attempt-writeback',
      title: '课堂作答与画像更新',
      owner: 'EduResource',
      endpoint: 'POST /api/integrations/openmaic/exercise-attempts',
      status: hasEvaluation ? 'done' : interactiveJob?.status === 'succeeded' ? 'ready' : 'ready',
      summary: hasEvaluation
        ? '最近一次课堂测验已经进入学生画像与学习路径。'
        : '学生完成课堂测验后，这一步会把掌握度和 next focus 写回系统。',
    },
  ];
}
