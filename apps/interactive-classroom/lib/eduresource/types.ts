import type { Scene, Stage } from '@/lib/types/stage';
import type { EduResourceContext } from './context';

export type { EduResourceContext, EduResourceKnowledgeTarget, EduResourceMode } from './context';

export interface EduResourceBuildRequirementInput {
  baseRequirement?: string;
  context: EduResourceContext;
}

export interface EduResourceClassroomMappingInput {
  context: EduResourceContext;
  stage: Stage;
  scenes: Scene[];
}

export interface EduResourceStageImportPayload {
  id: string;
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface EduResourceSceneImportPayload {
  id: string;
  type: 'slide' | 'quiz' | 'interactive' | 'pbl';
  title: string;
  order: number;
  content: Record<string, unknown>;
}

export interface EduResourceClassroomImportPayload {
  source_classroom_id: string;
  resource_package_id: string;
  student_id?: string;
  teacher_id?: string;
  class_id?: string;
  target_knowledge_id: string;
  target_knowledge_name: string;
  profile_snapshot_id?: string;
  difficulty?: number;
  stage: EduResourceStageImportPayload;
  scenes: EduResourceSceneImportPayload[];
  profile_snapshot?: Record<string, unknown>;
  class_profile_snapshot?: Record<string, unknown>;
}

export interface EduResourceImportResponse {
  package: { id: string; [key: string]: unknown };
  exercise_set?: { id: string; [key: string]: unknown } | null;
  imported_scene_count?: number;
  imported_quiz_count?: number;
}

export interface EduResourceQuizAnswerPayload {
  question_id: string;
  user_answer: string | string[];
  time_spent_sec?: number;
}

export interface EduResourceExerciseAttemptsPayload {
  resource_package_id: string;
  student_id: string;
  source_classroom_id: string;
  quiz_scene_id: string;
  answers: EduResourceQuizAnswerPayload[];
}

export interface EduResourceExerciseAttemptsResponse {
  attempts?: Array<{ id: string; [key: string]: unknown }>;
  evaluation?: { id: string; [key: string]: unknown };
}
