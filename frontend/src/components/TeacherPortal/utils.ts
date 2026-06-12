import type { GenerateResults } from '../../types/resources';
import type {
  ReviewItem,
  Student,
  TeacherStudentSnapshot,
  TeacherTeachingPackage,
} from './model';

export function asGenerateResults(value: unknown): GenerateResults | null {
  if (value && typeof value === 'object') return value as GenerateResults;
  return null;
}

export function pickLatestTeacherPackage(
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

export function normalizeReviewItems(items: ReviewItem[] | undefined): ReviewItem[] {
  return (items ?? []).map((item) => ({
    ...item,
    student: item.student ?? null,
  }));
}

export function normalizeStudents(items: TeacherStudentSnapshot[] | undefined): Student[] {
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

export function summarizeSection(text: string, maxLines: number): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join(' / ');
}

export function compactText(value: string, limit: number): string {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function filenameFromDisposition(value: string | null): string | null {
  if (!value) return null;
  const utfMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1]);
  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}
