import { describe, expect, it, vi } from 'vitest';
import {
  buildEduResourceExerciseAttemptsPayload,
  clearEduResourceAttemptWritebackReservation,
  reserveEduResourceAttemptWriteback,
  submitEduResourceQuizAttemptWriteback,
} from '@/lib/eduresource/quiz-attempts';
import type { EduResourceContext } from '@/lib/eduresource/types';
import type { Stage } from '@/lib/types/stage';

const studentContext: EduResourceContext = {
  mode: 'student',
  studentId: 'stu_001',
  resourcePackageId: 'pkg_openmaic_001',
  targetKnowledge: { id: 'graph-shortest-path', name: '最短路径' },
};

function storageStub() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('buildEduResourceExerciseAttemptsPayload', () => {
  it('maps submitted quiz answers into the FastAPI attempt import contract', () => {
    const payload = buildEduResourceExerciseAttemptsPayload({
      context: studentContext,
      sourceClassroomId: 'omc_stage_001',
      quizSceneId: 'scene_quiz_1',
      answers: {
        q1: 'A',
        q2: ['B', 'D'],
      },
    });

    expect(payload).toEqual({
      resource_package_id: 'pkg_openmaic_001',
      student_id: 'stu_001',
      source_classroom_id: 'omc_stage_001',
      quiz_scene_id: 'scene_quiz_1',
      answers: [
        { question_id: 'q1', user_answer: 'A', time_spent_sec: 60 },
        { question_id: 'q2', user_answer: ['B', 'D'], time_spent_sec: 60 },
      ],
    });
  });

  it('does not create attempts for teacher/class contexts without a student id', () => {
    const payload = buildEduResourceExerciseAttemptsPayload({
      context: {
        mode: 'teacher',
        teacherId: 'teacher_001',
        classId: 'class_001',
        resourcePackageId: 'pkg_teacher_001',
        targetKnowledge: { id: 'graph-shortest-path', name: '最短路径' },
      },
      sourceClassroomId: 'omc_stage_001',
      quizSceneId: 'scene_quiz_1',
      answers: { q1: 'A' },
    });

    expect(payload).toBeNull();
  });
});

describe('reserveEduResourceAttemptWriteback', () => {
  it('reserves one writeback per student package classroom scene until cleared', () => {
    const storage = storageStub();
    const payload = buildEduResourceExerciseAttemptsPayload({
      context: studentContext,
      sourceClassroomId: 'omc_stage_001',
      quizSceneId: 'scene_quiz_1',
      answers: { q1: 'A' },
    });

    expect(payload).not.toBeNull();
    expect(reserveEduResourceAttemptWriteback(payload!, storage)).toBe(true);
    expect(reserveEduResourceAttemptWriteback(payload!, storage)).toBe(false);

    clearEduResourceAttemptWritebackReservation(payload!, storage);
    expect(reserveEduResourceAttemptWriteback(payload!, storage)).toBe(true);
  });
});

describe('submitEduResourceQuizAttemptWriteback', () => {
  it('posts student quiz answers through the local EduResource proxy route', async () => {
    const storage = storageStub();
    const postAttempts = vi.fn().mockResolvedValue({ attempts: [{ id: 'attempt_001' }] });
    const stage = {
      id: 'omc_stage_001',
      name: '最短路径互动课堂',
      createdAt: 1,
      updatedAt: 2,
      eduResourceContext: studentContext,
    } satisfies Stage;

    const status = await submitEduResourceQuizAttemptWriteback({
      stage,
      sceneId: 'scene_quiz_1',
      answers: { q1: 'A' },
      storage,
      postAttempts,
    });

    expect(status).toBe('posted');
    expect(postAttempts).toHaveBeenCalledWith(
      {
        resource_package_id: 'pkg_openmaic_001',
        student_id: 'stu_001',
        source_classroom_id: 'omc_stage_001',
        quiz_scene_id: 'scene_quiz_1',
        answers: [{ question_id: 'q1', user_answer: 'A', time_spent_sec: 60 }],
      },
      { baseUrl: '/api/eduresource' },
    );
  });

  it('clears the duplicate-submit reservation when writeback fails', async () => {
    const storage = storageStub();
    const postAttempts = vi.fn().mockRejectedValue(new Error('offline'));
    const stage = {
      id: 'omc_stage_001',
      name: '最短路径互动课堂',
      createdAt: 1,
      updatedAt: 2,
      eduResourceContext: studentContext,
    } satisfies Stage;

    const status = await submitEduResourceQuizAttemptWriteback({
      stage,
      sceneId: 'scene_quiz_1',
      answers: { q1: 'A' },
      storage,
      postAttempts,
    });

    expect(status).toBe('failed');
    expect(
      await submitEduResourceQuizAttemptWriteback({
        stage,
        sceneId: 'scene_quiz_1',
        answers: { q1: 'A' },
        storage,
        postAttempts: vi.fn().mockResolvedValue({}),
      }),
    ).toBe('posted');
  });
});
