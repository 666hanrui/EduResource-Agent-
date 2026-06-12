import type { ReviewItem } from './model';
import type { TeacherArtifact, TeacherArtifactLibrary, TeacherArtifactType } from './artifact-types';

const REVIEW_TYPE_ORDER: TeacherArtifactType[] = [
  'TalentPlan',
  'LessonPlan',
  'SlideDeck',
  'Syllabus',
  'KeyFocus',
  'Document',
  'Exercise',
  'Visual',
  'Code',
  'Video',
  'Reading',
];

export function buildTeacherReviewItems(artifactLibrary: TeacherArtifactLibrary): ReviewItem[] {
  return orderedArtifacts(artifactLibrary).map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    type: artifact.type,
    student: artifact.student,
    status: artifact.status,
    agent: artifact.agent,
    reason: artifact.reason,
    rationale: artifact.rationale,
  }));
}

export function mergeReviewItems(primary: ReviewItem[], derived: ReviewItem[]): ReviewItem[] {
  const merged = new Map<string, ReviewItem>();

  for (const item of primary) merged.set(item.type, item);

  for (const item of derived) {
    const current = merged.get(item.type);
    merged.set(item.type, current ? { ...item, ...current, title: current.title || item.title, reason: current.reason || item.reason } : item);
  }

  return [...merged.values()].sort((left, right) => reviewRank(left.type) - reviewRank(right.type));
}

function orderedArtifacts(library: TeacherArtifactLibrary): TeacherArtifact[] {
  return REVIEW_TYPE_ORDER.flatMap((type) => (library[type] ? [library[type] as TeacherArtifact] : []));
}

function reviewRank(type: string): number {
  const index = REVIEW_TYPE_ORDER.indexOf(type as TeacherArtifactType);
  return index === -1 ? REVIEW_TYPE_ORDER.length + 1 : index;
}
