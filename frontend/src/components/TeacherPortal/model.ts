import type { Rationale } from '../../types/resources';

export type TabKey = 'overview' | 'generator' | 'review' | 'intervention';
export type RunState = 'idle' | 'submitting' | 'running' | 'done' | 'error';

export type Student = {
  id: string;
  focus: string;
  mastery: number;
  risk: 'high' | 'medium' | 'low';
  evidence: string;
  action: string;
  knowledgeId: string;
  knowledgeName: string;
};

export type ReviewItem = {
  id: string;
  title: string;
  type: string;
  student: string;
  status: string;
  agent: string;
  reason: string;
  rationale: Rationale;
};

export const TAB_ITEMS: { key: TabKey; title: string; caption: string }[] = [
  { key: 'overview', title: 'Overview', caption: '班级风险与运行状态' },
  { key: 'generator', title: 'Generate', caption: '老师发起资源生产' },
  { key: 'review', title: 'Review', caption: '溯源、证据与审核' },
  { key: 'intervention', title: 'Intervene', caption: '闭环干预动作' },
];

export const CLASSES = [
  { name: '软件工程 2301', students: 42, risk: 6, progress: 78, status: '正常推进' },
  { name: '数据结构强化班', students: 36, risk: 11, progress: 64, status: '需要干预' },
  { name: 'AI 应用项目组', students: 18, risk: 3, progress: 83, status: '正常推进' },
];

export const STUDENTS: Student[] = [
  {
    id: 'stu_001',
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
  ['ProfileAgent', '画像同步', '抽取学生基础、偏好、短板与最近证据'],
  ['PlannerAgent', '任务编排', '拆成讲解、题目、代码、可视化任务'],
  ['DocumentAgent', '讲义生成', '输出可追溯 Markdown 讲解材料'],
  ['ExerciseAgent', '自适应题目', '按掌握度和短板调整难度'],
  ['CodeAgent', '代码案例', '生成 Python / Java 双语示例'],
  ['VisualAgent', '动画导图', '输出思维导图和步骤动画数据'],
  ['EvaluationAgent', '闭环评估', '把练习结果回写学习画像'],
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
