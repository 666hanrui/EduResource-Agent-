import type { GenerateResults } from '../../types/resources';
import type { TeacherTeachingPackage } from './model';

export function pickLatestTeacherResults(
  packages: TeacherTeachingPackage[] | undefined,
  studentId?: string,
  knowledgeId?: string,
): GenerateResults | null {
  const candidates = (packages ?? []).filter((item) => isGenerateResults(item.results));
  if (!candidates.length) return null;

  const matched =
    candidates.find((item) => studentId && item.target_student_id === studentId) ??
    candidates.find((item) => knowledgeId && item.target_knowledge_id === knowledgeId) ??
    candidates[0];

  return matched?.results as GenerateResults;
}

function isGenerateResults(value: unknown): value is GenerateResults {
  return Boolean(value && typeof value === 'object');
}
