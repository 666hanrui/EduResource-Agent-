import type { EduResourceBuildRequirementInput, EduResourceContext } from './types';

export function buildEduResourceRequirement(input: EduResourceBuildRequirementInput): string {
  const { context } = input;
  const sections = [
    input.baseRequirement?.trim() || '生成一节个性化互动课堂。',
    `EduResource 接入模式：${context.mode === 'teacher' ? '教师模式' : '学生模式'}`,
    `ResourcePackage: ${context.resourcePackageId}`,
    formatIdentity(context),
    formatKnowledge(context),
    formatGoals(context),
    formatPreferences(context),
    formatSnapshot('学生画像', context.profileSnapshot),
    formatSnapshot('班级画像', context.classProfileSnapshot),
    context.difficulty ? `建议难度：${context.difficulty}/5` : '',
    [
      '输出要求：',
      '- 生成高质量互动课堂 Stage / Scenes。',
      '- 至少覆盖幻灯片、课堂测验，并在适合时加入互动模拟或项目式学习。',
      '- 测验题必须能映射到 EduResource ExerciseSet / ExerciseItem。',
      '- 互动模拟和 PBL 必须能作为 ResourceItem 写回 EduResource-Agent。',
    ].join('\n'),
  ];

  return sections.filter(Boolean).join('\n\n');
}

function formatIdentity(context: EduResourceContext): string {
  const parts = [
    context.studentId ? `student_id: ${context.studentId}` : '',
    context.teacherId ? `teacher_id: ${context.teacherId}` : '',
    context.classId ? `class_id: ${context.classId}` : '',
    context.profileSnapshotId ? `profile_snapshot_id: ${context.profileSnapshotId}` : '',
  ].filter(Boolean);
  return parts.length ? `业务身份：${parts.join('；')}` : '';
}

function formatKnowledge(context: EduResourceContext): string {
  const { targetKnowledge } = context;
  return [
    `目标知识点：${targetKnowledge.name}（${targetKnowledge.id}）`,
    targetKnowledge.description ? `知识点说明：${targetKnowledge.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatGoals(context: EduResourceContext): string {
  return [
    context.learningGoal ? `学习目标：${context.learningGoal}` : '',
    context.teachingGoal ? `教学目标：${context.teachingGoal}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formatPreferences(context: EduResourceContext): string {
  if (!context.resourcePreferences?.length) return '';
  return `资源偏好：${context.resourcePreferences.join('、')}`;
}

function formatSnapshot(title: string, snapshot: Record<string, unknown> | undefined): string {
  if (!snapshot || Object.keys(snapshot).length === 0) return '';
  const lines = Object.entries(snapshot).map(([key, value]) => `- ${key}: ${formatValue(value)}`);
  return `${title}：\n${lines.join('\n')}`;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join('、');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 0);
  return String(value);
}
