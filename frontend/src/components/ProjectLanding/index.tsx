import {
  MeshCardGrid,
  MeshMetricGrid,
  MeshSection,
  VercelMeshPage,
} from '../VercelMeshRecipe';

const LOG_LINES = [
  { scope: 'profile', text: 'loaded student context: 12 dimensions' },
  { scope: 'planner', text: 'split knowledge graph into adaptive tasks' },
  { scope: 'document', text: 'generated explanation with cited rationale' },
  { scope: 'visual', text: 'queued mindmap + animation script' },
  { scope: 'eval', text: 'closed loop: mastery delta synced' },
  { scope: 'status', text: 'ready on student / teacher' },
];

const FEATURES = [
  { title: '双端协同', body: '学生端负责探索与生成，老师端负责班级洞察、干预和质量审核。' },
  { title: '多 Agent 编排', body: '画像、规划、文档、题目、代码、可视化、评估各司其职，过程可追踪。' },
  { title: '可解释推荐', body: '每份资源都保留画像匹配、短板对应、难度调整和生成指纹。' },
];

const PIPELINE = [
  { eyebrow: '01', title: 'Profile Agent', body: '抽取学生画像、兴趣、基础和学习证据。' },
  { eyebrow: '02', title: 'Planner Agent', body: '把知识点拆成任务、资源和评估闭环。' },
  { eyebrow: '03', title: 'Teacher Console', body: '聚合班级风险、进度和推荐干预。' },
];

const METRICS = [
  { value: '7', label: '核心 Agent' },
  { value: '12', label: '画像维度' },
  { value: '2', label: '学生端 / 老师端' },
  { value: '1', label: '统一资源闭环' },
];

export function ProjectLanding() {
  return (
    <VercelMeshPage
      active="home"
      kicker="EduResource Agent / multi-agent learning platform"
      title={<>面向个性化学习的 <span>Agentic Resource OS</span></>}
      subtitle="一个把专业探索、学习资源生成、画像更新和教师干预连接起来的双端系统。学生端保持温暖、低门槛；老师端和官网采用 Vercel Mesh 风格，强调平台能力、可观测性和工程可信度。"
      primaryAction={{ label: '进入学生端', href: '#/student' }}
      secondaryAction={{ label: '查看老师端', href: '#/teacher' }}
      terminalTitle="deployment.log"
      logs={LOG_LINES}
      footer="EduResource Agent · Vercel Mesh website layer"
    >
      <MeshSection title="不是“AI 生成一份资料”，而是一条可观测的学习生产线。" eyebrow="/platform primitives">
        <MeshCardGrid cards={FEATURES} />
      </MeshSection>

      <MeshSection title="从学生输入到老师干预，保留每一步生产证据。" eyebrow="/agent pipeline">
        <MeshCardGrid cards={PIPELINE} />
      </MeshSection>

      <MeshSection title="系统规模被压缩成可演示、可解释、可落地的四个数字。" eyebrow="/metrics">
        <MeshMetricGrid metrics={METRICS} />
      </MeshSection>
    </VercelMeshPage>
  );
}
