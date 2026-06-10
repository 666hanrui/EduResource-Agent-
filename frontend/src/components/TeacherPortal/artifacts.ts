import type {
  CodeSample,
  DocumentSection,
  GenerateResults,
  Question,
  Rationale,
  SupplementalReadingResource,
  SupplementalVideoResource,
} from '../../types/resources';
import { buildLearningResourceSet } from '../../utils/learningResources';
import { DEMO_RATIONALE } from './model';
import type { ReviewItem, TeacherTeachingPackage } from './model';

export const TEACHER_DELIVERABLE_TYPES = ['TalentPlan', 'LessonPlan', 'SlideDeck', 'Syllabus', 'KeyFocus'] as const;

export type TeacherDeliverableType = (typeof TEACHER_DELIVERABLE_TYPES)[number];
export type TeacherArtifactType = TeacherDeliverableType | 'Document' | 'Exercise' | 'Visual' | 'Code' | 'Video' | 'Reading';
export type TeacherArtifactLibrary = Partial<Record<TeacherArtifactType, TeacherArtifact>>;

export interface TeacherArtifactLink {
  title: string;
  url: string;
  meta: string;
}

export interface TeacherArtifactSection {
  heading: string;
  body: string;
}

export interface TalentPlanSemester {
  id: string;
  stage: string;
  label: string;
  theme: string;
  target: string;
  courses: string[];
  engineering: string[];
  frontier: string[];
  project: string;
  assessment: string;
  output: string;
}

export interface TalentPlanLane {
  title: string;
  label: string;
  items: string[];
}

export interface TalentPlanRadarTopic {
  date: string;
  source: string;
  title: string;
  signal: string;
  classroomAction: string;
  projectMapping: string;
}

export interface TalentPlanExitPath {
  title: string;
  fit: string;
  milestones: string[];
  deliverables: string[];
}

export interface TalentPlanBlueprint {
  kind: 'talent-plan';
  direction: string;
  vision: string;
  graduationProfile: string[];
  semesterPlan: TalentPlanSemester[];
  continuousLanes: TalentPlanLane[];
  radar: {
    cadence: string;
    sourceBuckets: string[];
    process: string[];
    topics: TalentPlanRadarTopic[];
  };
  innovation: {
    ladders: string[];
    arenas: string[];
    teacherRole: string[];
  };
  assessment: {
    dimensions: string[];
    checkpoints: string[];
    portfolio: string[];
  };
  exits: TalentPlanExitPath[];
}

export interface TeacherArtifact {
  id: string;
  type: TeacherArtifactType;
  family: 'deliverable' | 'asset';
  title: string;
  label: string;
  summary: string;
  agent: string;
  student: string | null;
  status: string;
  reason: string;
  chips: string[];
  outline: string[];
  sections: TeacherArtifactSection[];
  links: TeacherArtifactLink[];
  markdown: string;
  rationale: Rationale;
  presentation?: TalentPlanBlueprint;
}

interface BuildTeacherArtifactLibraryInput {
  results: GenerateResults | null;
  knowledgeId: string;
  knowledgeName: string;
  studentId: string;
  goal: string;
  focus?: string;
  risk?: string;
}

const REVIEW_TYPE_ORDER: TeacherArtifactType[] = [
  'TalentPlan',
  'LessonPlan',
  'SlideDeck',
  'Syllabus',
  'KeyFocus',
  'Document',
  'Exercise',
  'Visual',
  'Code',
  'Video',
  'Reading',
];

export function pickLatestTeacherResults(
  packages: TeacherTeachingPackage[] | undefined,
  studentId?: string,
  knowledgeId?: string,
): GenerateResults | null {
  const candidates = (packages ?? []).filter((item) => isGenerateResults(item.results));
  if (!candidates.length) return null;

  const matched =
    candidates.find((item) => studentId && item.target_student_id === studentId) ??
    candidates.find((item) => knowledgeId && item.target_knowledge_id === knowledgeId) ??
    candidates[0];

  return matched?.results as GenerateResults;
}

export function buildTeacherArtifactLibrary({
  results,
  knowledgeId,
  knowledgeName,
  studentId,
  goal,
  focus = '',
  risk = 'medium',
}: BuildTeacherArtifactLibraryInput): TeacherArtifactLibrary {
  const weakness = collectWeakness(results, focus);
  const supplemental =
    results?.supplemental ??
    buildLearningResourceSet({
      knowledgeId,
      knowledgeName,
      studentId,
      weakness,
    });
  const primaryRationale = pickRationale(
    results?.document?.rationale,
    results?.exercise?.rationale,
    results?.visual?.rationale,
    results?.code?.rationale,
    supplemental.rationale,
  );
  const generated = Boolean(results?.document || results?.exercise || results?.visual || results?.code);
  const classMode = lessonModeByRisk(risk);

  const lessonPlanSections: TeacherArtifactSection[] = [
    {
      heading: '课时目标',
      body: [
        `围绕 ${knowledgeName} 优先解决 ${(weakness[0] ?? focus) || '当前薄弱点'}。`,
        `本轮老师目标：${goal}`,
        `课堂策略：${classMode}`,
      ].join('\n'),
    },
    {
      heading: '教学流程',
      body: buildLessonFlow(results, knowledgeName),
    },
    {
      heading: '评价与延伸',
      body: [
        results?.evaluation?.narrative ?? '先在课堂内完成一次低负担检测，再决定是否进入下一轮补救。',
        `课后延伸：${supplemental.readings[0]?.title ?? '补充本地动画与图文资料'}`,
      ].join('\n'),
    },
  ];

  const slideSections = buildSlideSections(results, knowledgeName, weakness, supplemental.readings[0]);
  const syllabusSections: TeacherArtifactSection[] = [
    {
      heading: '课时定位',
      body: `这是围绕 ${knowledgeName} 的一节补救课，聚焦 ${weakness[0] ?? '核心理解障碍'}，适合老师在 1 个课时内完成闭环。`,
    },
    {
      heading: '先修知识',
      body: inferPrerequisites(knowledgeName, focus),
    },
    {
      heading: '知识主线',
      body: buildKnowledgeLine(results?.document?.document.sections ?? [], knowledgeName),
    },
    {
      heading: '课堂产出',
      body: `学生需要完成 1 份讲义跟读、${results?.exercise?.questions.length ?? 3} 道检测题，以及 1 次步骤动画/代码走查。`,
    },
    {
      heading: '资源挂载',
      body: [
        results?.document ? '讲义已生成，可直接拆成课堂讲稿。' : '当前先按老师目标预排讲义结构。',
        results?.visual ? '动画与思维导图可直接投屏。' : '动画位保留给可视化演示工作室。',
        results?.code ? '代码案例适合走查或板书复现。' : '代码位保留给双语示例。',
      ].join('\n'),
    },
  ];
  const keyFocusSections: TeacherArtifactSection[] = [
    {
      heading: '重点',
      body: buildKeyPoint(results?.document?.document.sections ?? [], knowledgeName),
    },
    {
      heading: '难点',
      body: weakness.join('\n'),
    },
    {
      heading: '易错点',
      body: buildCommonMistakes(results?.exercise?.questions ?? [], focus),
    },
    {
      heading: '讲法建议',
      body: buildTeachingHints(primaryRationale, results?.visual?.animation.steps.length ?? 0),
    },
  ];
  const talentPlanPresentation = buildTalentPlanBlueprint({
    knowledgeName,
    focus,
    currentPractice: results?.code?.code_samples[0]?.filename ?? '双语代码案例走查',
    currentVisualization: results?.visual?.animation.scene ?? '算法 / 过程可视化演示',
    currentAssessment: results?.exercise?.questions.length ?? 3,
    frontierReading: supplemental.readings[0]?.title ?? '本地演示工作室',
    frontierVideo: supplemental.videos[0]?.title ?? '课堂前沿导读',
  });

  const library: TeacherArtifactLibrary = {
    TalentPlan: createArtifact({
      type: 'TalentPlan',
      family: 'deliverable',
      title: `${resolveProgramDirection(knowledgeName, focus)} · 四年人培路线图`,
      label: '人培计划',
      summary: '以“入学建档 -> 基础编程 -> 工程协作 -> AI / Agent 开发 -> 毕业出口”为主线，把八学期、月度前沿雷达、项目阶梯、作品集评估和四类出口编成一张连续的人培系统图。',
      agent: 'TeacherStudioStrategist',
      student: null,
      status: 'ready',
      reason: '老师端不该只看到单节课资源，还要能看到从新生入学到毕业出口的整条培养路线。',
      chips: ['8 semesters + onboarding', '月度前沿雷达', '项目阶梯 + 作品集', '4 exit pathways'],
      outline: [
        '入学建档与八学期主线',
        '基础课程群与工程训练',
        'AI / Agent 前沿雷达',
        '编码实战与创新探索',
        '评估、作品集与预警',
        '就业 / 考研 / 科研 / 创业出口',
      ],
      sections: buildTalentPlanSections({
        knowledgeName,
        goal,
        weakness,
        blueprint: talentPlanPresentation,
      }),
      links: buildTalentPlanLinks(supplemental),
      rationale: primaryRationale,
      presentation: talentPlanPresentation,
    }),
    LessonPlan: createArtifact({
      type: 'LessonPlan',
      family: 'deliverable',
      title: `${knowledgeName} · 课堂教案`,
      label: '教案',
      summary: generated ? '把当前生成内容重组成一节可直接上课的流程稿。' : '先按老师目标预排课堂节奏，等待正式资源覆盖。',
      agent: 'TeacherStudioComposer',
      student: studentId,
      status: generated ? 'ready' : 'draft',
      reason: weakness[0] ?? '根据老师目标自动编排课堂流程。',
      chips: ['45 min', classMode, results?.visual ? '动画插入' : '投屏预留'],
      outline: [
        '导入诊断',
        '核心讲解',
        results?.visual ? '步骤动画' : '板书拆解',
        results?.code ? '代码走查' : '例题演练',
        '当堂检测',
      ],
      sections: lessonPlanSections,
      links: buildDeliverableLinks(supplemental.videos, supplemental.readings),
      rationale: primaryRationale,
    }),
    SlideDeck: createArtifact({
      type: 'SlideDeck',
      family: 'deliverable',
      title: `${knowledgeName} · PPT 页稿`,
      label: 'PPT 页稿',
      summary: '按照课堂节奏把讲解、动画、练习和收束页排成投屏结构。',
      agent: 'TeacherStudioComposer',
      student: studentId,
      status: generated ? 'ready' : 'draft',
      reason: results?.visual?.rationale.matched_profile[0] ?? '把低干扰的页面结构交给老师直接投屏。',
      chips: ['9 slides', results?.visual ? '动画页' : '静态页', '课堂检测'],
      outline: slideSections.map((section) => section.heading),
      sections: slideSections,
      links: buildDeliverableLinks(supplemental.videos, supplemental.readings),
      rationale: pickRationale(results?.visual?.rationale, results?.document?.rationale, supplemental.rationale),
    }),
    Syllabus: createArtifact({
      type: 'Syllabus',
      family: 'deliverable',
      title: `${knowledgeName} · 教学大纲`,
      label: '教学大纲',
      summary: '把课时定位、先修知识、知识主线与课堂产出整理成纲要。',
      agent: 'TeacherStudioComposer',
      student: studentId,
      status: generated ? 'ready' : 'draft',
      reason: '老师审核时先看结构与节奏，而不是单个资源碎片。',
      chips: ['结构先行', '闭环课时', '课后衔接'],
      outline: syllabusSections.map((section) => section.heading),
      sections: syllabusSections,
      links: buildDeliverableLinks([], supplemental.readings),
      rationale: primaryRationale,
    }),
    KeyFocus: createArtifact({
      type: 'KeyFocus',
      family: 'deliverable',
      title: `${knowledgeName} · 重难点讲解`,
      label: '重难点',
      summary: '把重点、难点、易错点和讲法建议提前整理给老师。 ',
      agent: 'TeacherStudioComposer',
      student: studentId,
      status: generated ? 'ready' : 'draft',
      reason: weakness[0] ?? '围绕学生高频错误优先组织讲法。',
      chips: ['错因先读', '讲法建议', '课堂提醒'],
      outline: keyFocusSections.map((section) => section.heading),
      sections: keyFocusSections,
      links: buildDeliverableLinks(supplemental.videos.slice(0, 1), []),
      rationale: primaryRationale,
    }),
  };

  if (results?.document) {
    library.Document = createArtifact({
      type: 'Document',
      family: 'asset',
      title: results.document.document.title,
      label: '讲义',
      summary: '原始讲义结果，适合拆成教师讲稿或发给学生复习。',
      agent: results.document.rationale.agent_name,
      student: studentId,
      status: 'ready',
      reason: results.document.rationale.addressed_weakness[0] ?? '根据当前画像生成讲解材料。',
      chips: [`${results.document.document.sections.length} sections`, 'Markdown', '可追溯'],
      outline: results.document.document.sections.map((section) => section.heading),
      sections: mapDocumentSections(results.document.document.sections),
      links: [],
      rationale: results.document.rationale,
    });
  }

  if (results?.exercise) {
    library.Exercise = createArtifact({
      type: 'Exercise',
      family: 'asset',
      title: `${knowledgeName} · ${results.exercise.questions.length} 道自适应题`,
      label: '练习',
      summary: '按学生薄弱点排序的课堂检测与讲后回收题。',
      agent: results.exercise.rationale.agent_name,
      student: studentId,
      status: 'ready',
      reason: results.exercise.rationale.addressed_weakness[0] ?? '根据短板生成检测题。',
      chips: [`${results.exercise.questions.length} Q`, '分层检测', '解释可回看'],
      outline: results.exercise.questions.slice(0, 4).map((question, index) => `Q${index + 1} · ${question.stem}`),
      sections: results.exercise.questions.slice(0, 4).map((question, index) => ({
        heading: `Q${index + 1} · ${question.type}`,
        body: `${question.stem}\n答案：${question.answer}\n讲解：${question.explanation}`,
      })),
      links: [],
      rationale: results.exercise.rationale,
    });
  }

  if (results?.visual) {
    const steps = results.visual.animation.steps.slice(0, 5);
    library.Visual = createArtifact({
      type: 'Visual',
      family: 'asset',
      title: `${knowledgeName} · 思维导图与步骤动画`,
      label: '动画',
      summary: '课堂投屏优先的思维导图与逐步演示脚本。',
      agent: results.visual.rationale.agent_name,
      student: studentId,
      status: 'ready',
      reason: results.visual.rationale.matched_profile[0] ?? '根据图解偏好生成动画资源。',
      chips: [`${steps.length} steps`, results.visual.animation.scene, '可视化优先'],
      outline: steps.map((step, index) => `Step ${index + 1} · ${step.action}`),
      sections: [
        {
          heading: 'Mindmap',
          body: shortenMultiline(results.visual.mindmap_md, 8),
        },
        ...steps.map((step, index) => ({
          heading: `Step ${index + 1} · ${step.action}`,
          body: `${step.narration}\nTarget: ${step.target}\nSection: ${step.links_to_doc_section}`,
        })),
      ],
      links: buildDeliverableLinks([], supplemental.readings.slice(0, 2)),
      rationale: results.visual.rationale,
    });
  }

  if (results?.code) {
    library.Code = createArtifact({
      type: 'Code',
      family: 'asset',
      title: `${knowledgeName} · 双语代码走查`,
      label: '代码',
      summary: '适合老师投屏走查或让学生课后对照复现。',
      agent: results.code.rationale.agent_name,
      student: studentId,
      status: 'ready',
      reason: results.code.rationale.matched_profile[0] ?? '根据代码偏好生成双语示例。',
      chips: results.code.code_samples.map((sample) => sample.lang.toUpperCase()),
      outline: results.code.code_samples.map((sample) => `${sample.lang.toUpperCase()} · ${sample.filename}`),
      sections: results.code.code_samples.map((sample) => ({
        heading: `${sample.lang.toUpperCase()} · ${sample.filename}`,
        body: buildCodePreview(sample),
      })),
      links: [],
      rationale: results.code.rationale,
    });
  }

  if (supplemental.videos.length) {
    library.Video = createArtifact({
      type: 'Video',
      family: 'asset',
      title: `${knowledgeName} · 视频补充资源`,
      label: '视频',
      summary: '给老师审核和替换的一组外部视频入口。',
      agent: supplemental.rationale.agent_name,
      student: studentId,
      status: 'ready',
      reason: supplemental.videos[0]?.fit_reason ?? '根据当前知识点补充视频资源。',
      chips: [`${supplemental.videos.length} refs`, 'B站', '课后补充'],
      outline: supplemental.videos.slice(0, 3).map((video) => video.title),
      sections: supplemental.videos.slice(0, 3).map((video, index) => ({
        heading: `Video ${index + 1}`,
        body: `${video.title}\n${video.fit_reason}`,
      })),
      links: supplemental.videos.slice(0, 3).map(toVideoLink),
      rationale: supplemental.rationale,
    });
  }

  if (supplemental.readings.length) {
    library.Reading = createArtifact({
      type: 'Reading',
      family: 'asset',
      title: `${knowledgeName} · 本地演示与图文入口`,
      label: '阅读',
      summary: '把本地动画、演示工作室和图文检索放在一起方便老师调用。',
      agent: supplemental.rationale.agent_name,
      student: studentId,
      status: 'ready',
      reason: supplemental.readings[0]?.fit_reason ?? '根据当前知识点补充图文与演示资源。',
      chips: [`${supplemental.readings.length} refs`, '本地可用', '图文补充'],
      outline: supplemental.readings.slice(0, 3).map((item) => item.title),
      sections: supplemental.readings.slice(0, 3).map((item, index) => ({
        heading: `Entry ${index + 1}`,
        body: `${item.title}\n${item.fit_reason}`,
      })),
      links: supplemental.readings.slice(0, 3).map(toReadingLink),
      rationale: supplemental.rationale,
    });
  }

  return library;
}

export function buildTeacherReviewItems(artifactLibrary: TeacherArtifactLibrary): ReviewItem[] {
  return orderedArtifacts(artifactLibrary).map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    type: artifact.type,
    student: artifact.student,
    status: artifact.status,
    agent: artifact.agent,
    reason: artifact.reason,
    rationale: artifact.rationale,
  }));
}

export function mergeReviewItems(primary: ReviewItem[], derived: ReviewItem[]): ReviewItem[] {
  const merged = new Map<string, ReviewItem>();

  for (const item of primary) merged.set(item.type, item);

  for (const item of derived) {
    const current = merged.get(item.type);
    merged.set(item.type, current ? { ...item, ...current, title: current.title || item.title, reason: current.reason || item.reason } : item);
  }

  return [...merged.values()].sort((left, right) => reviewRank(left.type) - reviewRank(right.type));
}

function orderedArtifacts(library: TeacherArtifactLibrary): TeacherArtifact[] {
  return REVIEW_TYPE_ORDER.flatMap((type) => (library[type] ? [library[type] as TeacherArtifact] : []));
}

function reviewRank(type: string): number {
  const index = REVIEW_TYPE_ORDER.indexOf(type as TeacherArtifactType);
  return index === -1 ? REVIEW_TYPE_ORDER.length + 1 : index;
}

function createArtifact(
  artifact: Omit<TeacherArtifact, 'id' | 'markdown'>,
): TeacherArtifact {
  return {
    ...artifact,
    id: `teacher-${artifact.type.toLowerCase()}`,
    markdown: buildMarkdown(artifact),
  };
}

function buildMarkdown(artifact: Omit<TeacherArtifact, 'id' | 'markdown'>): string {
  const outline = artifact.outline.length ? `## Quick Outline\n${artifact.outline.map((item) => `- ${item}`).join('\n')}\n\n` : '';
  const sections = artifact.sections
    .map((section) => `## ${section.heading}\n${section.body}`)
    .join('\n\n');
  const links = artifact.links.length
    ? `\n\n## Related Links\n${artifact.links.map((link) => `- [${link.title}](${link.url}) · ${link.meta}`).join('\n')}`
    : '';

  return `# ${artifact.title}\n\n> ${artifact.summary}\n\n${outline}${sections}${links}\n`;
}

function buildLessonFlow(results: GenerateResults | null, knowledgeName: string): string {
  const firstSection = results?.document?.document.sections[0]?.heading ?? `拆解 ${knowledgeName} 的关键步骤`;
  const exerciseStem = results?.exercise?.questions[0]?.stem ?? '用 1 道低门槛题检验学生是否重新建立直觉';
  const animationScene = results?.visual?.animation.scene ?? '步骤动画演示';
  const codeReview = results?.code?.code_samples[0]?.filename ?? '伪代码走查';

  return [
    `1. 导入：回看学生近期错因，确认今天只解决一个关键障碍。`,
    `2. 讲解：${firstSection}`,
    `3. 可视化：${animationScene}`,
    `4. 例子：${codeReview}`,
    `5. 回收：${exerciseStem}`,
  ].join('\n');
}

function buildSlideSections(
  results: GenerateResults | null,
  knowledgeName: string,
  weakness: string[],
  reading?: SupplementalReadingResource,
): TeacherArtifactSection[] {
  const sections = results?.document?.document.sections ?? [];
  const scene = results?.visual?.animation.scene ?? '步骤演示';
  const question = results?.exercise?.questions[0]?.stem ?? '当堂检测';
  const slideBodies = [
    `封面：${knowledgeName} · 补救课`,
    `问题引入：${weakness[0] ?? '先把学生最近的错误说清楚'}`,
    `核心概念：${sections[0]?.heading ?? `理解 ${knowledgeName} 的关键概念`}`,
    `步骤拆解：${sections[1]?.heading ?? `把 ${knowledgeName} 过程拆开`}`,
    `动画页：${scene}`,
    `代码走查：${results?.code?.code_samples[0]?.filename ?? '保留给老师板书/演示'}`,
    `课堂检测：${question}`,
    `总结与作业：${reading?.title ?? '布置一份课后回看资源'}`,
  ];

  return slideBodies.map((body, index) => ({
    heading: `Slide ${String(index + 1).padStart(2, '0')}`,
    body,
  }));
}

function buildTalentPlanSections({
  knowledgeName,
  goal,
  weakness,
  blueprint,
}: {
  knowledgeName: string;
  goal: string;
  weakness: string[];
  blueprint: TalentPlanBlueprint;
}): TeacherArtifactSection[] {
  return [
    {
      heading: '培养愿景与毕业画像',
      body: [
        blueprint.vision,
        `当前老师目标：${goal}`,
        `当前知识点 ${knowledgeName} 会被放进完整培养链路中，作为阶段训练节点，而不是孤立的一次补救。`,
        `毕业画像：${blueprint.graduationProfile.join('；')}`,
      ].join('\n'),
    },
    {
      heading: '八学期 + 入学建档路线图',
      body: blueprint.semesterPlan
        .map((semester) =>
          [
            `${semester.stage}｜${semester.label} · ${semester.theme}`,
            `培养目标：${semester.target}`,
            `核心课程群：${semester.courses.join('、')}`,
            `工程训练：${semester.engineering.join('；')}`,
            `AI / 前沿：${semester.frontier.join('；')}`,
            `典型项目：${semester.project}`,
            `考核方式：${semester.assessment}`,
            `阶段产出：${semester.output}`,
          ].join('\n'),
        )
        .join('\n\n'),
    },
    {
      heading: '贯穿主线与运行机制',
      body: blueprint.continuousLanes
        .map((lane) => `【${lane.title}】${lane.items.join('；')}`)
        .join('\n'),
    },
    {
      heading: '前沿雷达运行机制',
      body: [
        `节奏：${blueprint.radar.cadence}`,
        `信源桶：${blueprint.radar.sourceBuckets.join('；')}`,
        `课堂转化流程：${blueprint.radar.process.join(' -> ')}`,
      ].join('\n'),
    },
    {
      heading: '本期前沿雷达样本（截至 2026 年 6 月 10 日）',
      body: blueprint.radar.topics
        .map(
          (topic) =>
            `${topic.date}｜${topic.source}｜${topic.title}\n关键信号：${topic.signal}\n课堂动作：${topic.classroomAction}\n项目映射：${topic.projectMapping}`,
        )
        .join('\n\n'),
    },
    {
      heading: '贯穿式编码实战与创新探索',
      body: [
        `项目梯度：${blueprint.innovation.ladders.join('；')}`,
        `创新探索：${blueprint.innovation.arenas.join('；')}`,
        `老师角色：${blueprint.innovation.teacherRole.join('；')}`,
      ].join('\n'),
    },
    {
      heading: '评估、作品集与毕业要求',
      body: [
        `评估维度：${blueprint.assessment.dimensions.join('、')}`,
        `阶段检查点：${blueprint.assessment.checkpoints.join('；')}`,
        `作品集清单：${blueprint.assessment.portfolio.join('；')}`,
        `当前重点风险：${weakness[0] ?? '先把短板讲透再升级难度'}`,
      ].join('\n'),
    },
    {
      heading: '毕业出口与分流建议',
      body: blueprint.exits
        .map(
          (exit) =>
            `【${exit.title}】适配：${exit.fit}\n关键动作：${exit.milestones.join('；')}\n需要拿得出的成果：${exit.deliverables.join('；')}`,
        )
        .join('\n\n'),
    },
  ];
}

function buildTalentPlanBlueprint({
  knowledgeName,
  focus,
  currentPractice,
  currentVisualization,
  currentAssessment,
  frontierReading,
  frontierVideo,
}: {
  knowledgeName: string;
  focus: string;
  currentPractice: string;
  currentVisualization: string;
  currentAssessment: number;
  frontierReading: string;
  frontierVideo: string;
}): TalentPlanBlueprint {
  const direction = resolveProgramDirection(knowledgeName, focus);
  const anchor = focus || knowledgeName;

  return {
    kind: 'talent-plan',
    direction,
    vision: `面向 ${direction}，目标不是只把学生训练成“会做题的人”，而是从新生入学开始，逐步形成“计算基础 + 工程能力 + AI-native 开发 + 创新表达 + 职业适应”五层能力，并把 ${anchor} 这类知识点持续挂进完整训练链路。`,
    graduationProfile: [
      '基础层：能把核心概念讲清楚、写出来、调出来',
      '工程层：能在协作环境里完成需求拆解、编码、测试与交付',
      '智能层：理解主流大模型、RAG、Agent、MCP 等技术如何进入真实开发',
      '表达层：能把设计决策、实验结果和项目价值说清楚',
      '职业层：对就业、考研、科研、创业至少一条出口有明确准备',
    ],
    semesterPlan: [
      {
        id: 'onboarding',
        stage: 'STAGE 00',
        label: '新生入学',
        theme: '专业认知与学习建档',
        target: '先把“为什么学、怎么学、用什么学”说清楚，避免学生刚入门就被抽象课程劝退。',
        courses: ['专业导论', '计算思维导入', '工具与信息素养'],
        engineering: ['开发环境搭建', 'Git / Markdown / CLI 上手', `${currentVisualization} 观察记录`],
        frontier: ['理解大模型能做什么与不能做什么', '建立“追官方文档而不是追热词”的习惯'],
        project: '完成一个低门槛程序热身任务或算法可视化观察作业。',
        assessment: `完成 1 份学习画像、1 次工具上手检查和 ${currentAssessment} 道零压力诊断题。`,
        output: '学习画像 / 工具清单 / 热身代码 / 反思日志',
      },
      {
        id: 'year1-fall',
        stage: 'STAGE 01',
        label: '大一上',
        theme: '编程基础与计算思维',
        target: '建立变量、分支、循环、函数、调试和问题拆解的底层直觉。',
        courses: ['程序设计基础', '离散数学基础', '数字逻辑入门'],
        engineering: ['调试器入门', '单文件脚本规范', '读懂报错与日志'],
        frontier: ['每月阅读 1 次模型 / 工具官方更新摘要', '知道模型能力、工具能力、协议能力不是一回事'],
        project: '完成一个控制台工具或小游戏，第一次做出“需求 -> 编码 -> 调试”的闭环。',
        assessment: '以上机、代码讲解和错因复盘为主，避免只看卷面分数。',
        output: '基础代码集 / Debug 记录 / 周练周报',
      },
      {
        id: 'year1-spring',
        stage: 'STAGE 02',
        label: '大一下',
        theme: '数据结构与算法启蒙',
        target: '把抽象结构变成图解、步骤和代码，建立“概念 -> 图解 -> 代码 -> 复盘”的习惯。',
        courses: ['数据结构', '算法基础', '计算机组成基础'],
        engineering: ['可视化讲解记录', '复杂度表达', '单元级题解复盘'],
        frontier: ['用官方示例理解代码助手的边界', '区分“能生成代码”和“理解算法”'],
        project: `围绕 ${anchor} 这类知识点完成 1 套讲义 + 1 段演示 + 1 次代码走查。`,
        assessment: '以课堂讲解、上机实现和口头复盘并行，避免只刷题不解释。',
        output: '算法题解册 / 可视化脚本 / 错题复盘卡',
      },
      {
        id: 'year2-fall',
        stage: 'STAGE 03',
        label: '大二上',
        theme: '面向对象与数据管理',
        target: '从“会写一个程序”升级到“会组织代码、建模对象和持久化数据”。',
        courses: ['面向对象程序设计', '数据库系统', '操作系统基础'],
        engineering: ['模块划分', '数据库建模', '接口和异常处理'],
        frontier: ['开始接触 API / SDK 文档', '理解智能应用需要数据、接口与权限边界'],
        project: '完成一个带数据库的课程项目，第一次做真正可演示的小系统。',
        assessment: '通过建模说明、代码规范检查、接口联调和 Demo 演示综合打分。',
        output: 'ER 图 / API 文档 / 可运行课程项目',
      },
      {
        id: 'year2-spring',
        stage: 'STAGE 04',
        label: '大二下',
        theme: '软件工程与协作交付',
        target: '把协作、测试、评审和持续交付纳入日常，形成工程化工作流。',
        courses: ['软件工程', '计算机网络', '软件测试', '设计模式'],
        engineering: ['Git 分支协作', 'Code Review', '单元测试 / 日志 / CI 基础'],
        frontier: ['开始比较不同模型在编码和评测任务中的表现', '建立“需求 - 代理 - 工具 - 评测”最小闭环'],
        project: `每两周完成 1 次编码实战，先用 ${currentPractice} 这类示例走查，再切到团队项目。`,
        assessment: '以需求拆解、任务认领、测试覆盖、交付节奏和复盘质量共同评估。',
        output: '团队仓库 / 测试报告 / 迭代周报 / Sprint 复盘',
      },
      {
        id: 'year3-fall',
        stage: 'STAGE 05',
        label: '大三上',
        theme: '智能开发与模型接入',
        target: '把大模型能力真正接入软件工程主线，而不是零散体验几次 AI 工具。',
        courses: ['人工智能导论', '机器学习基础', '信息检索', '云开发基础'],
        engineering: ['模型调用', 'Prompt 设计', 'RAG 基础实验', '评测脚本'],
        frontier: ['跟踪 GPT / Claude / Gemini 的官方能力变化', `用 ${frontierVideo} 做前沿导读`],
        project: '完成 1 个带模型能力的应用原型，如知识助手、代码辅学工具或文档问答系统。',
        assessment: `每学期至少完成 1 次模型接入、1 次评测对比与 ${currentAssessment} 道课堂回收题。`,
        output: '模型调用 Demo / 实验记录 / AI 应用原型',
      },
      {
        id: 'year3-spring',
        stage: 'STAGE 06',
        label: '大三下',
        theme: 'Agent 系统与创新探索',
        target: '进入多代理、工具调用、MCP、评测与可靠性问题，开始做真正有辨识度的专题项目。',
        courses: ['智能系统设计', '大数据与知识工程', '人机交互', '创新创业实践'],
        engineering: ['Agent 编排', '工具调用', 'MCP / 上下文协议', '可靠性与安全边界'],
        frontier: ['跟踪协议与平台生态', `把 ${frontierReading} 改造成专题 Lab 或课程设计素材`],
        project: '完成 1 个 Agent 工作流或智能教具型项目，强调多轮任务、工具接入和可解释性。',
        assessment: '通过专题汇报、可运行原型、评测报告和开源协作痕迹进行综合评估。',
        output: 'Agent 原型 / 评测报告 / 开源贡献 / 中期作品集',
      },
      {
        id: 'year4-fall',
        stage: 'STAGE 07',
        label: '大四上',
        theme: '毕设选题与职业定向',
        target: '把前面三年的知识、工程训练和 AI 能力压缩成明确的毕设方向与毕业出口计划。',
        courses: ['毕业设计开题', '专业选修专题', '实习实践'],
        engineering: ['系统设计文档', '技术选型说明', '实习任务对齐'],
        frontier: ['判断哪些新技术值得进毕设，哪些只适合做背景调研', '把前沿变化写进开题依据而不是口号'],
        project: '完成开题答辩、技术路线图和作品集初版，开始和实习或研究方向并轨。',
        assessment: '以开题质量、计划可执行性、Demo 雏形和作品集组织程度评估。',
        output: '开题报告 / 技术路线图 / 作品集初版 / 实习周报',
      },
      {
        id: 'year4-spring',
        stage: 'STAGE 08',
        label: '大四下',
        theme: '毕业交付与多出口收束',
        target: '确保学生毕业时不只“完成毕设”，还真正拿得出可演示、可讲述、可投递的成果。',
        courses: ['毕业设计答辩', '职业发展训练', '科研 / 创业延展'],
        engineering: ['最终系统联调', '性能与稳定性检查', '答辩演示脚本'],
        frontier: ['对接真实岗位、研究课题或创业场景的最新需求', '学会把新技术判断放进最终交付决策'],
        project: '完成毕设终稿、答辩 Demo、岗位投递包或研究申请包。',
        assessment: '以毕业答辩、作品集质量、项目复盘与目标出口匹配度综合判定。',
        output: '毕业设计 / Demo 视频 / 技术复盘 / 简历或申请材料',
      },
    ],
    continuousLanes: [
      {
        title: '基础课程群主线',
        label: 'Curriculum spine',
        items: [
          '程序设计、数据结构、算法、系统基础稳步推进',
          '每门课都要求从“会做题”升级到“能讲清楚 + 能复盘”',
          '关键知识点沉淀为讲义、图解、代码、检测四件套',
        ],
      },
      {
        title: '工程训练主线',
        label: 'Engineering spine',
        items: [
          '从单文件脚本到多人仓库协作逐级升级',
          'Code Review、测试、日志、CI/CD 逐步进入日常',
          '每学期都有能展示工程过程而不只是结果的项目节点',
        ],
      },
      {
        title: 'AI / Agent 雷达主线',
        label: 'Radar spine',
        items: [
          '月度跟踪模型发布、SDK、协议和应用范式变化',
          '每次更新都必须落到讲义、Lab、专题讨论或项目改版',
          '把模型、工具、数据、协议之间的关系持续讲清楚',
        ],
      },
      {
        title: '评估与作品集主线',
        label: 'Portfolio spine',
        items: [
          '每季度至少一次项目复盘，每学年至少一次作品集盘点',
          '学习画像、题目表现、项目质量和前沿理解共同回写预警',
          '老师端据此决定补课、拔高或出口分流动作',
        ],
      },
    ],
    radar: {
      cadence: '每月 1 次官方更新扫描 + 双周 1 次课堂转化讨论 + 每学期 1 次专题 Lab',
      sourceBuckets: [
        '模型发布 / System card / 官方博客',
        '开发工具 / SDK / Agent 平台',
        '开放协议 / MCP / 基础设施',
        '行业落地 / 可迁移的教育与编码场景',
      ],
      process: [
        '收集官方一手信息',
        '判断与课程目标、项目阶段的关系',
        '改写为讲义、对比实验、Lab 或课堂辩论',
        '回收到项目题库、作品集和毕业设计方向',
      ],
      topics: [
        {
          date: '2026-04-24',
          source: 'OpenAI',
          title: 'GPT-5.5 上线 API，强化真实工作流与 agentic coding',
          signal: '模型越来越强调长程任务、工具使用和真实生产力，而不是只比单题分数。',
          classroomAction: '安排官方发布解读，讨论“编码助手如何进入软件工程课程”而不是只看生成结果。',
          projectMapping: '把编码助理评测、代码审阅和长任务拆解纳入大三 AI 项目或大二工程化课程。',
        },
        {
          date: '2026-04-15',
          source: 'OpenAI',
          title: 'Agents SDK 更新，支持 files / commands / code edit / long-horizon tasks',
          signal: 'Agent 开发正在从“聊天接口”转向“带工具、带状态、可执行”的工程框架。',
          classroomAction: '在大三阶段安排 1 次 Agent SDK 或等价框架对比，讲清楚工具调用、审批与追踪。',
          projectMapping: '把多工具工作流、自动代码修改和任务恢复设计成课程 Lab 或专题项目。',
        },
        {
          date: '2026-05-28',
          source: 'Anthropic',
          title: 'Claude Opus 4.8 强化 coding、agentic tasks 与长上下文协作',
          signal: '模型能力继续往可靠执行和长任务协作走，课程评估也应更重视端到端完成度。',
          classroomAction: '把“单点问答”改成“多轮任务完成 + 证据链复盘”的课堂任务形式。',
          projectMapping: '在工程课中加入长任务评测、浏览器 / 文件工具协作和可靠性检查。',
        },
        {
          date: '2025-12-09',
          source: 'Anthropic / Linux Foundation AAIF',
          title: 'MCP 捐赠至 Agentic AI Foundation，协议层正式成为生态主线',
          signal: '未来课程不能只教模型调用，还要教开放协议、工具目录和系统互联。',
          classroomAction: '用 1 节专题课讲解 MCP、连接器、工具注册与安全边界。',
          projectMapping: '把工具接入、上下文协议和系统联动设计成 Agent 系统课程的基础作业。',
        },
        {
          date: '2026-05-19',
          source: 'Google I/O Developer Keynote',
          title: 'Google 明确从 assistive AI 转向 independent agents',
          signal: '主流平台都把 agent workflow 放进开发主线，说明这不是单家产品的短期热点。',
          classroomAction: '做一次“不同平台如何定义 agent 工作流”的课堂对照，训练学生看平台能力而非只看品牌。',
          projectMapping: '把平台选型、任务编排和开发者工作流比较写进课程设计说明。',
        },
        {
          date: '2026-04-30',
          source: 'Google',
          title: 'Gemini Embedding 2 支持统一多模态 embedding，适合 agentic multimodal RAG',
          signal: '多模态检索和文档 / 图像 / 音频统一语义空间正在成为新一代应用基础。',
          classroomAction: '安排 1 次多模态 RAG Lab，比较文本检索与统一 embedding 的差异。',
          projectMapping: '把知识库检索、文档问答、图像资料检索接到大三智能应用项目里。',
        },
      ],
    },
    innovation: {
      ladders: [
        '大一做基础编程与算法小作业',
        '大二做团队协作与工程化项目',
        '大三做 AI / Agent 专题应用',
        '大四做毕设、实习、科研或创业方向项目',
      ],
      arenas: [
        '开源项目参与',
        'Hackathon / 创新训练',
        '智能教具与自动评测',
        '知识图谱、RAG、Agent 工作流原型',
      ],
      teacherRole: [
        '不是只验收结果，而是持续审核“想法 -> 原型 -> 迭代 -> 复盘”的闭环',
        '把优秀项目沉淀为下一届课程样例与作品集模板',
        '把预警学生放回适合的项目梯度，而不是简单减少任务量',
      ],
    },
    assessment: {
      dimensions: ['知识掌握', '工程实践', '前沿理解', '创新表达', '协作与交付'],
      checkpoints: [
        '入学建档',
        '每月前沿雷达摘要',
        '每季度项目复盘',
        '每学年作品集评估',
        '毕业前终版交付审查',
      ],
      portfolio: [
        '学习画像',
        '周报 / 实验记录',
        '讲义与图解',
        'Lab 代码与测试报告',
        '项目 README 与 Demo 视频',
        '毕业作品集与技术复盘',
      ],
    },
    exits: [
      {
        title: '就业出口',
        fit: '面向软件开发、测试、数据开发、AI 应用工程等岗位。',
        milestones: ['项目经历职业化改写', '算法与工程面试并行', '实习任务复盘成可投递案例'],
        deliverables: ['简历', '岗位定制作品集', '项目 Demo', '技术复盘文档'],
      },
      {
        title: '考研出口',
        fit: '面向计算机、软件工程、人工智能等方向继续深造。',
        milestones: ['基础课体系化复盘', '科研兴趣点预选', '毕设与报考方向形成支撑关系'],
        deliverables: ['考研知识框架', '课程与毕设支撑材料', '研究计划初稿'],
      },
      {
        title: '科研出口',
        fit: '面向实验室、论文写作、开源研究项目与研究助理路径。',
        milestones: ['学术检索与阅读训练', '实验设计与评测规范', '从课程项目升级为可研究的问题'],
        deliverables: ['文献综述', '实验报告', '开源仓库', '论文或技术报告草稿'],
      },
      {
        title: '创业出口',
        fit: '面向 AI 产品原型、教育工具、开发效率工具等创业尝试。',
        milestones: ['场景验证', '原型快速迭代', '用户反馈闭环与价值叙述'],
        deliverables: ['MVP 原型', '路演材料', '用户访谈记录', '产品路线图'],
      },
    ],
  };
}

function buildKnowledgeLine(sections: DocumentSection[], knowledgeName: string): string {
  if (!sections.length) {
    return `从问题直觉到步骤拆解，再到课堂检测，围绕 ${knowledgeName} 完成一次短闭环。`;
  }
  return sections.slice(0, 4).map((section, index) => `${index + 1}. ${section.heading}`).join('\n');
}

function buildKeyPoint(sections: DocumentSection[], knowledgeName: string): string {
  if (!sections.length) {
    return `先让学生说清楚 ${knowledgeName} 的执行顺序，再进入代码层。`;
  }
  return sections.slice(0, 2).map((section) => `- ${section.heading}`).join('\n');
}

function buildCommonMistakes(questions: Question[], focus: string): string {
  if (!questions.length) {
    return focus ? `${focus}\n学生容易在这一步出现顺序混淆或边界漏写。` : '先抓顺序感，再抓边界条件。';
  }
  return questions.slice(0, 3).map((question) => `- ${question.explanation}`).join('\n');
}

function buildTeachingHints(rationale: Rationale, stepCount: number): string {
  const profileHint = rationale.matched_profile[0] ?? '默认采用分步骤、低干扰讲解。';
  const weaknessHint = rationale.addressed_weakness[0] ?? '优先把学生最容易卡住的动作拆出来。';
  return [
    profileHint,
    weaknessHint,
    stepCount > 0 ? `建议把动画控制在 ${stepCount} 个步骤内，每一步只说一个动作。` : '如果没有动画，就把板书节奏切成 3 到 5 个短步骤。',
  ].join('\n');
}

function resolveProgramDirection(knowledgeName: string, focus: string): string {
  const text = `${knowledgeName} ${focus}`.toLowerCase();
  if (text.includes('ai') || text.includes('模型') || text.includes('agent')) return '软件工程与智能应用方向';
  if (text.includes('graph') || text.includes('tree') || text.includes('算法') || text.includes('动态规划')) return '软件工程与智能编码方向';
  return '软件工程 / 编码类专业方向';
}

function buildDeliverableLinks(
  videos: SupplementalVideoResource[],
  readings: SupplementalReadingResource[],
): TeacherArtifactLink[] {
  return [
    ...videos.slice(0, 2).map(toVideoLink),
    ...readings.slice(0, 2).map(toReadingLink),
  ];
}

function buildTalentPlanLinks(
  supplemental: NonNullable<GenerateResults['supplemental']>,
): TeacherArtifactLink[] {
  return [
    {
      title: 'OpenAI · GPT-5.5',
      url: 'https://openai.com/index/introducing-gpt-5-5/',
      meta: '2026-04-24 · 本期雷达样本 / real work + agentic coding',
    },
    {
      title: 'OpenAI · Agents SDK',
      url: 'https://openai.com/index/the-next-evolution-of-the-agents-sdk/',
      meta: '2026-04-15 · 本期雷达样本 / files + commands + code edit',
    },
    {
      title: 'Anthropic · Claude Opus 4.8',
      url: 'https://www.anthropic.com/news/claude-opus-4-8',
      meta: '2026-05-28 · 本期雷达样本 / coding + agentic tasks',
    },
    {
      title: 'Anthropic · MCP to AAIF',
      url: 'https://www.anthropic.com/news/donating-the-model-context-protocol-and-establishing-of-the-agentic-ai-foundation',
      meta: '2025-12-09 · 本期雷达样本 / open protocol + ecosystem',
    },
    {
      title: 'Google · I/O 2026 Developer Keynote',
      url: 'https://developers.googleblog.com/all-the-news-from-the-google-io-2026-developer-keynote/',
      meta: '2026-05-19 · 本期雷达样本 / agents + developer platform',
    },
    {
      title: 'Google · Gemini Embedding 2',
      url: 'https://developers.googleblog.com/en/building-with-gemini-embedding-2/',
      meta: '2026-04-30 · 本期雷达样本 / multimodal RAG',
    },
    ...buildDeliverableLinks(supplemental.videos.slice(0, 1), supplemental.readings.slice(0, 1)),
  ];
}

function mapDocumentSections(sections: DocumentSection[]): TeacherArtifactSection[] {
  return sections.map((section) => ({
    heading: section.heading,
    body: shortenMultiline(section.body_md, 10),
  }));
}

function buildCodePreview(sample: CodeSample): string {
  const head = sample.code.split('\n').slice(0, 10).join('\n');
  return [
    `Complexity: ${sample.complexity.time} / ${sample.complexity.space}`,
    head,
  ].join('\n\n');
}

function collectWeakness(results: GenerateResults | null, focus: string): string[] {
  const rationaleWeakness = [
    ...(results?.document?.rationale.addressed_weakness ?? []),
    ...(results?.exercise?.rationale.addressed_weakness ?? []),
    ...(results?.visual?.rationale.addressed_weakness ?? []),
  ].filter(Boolean);

  return uniqueStrings([focus, ...rationaleWeakness]).slice(0, 4).length
    ? uniqueStrings([focus, ...rationaleWeakness]).slice(0, 4)
    : ['围绕当前知识点补一轮低负担解释与练习'];
}

function pickRationale(...items: Array<Rationale | null | undefined>): Rationale {
  return items.find(Boolean) ?? DEMO_RATIONALE;
}

function inferPrerequisites(knowledgeName: string, focus: string): string {
  if (focus) return `${focus}\n需要先把这个短板背后的基础概念讲清楚。`;
  return `建议先复习 ${knowledgeName} 的基础定义、顺序感与边界条件。`;
}

function shortenMultiline(text: string, maxLines: number): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n');
}

function lessonModeByRisk(risk: string): string {
  if (risk === 'high') return '先降负再建立直觉';
  if (risk === 'low') return '巩固后进入迁移';
  return '边讲边练，稳住节奏';
}

function toVideoLink(video: SupplementalVideoResource): TeacherArtifactLink {
  return {
    title: video.title,
    url: video.url,
    meta: `${video.up_name} · ${video.duration}`,
  };
}

function toReadingLink(reading: SupplementalReadingResource): TeacherArtifactLink {
  return {
    title: reading.title,
    url: reading.url,
    meta: reading.tags.slice(0, 2).join(' / '),
  };
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function isGenerateResults(value: unknown): value is GenerateResults {
  return Boolean(value && typeof value === 'object');
}
