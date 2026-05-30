/**
 * 与后端 schemas/resource.py 对齐的最小子集，供前端 ResultsPanel + RationalePanel 消费。
 * 只放展示真正需要的字段，避免和后端紧耦合。
 */

export interface CitedSource {
  title: string;
  page?: string;
  similarity?: number;
}

export interface Rationale {
  matched_profile: string[];
  addressed_weakness: string[];
  difficulty_adjusted_from: number;
  difficulty_used: number;
  agent_name: string;
  prompt_version: string;
  model_name: string;
  cited_sources: CitedSource[];
}

export interface DocumentSection {
  heading: string;
  body_md: string;
}

export interface DocumentBody {
  title: string;
  sections: DocumentSection[];
  key_diagrams: { type: string; data: unknown }[];
}

export interface DocumentResult {
  document: DocumentBody;
  rationale: Rationale;
}

export interface Question {
  qid: string;
  type: string;
  stem: string;
  options: string[];
  answer: string;
  explanation: string;
  tags: string[];
  difficulty: number;
  expected_time_sec: number;
}

export interface ExerciseResult {
  questions: Question[];
  rationale: Rationale;
}

export interface CodeSample {
  lang: 'python' | 'java';
  filename: string;
  code: string;
  step_comments: { line_range: [number, number]; explanation: string }[];
  complexity: { time: string; space: string };
  trace: { step: number; state: string }[];
}

export interface CodeResult {
  code_samples: CodeSample[];
  rationale: Rationale;
}

export interface AnimationStep {
  action: string;
  target: string;
  narration: string;
  duration_ms: number;
  links_to_doc_section: string;
}

export interface VisualResult {
  mindmap_md: string;
  animation: { scene: string; initial_state: unknown; steps: AnimationStep[] };
  rationale: Rationale;
}

export interface EvaluationResult {
  evaluation_delta: {
    knowledge_id: string;
    observed_correct_rate: number;
    estimated_mastery: number;
    new_weakness: string[];
    resolved_weakness: string[];
    next_difficulty_recommendation: number;
    next_focus: string;
  };
  narrative: string;
  rationale: {
    evidence: { qid: string; verdict: string; weight: number }[];
    agent_name: string;
    prompt_version: string;
  };
}

export interface GenerateResults {
  profile: unknown | null;
  plan: unknown | null;
  document: DocumentResult | null;
  exercise: ExerciseResult | null;
  visual: VisualResult | null;
  code: CodeResult | null;
  evaluation: EvaluationResult | null;
  errors: Record<string, string>;
}
