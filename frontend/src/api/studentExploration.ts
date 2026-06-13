import type { ExplorationPlan, ExplorationRequest } from '../types/exploration';

export interface StudentExplorationDirection {
  id: string;
  session_id: string;
  title: string;
  reason: string;
  ability_requirements: string[];
  knowledge_path: string[];
  gap_analysis: string[];
  resource_entry_knowledge: Array<Record<string, unknown>>;
  created_at: string;
}

export interface StudentExplorationSession {
  session_id: string;
  student_id: string;
  major: string;
  grade: string;
  foundation_level: string;
  interests: string[];
  learning_goal: string;
  weekly_hours: number;
  summary: string;
  recommended_directions: StudentExplorationDirection[];
  created_profile_id: string;
  created_path_id: string;
  created_at: string;
}

export interface StudentExplorationSessionResponse {
  session: StudentExplorationSession;
  plan: ExplorationPlan;
}

export async function createStudentExplorationSession(
  studentId: string,
  payload: ExplorationRequest,
): Promise<StudentExplorationSessionResponse> {
  const res = await fetch(`/api/students/${encodeURIComponent(studentId)}/exploration-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, student_id: studentId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()) as StudentExplorationSessionResponse;
}
