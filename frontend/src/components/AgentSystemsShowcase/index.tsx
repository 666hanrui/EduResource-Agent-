import './agent-systems.css';

export type AgentSuiteId = 'exploration' | 'generation';

type AgentNode = {
  name: string;
  label: string;
  detail: string;
};

export type AgentSuite = {
  id: AgentSuiteId;
  surface: string;
  title: string;
  summary: string;
  footer: string;
  href: string;
  nodes: AgentNode[];
};

export const AGENT_SUITES: AgentSuite[] = [
  {
    id: 'exploration',
    surface: '学生端',
    title: '专业探索',
    summary: '',
    footer: '',
    href: '/register/student',
    nodes: [
      { name: 'MajorScopeAgent', label: 'Scope', detail: '专业范围' },
      { name: 'KnowledgeMapAgent', label: 'Map', detail: '知识地图' },
      { name: 'Profile12Agent', label: 'Profile12', detail: '12维画像' },
      { name: 'DirectionMatchAgent', label: 'Match', detail: '方向匹配' },
      { name: 'GapDiagnosisAgent', label: 'Gap', detail: '短板诊断' },
      { name: 'SnailPathAgent', label: 'Path', detail: '蜗牛路径' },
      { name: 'CoachReportAgent', label: 'Coach', detail: '报告教练' },
    ],
  },
  {
    id: 'generation',
    surface: '老师端',
    title: '资源生成',
    summary: '',
    footer: '',
    href: '/register/teacher',
    nodes: [
      { name: 'ProfileAgent', label: 'Profile', detail: '画像证据' },
      { name: 'PlannerAgent', label: 'Planner', detail: '任务拆解' },
      { name: 'DocumentAgent', label: 'Document', detail: '讲解材料' },
      { name: 'ExerciseAgent', label: 'Exercise', detail: '自适应题' },
      { name: 'VisualAgent', label: 'Visual', detail: '图解动画' },
      { name: 'CodeAgent', label: 'Code', detail: '双语案例' },
      { name: 'EvaluationAgent', label: 'Evaluation', detail: '闭环评估' },
    ],
  },
];

interface AgentSystemsShowcaseProps {
  activeSuiteId?: AgentSuiteId;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  framed?: boolean;
  className?: string;
  suites?: AgentSuite[];
}

export function AgentSystemsShowcase({
  activeSuiteId,
  eyebrow,
  title,
  subtitle,
  framed = false,
  className,
  suites = AGENT_SUITES,
}: AgentSystemsShowcaseProps) {
  const classes = [
    'agent-systems-showcase',
    framed ? 'is-framed' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <section className={classes} aria-label="双套多 Agent 展示">
      {(eyebrow || title || subtitle) && (
        <div className="agent-systems-showcase__head">
          {eyebrow ? <span className="agent-systems-showcase__eyebrow">{eyebrow}</span> : null}
          {title ? <h2 className="agent-systems-showcase__title">{title}</h2> : null}
          {subtitle ? <p className="agent-systems-showcase__subtitle">{subtitle}</p> : null}
        </div>
      )}

      <div className="agent-systems-showcase__grid">
        {suites.map((suite) => {
          const isActive = suite.id === activeSuiteId;

          return (
            <article
              className={isActive ? 'agent-suite-card is-active' : 'agent-suite-card'}
              key={suite.id}
            >
              <div className="agent-suite-card__top">
                <div>
                  <span className="agent-suite-card__surface">{suite.surface}</span>
                  <h3>{suite.title}</h3>
                </div>
                <span className="agent-suite-card__count">{suite.nodes.length} agents</span>
              </div>

              {suite.summary ? <p className="agent-suite-card__summary">{suite.summary}</p> : null}

              <div className="agent-suite-card__flow">
                {suite.nodes.map((node, index) => (
                  <div className="agent-suite-pill" key={node.name}>
                    <span className="agent-suite-pill__index">{String(index + 1).padStart(2, '0')}</span>
                    <div className="agent-suite-pill__body">
                      <strong>{node.label}</strong>
                      <span>{node.detail}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="agent-suite-card__footer">
                {suite.footer ? <span>{suite.footer}</span> : null}
                <a href={suite.href}>进入</a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
