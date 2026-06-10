export type EduResourceMode = 'student' | 'teacher';

export interface EduResourceKnowledgeTarget {
  id: string;
  name: string;
  description?: string;
}

export interface EduResourceContext {
  mode: EduResourceMode;
  studentId?: string;
  teacherId?: string;
  classId?: string;
  resourcePackageId: string;
  profileSnapshotId?: string;
  profileSnapshot?: Record<string, unknown>;
  classProfileSnapshot?: Record<string, unknown>;
  targetKnowledge: EduResourceKnowledgeTarget;
  learningGoal?: string;
  teachingGoal?: string;
  resourcePreferences?: string[];
  difficulty?: number;
}
