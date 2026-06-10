import type { Stage } from '@/lib/types/stage';
import type { QuizAnswers } from '@/lib/quiz/persistence';
import { postEduResourceExerciseAttempts } from './client';
import type {
  EduResourceContext,
  EduResourceExerciseAttemptsPayload,
  EduResourceExerciseAttemptsResponse,
} from './types';

const DEFAULT_TIME_SPENT_SEC = 60;
const DEFAULT_BROWSER_PROXY_BASE_URL = '/api/eduresource';
const WRITEBACK_KEY_PREFIX = 'eduResourceQuizAttemptWriteback:';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface BuildEduResourceExerciseAttemptsPayloadInput {
  context: EduResourceContext | null | undefined;
  sourceClassroomId: string | null | undefined;
  quizSceneId: string;
  answers: QuizAnswers;
  defaultTimeSpentSec?: number;
}

export interface SubmitEduResourceQuizAttemptWritebackInput {
  stage: Stage | null | undefined;
  sceneId: string;
  answers: QuizAnswers;
  storage?: StorageLike;
  baseUrl?: string;
  postAttempts?: (
    payload: EduResourceExerciseAttemptsPayload,
    options: { baseUrl: string },
  ) => Promise<EduResourceExerciseAttemptsResponse>;
  onError?: (error: unknown) => void;
}

export type EduResourceQuizAttemptWritebackStatus = 'posted' | 'skipped' | 'failed';

export function buildEduResourceExerciseAttemptsPayload({
  context,
  sourceClassroomId,
  quizSceneId,
  answers,
  defaultTimeSpentSec = DEFAULT_TIME_SPENT_SEC,
}: BuildEduResourceExerciseAttemptsPayloadInput): EduResourceExerciseAttemptsPayload | null {
  if (!context || context.mode !== 'student' || !context.studentId || !sourceClassroomId) {
    return null;
  }

  const mappedAnswers = Object.entries(answers)
    .filter(([, answer]) => hasAnswer(answer))
    .map(([questionId, answer]) => ({
      question_id: questionId,
      user_answer: answer,
      time_spent_sec: defaultTimeSpentSec,
    }));

  if (mappedAnswers.length === 0) return null;

  return {
    resource_package_id: context.resourcePackageId,
    student_id: context.studentId,
    source_classroom_id: sourceClassroomId,
    quiz_scene_id: quizSceneId,
    answers: mappedAnswers,
  };
}

export async function submitEduResourceQuizAttemptWriteback({
  stage,
  sceneId,
  answers,
  storage = browserStorage(),
  baseUrl = DEFAULT_BROWSER_PROXY_BASE_URL,
  postAttempts = postEduResourceExerciseAttempts,
  onError,
}: SubmitEduResourceQuizAttemptWritebackInput): Promise<EduResourceQuizAttemptWritebackStatus> {
  const payload = buildEduResourceExerciseAttemptsPayload({
    context: stage?.eduResourceContext,
    sourceClassroomId: stage?.id,
    quizSceneId: sceneId,
    answers,
  });

  if (!payload) return 'skipped';
  if (!reserveEduResourceAttemptWriteback(payload, storage)) return 'skipped';

  try {
    await postAttempts(payload, { baseUrl });
    return 'posted';
  } catch (error) {
    clearEduResourceAttemptWritebackReservation(payload, storage);
    onError?.(error);
    return 'failed';
  }
}

export function reserveEduResourceAttemptWriteback(
  payload: EduResourceExerciseAttemptsPayload,
  storage = browserStorage(),
): boolean {
  if (!storage) return true;
  const key = writebackReservationKey(payload);
  if (storage.getItem(key)) return false;
  storage.setItem(key, new Date().toISOString());
  return true;
}

export function clearEduResourceAttemptWritebackReservation(
  payload: EduResourceExerciseAttemptsPayload,
  storage = browserStorage(),
): void {
  storage?.removeItem(writebackReservationKey(payload));
}

function writebackReservationKey(payload: EduResourceExerciseAttemptsPayload): string {
  return [
    WRITEBACK_KEY_PREFIX,
    payload.resource_package_id,
    payload.student_id,
    payload.source_classroom_id,
    payload.quiz_scene_id,
  ].join(':');
}

function browserStorage(): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function hasAnswer(answer: string | string[]): boolean {
  if (Array.isArray(answer)) return answer.length > 0;
  return answer.trim().length > 0;
}
