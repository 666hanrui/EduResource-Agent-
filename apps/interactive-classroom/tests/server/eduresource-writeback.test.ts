import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EduResourceContext } from '@/lib/eduresource/types';

const mocks = vi.hoisted(() => ({
  generateClassroom: vi.fn(),
  mapClassroomToEduResourceImport: vi.fn(),
  postEduResourceClassroomImport: vi.fn(),
  markClassroomGenerationJobRunning: vi.fn(),
  markClassroomGenerationJobSucceeded: vi.fn(),
  markClassroomGenerationJobFailed: vi.fn(),
  updateClassroomGenerationJobProgress: vi.fn(),
}));

vi.mock('@/lib/server/classroom-generation', () => ({
  generateClassroom: mocks.generateClassroom,
}));

vi.mock('@/lib/eduresource/mapping', () => ({
  mapClassroomToEduResourceImport: mocks.mapClassroomToEduResourceImport,
}));

vi.mock('@/lib/eduresource/client', () => ({
  postEduResourceClassroomImport: mocks.postEduResourceClassroomImport,
}));

vi.mock('@/lib/server/classroom-job-store', () => ({
  markClassroomGenerationJobRunning: mocks.markClassroomGenerationJobRunning,
  markClassroomGenerationJobSucceeded: mocks.markClassroomGenerationJobSucceeded,
  markClassroomGenerationJobFailed: mocks.markClassroomGenerationJobFailed,
  updateClassroomGenerationJobProgress: mocks.updateClassroomGenerationJobProgress,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const eduResourceContext: EduResourceContext = {
  mode: 'student',
  studentId: 'stu_001',
  resourcePackageId: 'pkg_openmaic_001',
  targetKnowledge: { id: 'graph-shortest-path', name: '最短路径' },
};

const generationResult = {
  id: 'omc_stage_001',
  url: 'http://localhost:3100/classroom/omc_stage_001',
  stage: {
    id: 'omc_stage_001',
    name: '最短路径互动课堂',
    createdAt: 1000,
    updatedAt: 2000,
  },
  scenes: [],
  scenesCount: 0,
  createdAt: '2026-06-04T00:00:00.000Z',
};

describe('runClassroomGenerationJob EduResource writeback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.generateClassroom.mockResolvedValue(generationResult);
    mocks.mapClassroomToEduResourceImport.mockReturnValue({
      resource_package_id: 'pkg_openmaic_001',
    });
    mocks.postEduResourceClassroomImport.mockResolvedValue({
      package: { id: 'pkg_openmaic_001' },
    });
  });

  it('posts generated classroom back to EduResource when context is present', async () => {
    const { runClassroomGenerationJob } = await import('@/lib/server/classroom-job-runner');

    await runClassroomGenerationJob(
      'job_edu_001',
      { requirement: 'base lesson', eduResourceContext },
      'http://localhost:3100',
    );

    expect(mocks.mapClassroomToEduResourceImport).toHaveBeenCalledWith({
      context: eduResourceContext,
      stage: generationResult.stage,
      scenes: generationResult.scenes,
    });
    expect(mocks.postEduResourceClassroomImport).toHaveBeenCalledWith({
      resource_package_id: 'pkg_openmaic_001',
    });
    expect(mocks.markClassroomGenerationJobSucceeded).toHaveBeenCalledWith(
      'job_edu_001',
      generationResult,
    );
    expect(mocks.markClassroomGenerationJobFailed).not.toHaveBeenCalled();
  });

  it('keeps original classroom generation behavior when EduResource context is absent', async () => {
    const { runClassroomGenerationJob } = await import('@/lib/server/classroom-job-runner');

    await runClassroomGenerationJob('job_plain_001', { requirement: 'base lesson' }, 'http://x');

    expect(mocks.mapClassroomToEduResourceImport).not.toHaveBeenCalled();
    expect(mocks.postEduResourceClassroomImport).not.toHaveBeenCalled();
    expect(mocks.markClassroomGenerationJobSucceeded).toHaveBeenCalledWith(
      'job_plain_001',
      generationResult,
    );
  });
});
