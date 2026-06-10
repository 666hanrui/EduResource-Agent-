import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EduResourceExerciseAttemptsPayload } from '@/lib/eduresource/types';

const mocks = vi.hoisted(() => ({
  postEduResourceExerciseAttempts: vi.fn(),
  readClassroom: vi.fn(),
}));

vi.mock('@/lib/eduresource/client', () => ({
  postEduResourceExerciseAttempts: mocks.postEduResourceExerciseAttempts,
}));

vi.mock('@/lib/server/classroom-storage', () => ({
  readClassroom: mocks.readClassroom,
}));

const payload: EduResourceExerciseAttemptsPayload = {
  resource_package_id: 'pkg_openmaic_001',
  student_id: 'stu_001',
  source_classroom_id: 'omc_stage_001',
  quiz_scene_id: 'scene_quiz_1',
  answers: [{ question_id: 'q1', user_answer: 'A', time_spent_sec: 60 }],
};

describe('POST /api/eduresource/integrations/openmaic/exercise-attempts', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.postEduResourceExerciseAttempts.mockReset();
    mocks.readClassroom.mockReset();
    mocks.readClassroom.mockResolvedValue({
      id: 'omc_stage_001',
      stage: {
        id: 'omc_stage_001',
        name: '最短路径互动课堂',
        createdAt: 1,
        updatedAt: 2,
        eduResourceContext: {
          mode: 'student',
          studentId: 'stu_001',
          resourcePackageId: 'pkg_openmaic_001',
          targetKnowledge: { id: 'graph-shortest-path', name: '最短路径' },
        },
      },
      scenes: [
        {
          id: 'scene_quiz_1',
          stageId: 'omc_stage_001',
          type: 'quiz',
          title: '课堂检测',
          order: 1,
          content: { type: 'quiz', questions: [{ id: 'q1' }] },
        },
      ],
      createdAt: '2026-06-04T00:00:00.000Z',
    });
  });

  it('proxies browser quiz attempt writeback to the EduResource FastAPI client', async () => {
    mocks.postEduResourceExerciseAttempts.mockResolvedValue({
      attempts: [{ id: 'attempt_001' }],
      evaluation: { id: 'eval_001' },
    });

    const { POST } = await import(
      '@/app/api/eduresource/integrations/openmaic/exercise-attempts/route'
    );
    const response = await POST(
      new Request('http://localhost/api/eduresource/integrations/openmaic/exercise-attempts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      attempts: [{ id: 'attempt_001' }],
      evaluation: { id: 'eval_001' },
    });
    expect(mocks.readClassroom).toHaveBeenCalledWith('omc_stage_001');
    expect(mocks.postEduResourceExerciseAttempts).toHaveBeenCalledWith(payload);
  });

  it('binds student and package ids to the persisted server-side classroom context', async () => {
    mocks.postEduResourceExerciseAttempts.mockResolvedValue({ attempts: [] });

    const { POST } = await import(
      '@/app/api/eduresource/integrations/openmaic/exercise-attempts/route'
    );
    const response = await POST(
      new Request('http://localhost/api/eduresource/integrations/openmaic/exercise-attempts', {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          student_id: 'spoofed_student',
          resource_package_id: 'spoofed_package',
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.postEduResourceExerciseAttempts).toHaveBeenCalledWith({
      ...payload,
      student_id: 'stu_001',
      resource_package_id: 'pkg_openmaic_001',
    });
  });

  it('rejects writeback when persisted classroom context is missing', async () => {
    mocks.readClassroom.mockResolvedValue({
      id: 'omc_stage_001',
      stage: { id: 'omc_stage_001', name: 'plain classroom', createdAt: 1, updatedAt: 2 },
      scenes: [],
      createdAt: '2026-06-04T00:00:00.000Z',
    });

    const { POST } = await import(
      '@/app/api/eduresource/integrations/openmaic/exercise-attempts/route'
    );
    const response = await POST(
      new Request('http://localhost/api/eduresource/integrations/openmaic/exercise-attempts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'EduResource classroom context is required for quiz attempt writeback',
    });
    expect(mocks.postEduResourceExerciseAttempts).not.toHaveBeenCalled();
  });

  it('returns a bad-gateway response when the FastAPI writeback fails', async () => {
    mocks.postEduResourceExerciseAttempts.mockRejectedValue(new Error('FastAPI unavailable'));

    const { POST } = await import(
      '@/app/api/eduresource/integrations/openmaic/exercise-attempts/route'
    );
    const response = await POST(
      new Request('http://localhost/api/eduresource/integrations/openmaic/exercise-attempts', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'EduResource exercise attempt writeback failed',
    });
  });
});
