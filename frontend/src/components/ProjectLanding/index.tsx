import '../../vercel-mesh.css';

const LOG_LINES = [
  ['profile', 'loaded student context: 12 dimensions'],
  ['planner', 'split knowledge graph into adaptive tasks'],
  ['document', 'generated explanation with cited rationale'],
  ['visual', 'queued mindmap + animation script'],
  ['eval', 'closed loop: mastery delta synced'],
];

const FEATURES = [
  ['双端协同', '学生端负责探索与生成，老师端负责班级洞察、干预和质量审核。'],
  ['多 Agent 编排', '画像、规划、文档、题目、代码、可视化、评估各司其职，过程可追踪。'],
  ['可解释推荐', '每份资源都保留画像匹配、短板对应、难度调整和生成指纹。'],
];

const PIPELINE = [
  ['01', 'Profile Agent', '抽取学生画像、兴趣、基础和学习证据。'],
  ['02', 'Planner Agent', '把知识点拆成任务、资源和评估闭环。'],
  ['03', 'Teacher Console', '聚合班级风险、进度和推荐干预。'],
];

export function ProjectLanding() {
  return (
    <div className="mesh-page">
      <div className="mesh-shell">
        <MeshNav active="home" />
        <main className="mesh-main">
          <section className="mesh-hero">
            <div>
              <div className="mesh-kicker"><span className="mesh-pulse" /> EduResource Agent / multi-agent learning platform</div>
              <h1 className="mesh-title">面向个性化学习的 <span>Agentic Resource OS</span></h1>
              <p className="mesh-subtitle">
                一个把专业探索、学习资源生成、画像更新和教师干预连接起来的双端系统。学生端保持温暖、低门槛；老师端和官网采用 Vercel Mesh 风格，强调平台能力、可观测性和工程可信度。
              </p>
              <div className="mesh-actions">
                <a className="mesh-primary-button" href="#/student">进入学生端</a>
                <a className="mesh-ghost-button" href="#/teacher">查看老师端</a>
              </div>
            </div>
            <Terminal />
          </section>

          <section className="mesh-section" id="features">
            <div className="mesh-section-head">
              <h2>不是“AI 生成一份资料”，而是一条可观测的学习生产线。</h2>
              <span className="mesh-mono">/platform primitives</span>
            </div>
            <div className="mesh-grid-3">
              {FEATURES.map(([title, body]) => (
                <article className="mesh-card" key={title}>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mesh-section" id="pipeline">
            <div className="mesh-section-head">
              <h2>从学生输入到老师干预，保留每一步生产证据。</h2>
              <span className="mesh-mono">/agent pipeline</span>
            </div>
            <div className="mesh-grid-3">
              {PIPELINE.map(([index, title, body]) => (
                <article className="mesh-panel" key={title}>
                  <small>{index}</small>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="mesh-section">
            <div className="mesh-metric-grid">
              <div className="mesh-metric"><strong>7</strong><span>核心 Agent</span></div>
              <div className="mesh-metric"><strong>12</strong><span>画像维度</span></div>
              <div className="mesh-metric"><strong>2</strong><span>学生端 / 老师端</span></div>
              <div className="mesh-metric"><strong>1</strong><span>统一资源闭环</span></div>
            </div>
          </section>
        </main>
        <footer className="mesh-footer">EduResource Agent · Vercel Mesh website layer</footer>
      </div>
    </div>
  );
}

function Terminal() {
  return (
    <div className="mesh-terminal">
      <div className="mesh-terminal-bar">
        <div className="mesh-dots"><span /><span /><span /></div>
        <span>deployment.log</span>
      </div>
      <div className="mesh-terminal-body">
        {LOG_LINES.map(([scope, text]) => (
          <div className="mesh-log-line" key={scope}>
            <strong>{scope}</strong>
            <span><span className="mesh-log-ok">✓</span> {text}</span>
          </div>
        ))}
        <div className="mesh-log-line">
          <strong>status</strong>
          <span>ready on <span className="mesh-log-ok">student</span> / <span className="mesh-log-ok">teacher</span></span>
        </div>
      </div>
    </div>
  );
}

export function MeshNav({ active }: { active: 'home' | 'teacher' }) {
  return (
    <nav className="mesh-nav">
      <a className="mesh-brand" href="#/">
        <span className="mesh-brand-mark">E</span>
        <span>EduResource Agent</span>
      </a>
      <div className="mesh-nav-links">
        <a className={active === 'home' ? 'mesh-nav-link is-active' : 'mesh-nav-link'} href="#/">官网</a>
        <a className="mesh-nav-link" href="#/student">学生端</a>
        <a className={active === 'teacher' ? 'mesh-nav-link is-active' : 'mesh-nav-link'} href="#/teacher">老师端</a>
      </div>
    </nav>
  );
}
