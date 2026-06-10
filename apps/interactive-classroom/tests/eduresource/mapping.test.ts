import { describe, expect, it } from 'vitest';
import { mapClassroomToEduResourceImport } from '@/lib/eduresource/mapping';
import type { EduResourceContext } from '@/lib/eduresource/types';
import type { Scene, Stage } from '@/lib/types/stage';

const stage: Stage = {
  id: 'omc_stage_001',
  name: '最短路径互动课堂',
  createdAt: 1000,
  updatedAt: 2000,
  description: '从校园导航问题理解 Dijkstra 算法',
};

const scenes: Scene[] = [
  {
    id: 'scene_slide_1',
    stageId: stage.id,
    type: 'slide',
    title: '校园路径问题',
    order: 0,
    content: { type: 'slide', canvas: { id: 'slide_1', elements: [] } as never },
  },
  {
    id: 'scene_interactive_1',
    stageId: stage.id,
    type: 'interactive',
    title: '拖动节点观察最短路径',
    order: 1,
    content: { type: 'interactive', url: '', html: '<main>demo</main>' },
  },
  {
    id: 'scene_pbl_1',
    stageId: stage.id,
    type: 'pbl',
    title: '设计校园导航助手',
    order: 2,
    content: { type: 'pbl', projectConfig: { title: '导航助手' } as never },
  },
  {
    id: 'scene_quiz_1',
    stageId: stage.id,
    type: 'quiz',
    title: '课堂检测',
    order: 3,
    content: {
      type: 'quiz',
      questions: [
        {
          id: 'q1',
          type: 'single',
          question: 'Dijkstra 算法每轮选择哪个节点？',
          options: [
            { label: 'A', value: '距离起点最近的未确定节点' },
            { label: 'B', value: '编号最大的节点' },
          ],
          answer: ['A'],
          analysis: '每轮选择当前距离起点最近且尚未确定的节点。',
        },
      ],
    },
  },
];

describe('mapClassroomToEduResourceImport', () => {
  it('maps OpenMAIC stage, scenes, and quizzes to the FastAPI import contract', () => {
    const context: EduResourceContext = {
      mode: 'student',
      studentId: 'stu_001',
      resourcePackageId: 'pkg_openmaic_001',
      profileSnapshotId: 'profile_20260604',
      targetKnowledge: { id: 'graph-shortest-path', name: '最短路径' },
      difficulty: 3,
    };

    const payload = mapClassroomToEduResourceImport({ context, stage, scenes });

    expect(payload.resource_package_id).toBe('pkg_openmaic_001');
    expect(payload.student_id).toBe('stu_001');
    expect(payload.target_knowledge_id).toBe('graph-shortest-path');
    expect(payload.stage.name).toBe('最短路径互动课堂');
    expect(payload.scenes.map((scene) => scene.type)).toEqual([
      'slide',
      'interactive',
      'pbl',
      'quiz',
    ]);
    const quizContent = payload.scenes[3].content as {
      questions: Array<{ answer?: string[] }>;
    };
    expect(quizContent.questions[0].answer).toEqual(['A']);
  });
});
