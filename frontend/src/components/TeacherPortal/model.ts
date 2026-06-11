import type { Rationale } from '../../types/resources';

export type TabKey = 'overview' | 'generator' | 'review' | 'intervention';
export type RunState = 'idle' | 'submitting' | 'running' | 'done' | 'error';

export type TeacherContext = {
  teacher_id: string;
  display_name: string;
  subject: string;
  teaching_style: string[];
  resource_preferences: string[];
};

export type ClassProfile = {
  class_id: string;
  teacher_id?: string;
  name: string;
  students: number;
  risk: number;
  progress: number;
  status: string;
  mastery_trend?: number[];
};

export type Student = {
  id: string;
  class_id?: string;
  focus: string;
  mastery: number;
  risk: 'high' | 'medium' | 'low';
  evidence: string;
  action: string;
  knowledgeId: string;
  knowledgeName: string;
};

export type TeacherStudentSnapshot = {
  id: string;
  class_id: string;
  focus: string;
  mastery: number;
  risk: 'high' | 'medium' | 'low';
  evidence: string;
  action: string;
  knowledge_id: string;
  knowledge_name: string;
};

export type ReviewItem = {
  id: string;
  package_id?: string;
  title: string;
  type: string;
  student: string | null;
  status: string;
  agent: string;
  reason: string;
  rationale: Rationale;
};

export type TeacherTeachingPackage = {
  id: string;
  teacher_id: string;
  class_id: string;
  target_student_id: string | null;
  title: string;
  target_knowledge_id: string;
  target_knowledge_name: string;
  teaching_goal: string;
  status: string;
  results: unknown | null;
};

export type TeacherGenerationJob = {
  job_id: string;
  teacher_id: string;
  class_id: string;
  target_student_id: string | null;
  teaching_package_id: string;
  generate_task_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  message: string;
  results: unknown | null;
  review_items: ReviewItem[];
};

export type TeacherDashboard = {
  teacher_context: TeacherContext;
  classes: ClassProfile[];
  active_class: ClassProfile;
  attention_queue: TeacherStudentSnapshot[];
  recent_packages: TeacherTeachingPackage[];
  review_items: ReviewItem[];
};

export type TeacherIndustryCourseReport = {
  course: string;
  hours: number;
  lessons: number;
  requirements: string[];
  student_outcomes: string[];
  frontier_signals: string[];
  job_sample_count: number;
  source_files: string[];
  industries: string[];
  roles: string[];
  top_keywords: string[];
  salary: {
    label: string;
    min: number | null;
    max: number | null;
    average: number | null;
  };
};

export type TeacherIndustrySummary = {
  program: string;
  source: {
    exists: boolean;
    path: string;
    industry_count: number;
    workbook_count: number;
    rows_scanned: number;
    label: string;
  };
  course_reports: TeacherIndustryCourseReport[];
  external_benchmarks: Array<{
    source: string;
    title: string;
    signal: string;
    url: string;
  }>;
};

export const TAB_ITEMS: { key: TabKey; title: string; caption: string }[] = [
  { key: 'overview', title: 'Overview', caption: '班级' },
  { key: 'generator', title: 'Generate', caption: '生成' },
  { key: 'review', title: 'Review', caption: '审核' },
  { key: 'intervention', title: 'Intervene', caption: '干预' },
];

export const CLASSES: ClassProfile[] = [
  { class_id: 'class-se-2301', teacher_id: 'tch_001', name: '软件工程 2301', students: 42, risk: 6, progress: 78, status: '正常推进' },
  { class_id: 'class-ds-boost', teacher_id: 'tch_001', name: '数据结构强化班', students: 36, risk: 11, progress: 64, status: '需要干预' },
  { class_id: 'class-ai-project', teacher_id: 'tch_001', name: 'AI 应用项目组', students: 18, risk: 3, progress: 83, status: '正常推进' },
];

export const STUDENTS: Student[] = [
  {
    id: 'stu_001',
    class_id: 'class-se-2301',
    focus: '链表 / 指针修改顺序',
    mastery: 72,
    risk: 'medium',
    evidence: '链表插入最近 3 题错 1 题，资源停留时间偏短',
    action: '补一组可视化步骤题',
    knowledgeId: 'linked-list-basics',
    knowledgeName: '链表',
  },
  {
    id: 'stu_018',
    class_id: 'class-ds-boost',
    focus: '二叉树遍历 / 递归栈',
    mastery: 51,
    risk: 'high',
    evidence: '递归调用顺序连续 2 次错误，EvaluationAgent 标记为高风险',
    action: '生成低难度动画 + 安排代码走查',
    knowledgeId: 'binary-tree-traversal',
    knowledgeName: '二叉树遍历',
  },
  {
    id: 'stu_026',
    class_id: 'class-ds-boost',
    focus: '动态规划入门 / 状态转移',
    mastery: 67,
    risk: 'medium',
    evidence: '能写出递推式，但初始化边界漏写频繁',
    action: '降低题目梯度，先推 2 道填空题',
    knowledgeId: 'dynamic-programming',
    knowledgeName: '动态规划',
  },
  {
    id: 'stu_033',
    class_id: 'class-ai-project',
    focus: '图算法 BFS / 队列过程',
    mastery: 86,
    risk: 'low',
    evidence: '掌握度稳定，适合进入挑战任务',
    action: '推荐挑战任务',
    knowledgeId: 'graph-algorithms',
    knowledgeName: '图算法 BFS',
  },
];

export const AGENTS = [
  ['ProfileAgent', '画像同步', '画像'],
  ['PlannerAgent', '任务编排', '编排'],
  ['DocumentAgent', '讲义生成', '讲义'],
  ['ExerciseAgent', '自适应题目', '题目'],
  ['CodeAgent', '代码案例', '代码'],
  ['VisualAgent', '动画导图', '动画'],
  ['EvaluationAgent', '闭环评估', '回写'],
];

export const DEMO_RATIONALE: Rationale = {
  matched_profile: ['学习风格：偏好图解 + 分步骤讲解', '资源偏好：需要动画和代码案例同时出现'],
  addressed_weakness: ['历史易错点：指针修改顺序', '最近答题证据：链表插入题漏掉 prev.next 连接'],
  difficulty_adjusted_from: 3,
  difficulty_used: 2,
  agent_name: 'DocumentAgent',
  prompt_version: 'document_agent_v1',
  model_name: 'Spark X2',
  cited_sources: [{ title: '数据结构课程讲义：线性表与链表', page: '127-130', similarity: 0.89 }],
};
