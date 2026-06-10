import { describe, expect, it } from 'vitest';
import { buildEduResourceRequirement } from '@/lib/eduresource/prompt';
import type { EduResourceContext } from '@/lib/eduresource/types';

describe('buildEduResourceRequirement', () => {
  it('folds student profile, knowledge target, and resource preferences into OpenMAIC input', () => {
    const context: EduResourceContext = {
      mode: 'student',
      studentId: 'stu_001',
      resourcePackageId: 'pkg_openmaic_001',
      profileSnapshotId: 'profile_20260604',
      profileSnapshot: {
        foundation_level: 'beginner',
        interests: ['校园导航', 'AI 应用'],
        learning_style: '图解 + 交互模拟',
      },
      targetKnowledge: {
        id: 'graph-shortest-path',
        name: '最短路径',
        description: '理解 Dijkstra 算法的贪心过程',
      },
      learningGoal: '能用最短路径解决校园导航问题',
      resourcePreferences: ['互动模拟', '课堂测验', '项目式学习'],
      difficulty: 3,
    };

    const requirement = buildEduResourceRequirement({
      baseRequirement: '生成一节 30 分钟互动课',
      context,
    });

    expect(requirement).toContain('生成一节 30 分钟互动课');
    expect(requirement).toContain('学生模式');
    expect(requirement).toContain('stu_001');
    expect(requirement).toContain('最短路径');
    expect(requirement).toContain('Dijkstra');
    expect(requirement).toContain('图解 + 交互模拟');
    expect(requirement).toContain('互动模拟、课堂测验、项目式学习');
    expect(requirement).toContain('ResourcePackage: pkg_openmaic_001');
  });

  it('keeps teacher and class context distinct from student context', () => {
    const requirement = buildEduResourceRequirement({
      baseRequirement: '',
      context: {
        mode: 'teacher',
        teacherId: 'teacher_001',
        classId: 'class_2026_algo',
        resourcePackageId: 'pkg_teacher_001',
        targetKnowledge: { id: 'hash-table', name: '哈希表' },
        teachingGoal: '帮助全班理解冲突处理策略',
        classProfileSnapshot: {
          common_weakness: ['链地址法和开放寻址混淆'],
          pace: '中等',
        },
      },
    });

    expect(requirement).toContain('教师模式');
    expect(requirement).toContain('teacher_001');
    expect(requirement).toContain('class_2026_algo');
    expect(requirement).toContain('帮助全班理解冲突处理策略');
    expect(requirement).toContain('链地址法和开放寻址混淆');
  });
});
