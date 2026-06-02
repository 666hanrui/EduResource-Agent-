import {
  MeshCardGrid,
  MeshMetricGrid,
  MeshSection,
  VercelMeshPage,
} from '../VercelMeshRecipe';

const LOG_LINES = [
  { scope: 'recipe', text: 'loaded style recipe: vercel-mesh' },
  { scope: 'palette', text: 'ground #000 · surface #0A0A0A · hairline rgba(255,255,255,.08)' },
  { scope: 'mesh', text: 'cyan → magenta → orange, low saturation, feathered to black' },
  { scope: 'runtime', text: 'teacher console ready: generate / review / intervene' },
  { scope: 'trace', text: 'resource rationale and agent fingerprint enabled' },
  { scope: 'status', text: 'homepage + teacher portal locked to Vercel Mesh' },
];

const FEATURES = [
  {
    eyebrow: 'platform',
    title: 'Teacher-first control surface',
    body: '老师端承担资源生成、证据审核和干预闭环，不再只是静态后台看板。',
  },
  {
    eyebrow: 'observability',
    title: 'Every resource has a fingerprint',
    body: '画像匹配、短板对应、难度调整、Agent 名称、Prompt 版本和引用来源都保留。',
  },
  {
    eyebrow: 'agentic',
    title: 'Seven agents, one visible pipeline',
    body: '画像、规划、文档、题目、代码、可视化和评估形成一条可观察的资源生产线。',
  },
];

const PIPELINE = [
  { eyebrow: '01 / profile', title: 'Profile Agent', body: '读取学生画像、掌握度、偏好与短板证据。' },
  { eyebrow: '02 / plan', title: 'Planner Agent', body: '把知识点拆成可生成、可审核、可评估的资源任务。' },
  { eyebrow: '03 / resource', title: 'Resource Agents', body: '并行生成讲解、练习、代码和可视化资源。' },
  { eyebrow: '04 / teacher', title: 'Teacher Console', body: '老师审核资源依据，确认后进入干预闭环。' },
];

const METRICS = [
  { value: '1', label: 'vendored recipe' },
  { value: '7', label: 'agent pipeline' },
  { value: '4', label: 'teacher modules' },
  { value: '91%', label: 'traceable outputs' },
];

export function ProjectLanding() {
  return (
    <VercelMeshPage
      active="home"
      kicker="Vercel Mesh recipe / teacher resource studio"
      title={<>Personalized learning resources, <span>with teacher-grade evidence.</span></>}
      subtitle="首页与老师端统一采用 ConardLi/garden-skills 的 vercel-mesh recipe：纯黑底、单一渐变 Mesh、hairline 细节、mono 日志和高对比白色 CTA。学生端保持原有交互不变。"
      primaryAction={{ label: 'Open teacher console', href: '#/teacher' }}
      secondaryAction={{ label: 'Open student app', href: '#/student' }}
      terminalTitle="vercel-mesh.recipe.log"
      logs={LOG_LINES}
      footer="EduResource Agent · homepage and teacher portal use vendored vercel-mesh recipe"
    >
      <MeshSection title="A black-and-white platform surface, broken by one controlled mesh." eyebrow="/recipe/signature">
        <MeshCardGrid cards={FEATURES} />
      </MeshSection>

      <MeshSection title="From student evidence to teacher-approved resources." eyebrow="/agent-pipeline">
        <MeshCardGrid cards={PIPELINE} columns={2} />
      </MeshSection>

      <MeshSection title="The demo is compressed into four visible system numbers." eyebrow="/metrics">
        <MeshMetricGrid metrics={METRICS} />
      </MeshSection>
    </VercelMeshPage>
  );
}
