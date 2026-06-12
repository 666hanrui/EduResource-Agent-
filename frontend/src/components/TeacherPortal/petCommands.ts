import type { TeacherArtifactType } from './artifacts';
import type { ClassProfile, Student, TabKey } from './model';
import { compactText } from './utils';

export interface TeacherPetGenerateDraft {
  studentId?: string;
  knowledgeId?: string;
  knowledgeName?: string;
  goal?: string;
}

export const MODULE_LABELS: Partial<Record<TeacherArtifactType, string>> = {
  TalentPlan: '人培方案',
  Syllabus: '大纲',
  LessonPlan: '教案',
  SlideDeck: 'PPT',
  KeyFocus: '重难点',
  Document: '讲义',
  Exercise: '练习',
  Visual: '动画',
  Code: '代码',
  Video: '视频',
  Reading: '阅读',
};

const TAB_LABELS: Record<TabKey, string> = {
  overview: '总览',
  generator: '生成',
  review: '人培体系',
  intervention: '干预',
};

export function tabLabel(tab: TabKey): string {
  return TAB_LABELS[tab] ?? tab;
}

export function buildDraftFromPrompt(
  rawText: string,
  context: {
    activeStudent: Student;
    knowledgeId: string;
    knowledgeName: string;
    goal: string;
    targetType: TeacherArtifactType;
  },
): TeacherPetGenerateDraft {
  const topic = extractTopic(rawText, context.knowledgeName);
  const focus = extractSegment(rawText, ['重点是', '重点', '难点是', '难点', '强调']);
  const points = extractSegment(rawText, ['要讲', '讲哪些', '包含', '包括', '覆盖']);
  const style = extractModuleStyle(rawText);
  const studentId = extractStudentId(rawText) ?? context.activeStudent.id;
  const goalParts = [MODULE_LABELS[context.targetType] ?? '内容', topic];

  if (points) goalParts.push(`讲${points}`);
  if (focus) goalParts.push(`重点${focus}`);
  if (style) goalParts.push(style);

  return {
    studentId,
    knowledgeId: buildKnowledgeId(topic, context.knowledgeId),
    knowledgeName: topic,
    goal: goalParts.filter(Boolean).join(' · ') || context.goal,
  };
}

export function inferTargetType(text: string): TeacherArtifactType | null {
  if (hasAny(text, ['ppt', 'powerpoint', '课件', '幻灯'])) return 'SlideDeck';
  if (hasAny(text, ['大纲', '提纲', '纲要'])) return 'Syllabus';
  if (hasAny(text, ['教案', '教学设计'])) return 'LessonPlan';
  if (hasAny(text, ['重难点', '重点难点', '难点', '重点'])) return 'KeyFocus';
  if (hasAny(text, ['人培', '培养方案', '培养体系', '方案体系'])) return 'TalentPlan';
  return null;
}

export function isGenerationPrompt(text: string, targetType: TeacherArtifactType | null): boolean {
  if (!hasAny(text, ['做', '生成', '制作', '帮我', '创建', '出一版', '来一版', '准备', '产出'])) return false;
  return Boolean(targetType || hasAny(text, ['资源包', '材料', '任务']));
}

export function findStudentFromPrompt(rawText: string, students: Student[]): Student | null {
  const normalized = normalizeCommand(rawText);
  const idMatch = extractStudentId(rawText);
  if (idMatch) {
    const compactId = normalizeCommand(idMatch);
    const matched = students.find((student) => normalizeCommand(student.id) === compactId);
    if (matched) return matched;
  }

  return students.find((student) => {
    const id = normalizeCommand(student.id);
    return normalized.includes(id) || normalized.includes(normalizeCommand(student.knowledgeName));
  }) ?? null;
}

export function findClassFromPrompt(rawText: string, classes: ClassProfile[]): ClassProfile | null {
  const normalized = normalizeCommand(rawText);
  return classes.find((item) => normalized.includes(normalizeCommand(item.class_id)) || normalized.includes(normalizeCommand(item.name))) ?? null;
}

export function normalizeCommand(value: string): string {
  return value.trim().toLowerCase().replace(/[\s,，。.!！?？、:：；;]/g, '');
}

export function hasAny(value: string, keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase().replace(/[\s,，。.!！?？、:：；;]/g, '')));
}

function extractTopic(rawText: string, fallback: string): string {
  const marked = extractSegment(rawText, ['主要内容是', '内容是', '主题是', '知识点是', '关于', '围绕']);
  if (marked) return marked;

  const clean = rawText
    .replace(/stu[_-]?\d+/gi, '')
    .replace(/(帮我|请|做一个|做一份|生成|制作|创建|出一版|来一版|ppt|PPT|powerpoint|课件|幻灯|大纲|教案|重难点|人培方案|人培|体系)/g, '')
    .replace(/(主要内容|内容|主题|知识点|重点|难点|要讲|讲哪些|包含|包括|覆盖|是|为|：|:)/g, ' ')
    .split(/[，,。；;！!？?\n]/)[0]
    .trim();

  if (clean.length >= 2) return compactText(clean, 24);
  return fallback;
}

function extractSegment(rawText: string, markers: string[]): string | null {
  for (const marker of markers) {
    const index = rawText.indexOf(marker);
    if (index === -1) continue;
    const value = rawText
      .slice(index + marker.length)
      .replace(/^[是为:：\s]+/, '')
      .split(/重点是|难点是|要讲|讲哪些|包含|包括|覆盖|风格是|类型是|形式是|[，,。；;！!？?\n]/)[0]
      .trim();
    if (value) return compactText(value, 28);
  }
  return null;
}

function extractModuleStyle(rawText: string): string | null {
  const style = extractSegment(rawText, ['类型是', '风格是', '形式是']);
  return style ? compactText(style, 18) : null;
}

function extractStudentId(rawText: string): string | null {
  const match = rawText.match(/stu[_-]?\d+/i);
  return match ? match[0].replace('-', '_').toLowerCase() : null;
}

function buildKnowledgeId(topic: string, fallback: string): string {
  if (!topic.trim()) return fallback;
  const asciiSlug = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (asciiSlug) return asciiSlug;
  const encoded = Array.from(topic)
    .slice(0, 8)
    .map((char) => char.charCodeAt(0).toString(36))
    .join('-');
  return encoded ? `topic-${encoded}` : fallback;
}
