export type ExplorationLevel = 'beginner' | 'basic' | 'intermediate';
export type ExplorationPhase = 'short_term' | 'mid_term' | 'long_term';
export type CoachTone = 'encourage' | 'diagnose' | 'challenge';

export interface ExplorationRequest {
  student_id: string;
  major: string;
  grade: string;
  education_level: string;
  foundation_level: ExplorationLevel;
  interests: string[];
  weekly_hours: number;
}

export type DimensionProfile = Record<string, string[]>;

export interface DimensionScore {
  key: string;
  title: string;
  group: string;
  score: number;
  evidence: string[];
  next_probe: string;
}

export interface KnowledgeNode {
  id: string;
  title: string;
  category: 'foundation' | 'core' | 'direction' | 'practice';
  difficulty: number;
  why: string;
  prerequisites: string[];
}

export interface ExplorationTask {
  id: string;
  title: string;
  task_type: 'read' | 'quiz' | 'mini_project' | 'reflection';
  related_knowledge_ids: string[];
  expected_minutes: number;
  evidence_to_collect: string;
}

export interface CareerRequirementProfile {
  core_skills: string[];
  typical_tasks: string[];
  dimension_weights: Record<string, number>;
  evidence_suggestions: string[];
}

export interface CareerDirection {
  id: string;
  title: string;
  exploration_domain: string;
  fit_score: number;
  why_explore: string[];
  required_dimensions: string[];
  first_probe_task_id: string;
  related_knowledge_ids: string[];
  requirement_profile: CareerRequirementProfile;
}

export interface LearningPathItem {
  phase: ExplorationPhase;
  label: string;
  horizon: string;
  goal: string;
  focus_knowledge_ids: string[];
  tasks: string[];
  deliverables: string[];
}

export interface RecommendedKnowledge {
  knowledge_id: string;
  knowledge_name: string;
  reason: string;
  suggested_difficulty: number;
}

export interface ExplorationPlan {
  student_id: string;
  major: string;
  summary: string;
  profile: DimensionProfile;
  dimension_scores: DimensionScore[];
  knowledge_map: KnowledgeNode[];
  exploration_tasks: ExplorationTask[];
  career_directions: CareerDirection[];
  learning_path: LearningPathItem[];
  recommended_knowledge: RecommendedKnowledge[];
}

export interface FavoriteDirection {
  favorite_id: string;
  student_id: string;
  direction: CareerDirection;
  plan_summary: string;
  created_at: string;
}

export interface WorkspaceTask {
  id: string;
  title: string;
  phase: ExplorationPhase;
  task_type: string;
  status: 'pending' | 'done';
  expected_minutes: number;
  evidence_to_collect: string;
  note: string;
  completed_at?: string | null;
}

export interface WorkspacePhase {
  phase: ExplorationPhase;
  label: string;
  horizon: string;
  goal: string;
  progress_percent: number;
  tasks: WorkspaceTask[];
  deliverables: string[];
}

export interface WorkspaceReview {
  review_id: string;
  review_type: 'weekly' | 'monthly';
  phase: ExplorationPhase;
  summary: string;
  next_actions: string[];
  created_at: string;
}

export interface WorkspaceResource {
  resource_id: string;
  knowledge_id: string;
  title: string;
  resource_type: 'search' | 'article' | 'video' | 'course';
  source_key: string;
  source_name: string;
  logo_hint: string;
  quality_score: number;
  url: string;
  reason: string;
  status: 'recommended' | 'opened' | 'completed';
  opened_at?: string | null;
  completed_at?: string | null;
}

export interface ExplorationWorkspace {
  workspace_id: string;
  favorite: FavoriteDirection;
  profile: DimensionProfile;
  dimension_scores: DimensionScore[];
  profile_versions: ProfileVersion[];
  resources: WorkspaceResource[];
  phases: WorkspacePhase[];
  reviews: WorkspaceReview[];
  created_at: string;
  updated_at: string;
}

export interface ProfileVersion {
  version_id: string;
  changed_dimension: string;
  previous_values: string[];
  next_values: string[];
  note: string;
  created_at: string;
}

export interface GrowthReport {
  workspace_id: string;
  title: string;
  markdown: string;
  is_customized: boolean;
  updated_at?: string | null;
  generated_at: string;
}

export interface CoachSuggestion {
  title: string;
  reason: string;
  action: string;
  evidence_to_collect: string;
  related_ids: string[];
}

export interface CoachResponse {
  workspace_id: string;
  direction_title: string;
  tone: CoachTone;
  summary: string;
  suggestions: CoachSuggestion[];
  follow_up_questions: string[];
  generated_at: string;
}
