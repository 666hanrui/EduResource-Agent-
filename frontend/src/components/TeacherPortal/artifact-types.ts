import type { Rationale } from '../../types/resources';

export const TEACHER_DELIVERABLE_TYPES = ['TalentPlan', 'LessonPlan', 'SlideDeck', 'Syllabus', 'KeyFocus'] as const;

export type TeacherDeliverableType = (typeof TEACHER_DELIVERABLE_TYPES)[number];
export type TeacherArtifactType = TeacherDeliverableType | 'Document' | 'Exercise' | 'Visual' | 'Code' | 'Video' | 'Reading';
export type TeacherArtifactLibrary = Partial<Record<TeacherArtifactType, TeacherArtifact>>;

export interface TeacherArtifactLink {
  title: string;
  url: string;
  meta: string;
}

export interface TeacherArtifactSection {
  heading: string;
  body: string;
}

export interface TalentPlanSemester {
  id: string;
  stage: string;
  label: string;
  theme: string;
  target: string;
  courses: string[];
  engineering: string[];
  frontier: string[];
  project: string;
  assessment: string;
  output: string;
}

export interface TalentPlanLane {
  title: string;
  label: string;
  items: string[];
}

export interface TalentPlanRadarTopic {
  date: string;
  source: string;
  title: string;
  signal: string;
  classroomAction: string;
  projectMapping: string;
}

export interface TalentPlanExitPath {
  title: string;
  fit: string;
  milestones: string[];
  deliverables: string[];
}

export interface TalentPlanBlueprint {
  kind: 'talent-plan';
  direction: string;
  vision: string;
  graduationProfile: string[];
  semesterPlan: TalentPlanSemester[];
  continuousLanes: TalentPlanLane[];
  radar: {
    cadence: string;
    sourceBuckets: string[];
    process: string[];
    topics: TalentPlanRadarTopic[];
  };
  innovation: {
    ladders: string[];
    arenas: string[];
    teacherRole: string[];
  };
  assessment: {
    dimensions: string[];
    checkpoints: string[];
    portfolio: string[];
  };
  exits: TalentPlanExitPath[];
}

export interface TeacherArtifact {
  id: string;
  type: TeacherArtifactType;
  family: 'deliverable' | 'asset';
  title: string;
  label: string;
  summary: string;
  agent: string;
  student: string | null;
  status: string;
  reason: string;
  chips: string[];
  outline: string[];
  sections: TeacherArtifactSection[];
  links: TeacherArtifactLink[];
  markdown: string;
  rationale: Rationale;
  presentation?: TalentPlanBlueprint;
}
