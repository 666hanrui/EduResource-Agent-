import { describe, expect, it, vi } from 'vitest';
import {
  postEduResourceClassroomImport,
  postEduResourceExerciseAttempts,
} from '@/lib/eduresource/client';
import type {
  EduResourceClassroomImportPayload,
  EduResourceExerciseAttemptsPayload,
} from '@/lib/eduresource/types';

const payload: EduResourceClassroomImportPayload = {
  source_classroom_id: 'omc_stage_001',
  resource_package_id: 'pkg_openmaic_001',
  student_id: 'stu_001',
  target_knowledge_id: 'graph-shortest-path',
  target_knowledge_name: '最短路径',
  stage: { id: 'omc_stage_001', name: '最短路径互动课堂' },
  scenes: [],
};

const attemptsPayload: EduResourceExerciseAttemptsPayload = {
  resource_package_id: 'pkg_openmaic_001',
  student_id: 'stu_001',
  source_classroom_id: 'omc_stage_001',
  quiz_scene_id: 'scene_quiz_1',
  answers: [
    {
      question_id: 'q1',
      user_answer: 'A',
      time_spent_sec: 30,
    },
  ],
};

describe('postEduResourceClassroomImport', () => {
  it('posts mapped classroom payload to the FastAPI import endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ package: { id: 'pkg_openmaic_001' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await postEduResourceClassroomImport(payload, {
      baseUrl: 'http://localhost:8000/api',
      fetchImpl,
    });

    expect(response.package.id).toBe('pkg_openmaic_001');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8000/api/integrations/openmaic/resource-package',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
  });

  it('fails with endpoint details when FastAPI rejects the import', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'package rejected' }), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      postEduResourceClassroomImport(payload, {
        baseUrl: 'http://localhost:8000/api/',
        fetchImpl,
      }),
    ).rejects.toThrow(
      'EduResource import failed: POST http://localhost:8000/api/integrations/openmaic/resource-package returned 422',
    );
  });
});

describe('postEduResourceExerciseAttempts', () => {
  it('posts OpenMAIC quiz answers to the FastAPI attempt import endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ attempts: [{ id: 'attempt_001' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await postEduResourceExerciseAttempts(attemptsPayload, {
      baseUrl: 'http://localhost:8000/api',
      fetchImpl,
    });

    expect(response.attempts?.[0].id).toBe('attempt_001');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8000/api/integrations/openmaic/exercise-attempts',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attemptsPayload),
      }),
    );
  });

  it('fails with endpoint details when FastAPI rejects quiz answer import', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: 'exercise item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      postEduResourceExerciseAttempts(attemptsPayload, {
        baseUrl: 'http://localhost:8000/api/',
        fetchImpl,
      }),
    ).rejects.toThrow(
      'EduResource exercise attempt import failed: POST http://localhost:8000/api/integrations/openmaic/exercise-attempts returned 404',
    );
  });
});
