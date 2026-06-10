import { NextResponse } from 'next/server';
import { postEduResourceExerciseAttempts } from '@/lib/eduresource/client';
import type { EduResourceExerciseAttemptsPayload } from '@/lib/eduresource/types';
import { createLogger } from '@/lib/logger';
import { readClassroom } from '@/lib/server/classroom-storage';

const log = createLogger('EduResource Attempt Proxy');

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as EduResourceExerciseAttemptsPayload;
    const trustedPayload = await bindAttemptToPersistedClassroom(payload);
    if ('error' in trustedPayload) {
      return NextResponse.json({ error: trustedPayload.error }, { status: trustedPayload.status });
    }

    const response = await postEduResourceExerciseAttempts(trustedPayload);
    return NextResponse.json(response);
  } catch (error) {
    log.error('EduResource exercise attempt writeback failed:', error);
    return NextResponse.json(
      { error: 'EduResource exercise attempt writeback failed' },
      { status: 502 },
    );
  }
}

async function bindAttemptToPersistedClassroom(
  payload: EduResourceExerciseAttemptsPayload,
): Promise<EduResourceExerciseAttemptsPayload | { status: number; error: string }> {
  const classroom = await readClassroom(payload.source_classroom_id);
  if (!classroom) {
    return { status: 404, error: 'OpenMAIC classroom not found for quiz attempt writeback' };
  }

  const context = classroom.stage.eduResourceContext;
  if (context?.mode !== 'student' || !context.studentId || !context.resourcePackageId) {
    return {
      status: 403,
      error: 'EduResource classroom context is required for quiz attempt writeback',
    };
  }

  const quizScene = classroom.scenes.find(
    (scene) => scene.id === payload.quiz_scene_id && scene.type === 'quiz',
  );
  if (!quizScene) {
    return { status: 400, error: 'Quiz scene does not belong to the persisted classroom' };
  }

  return {
    ...payload,
    student_id: context.studentId,
    resource_package_id: context.resourcePackageId,
    source_classroom_id: classroom.stage.id,
  };
}
