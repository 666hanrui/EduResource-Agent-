import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import './cinematic-resource.css';

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'active' | 'success';
}

const HERO_IMAGE = 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=2400&q=88';

const PLATES = [
  {
    className: 'cinematic-plate cinematic-plate--a',
    src: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=85',
    label: 'Profile Map',
  },
  {
    className: 'cinematic-plate cinematic-plate--b',
    src: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1000&q=85',
    label: 'Teacher Review',
  },
  {
    className: 'cinematic-plate cinematic-plate--c',
    src: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=85',
    label: 'Resource Studio',
  },
  {
    className: 'cinematic-plate cinematic-plate--d',
    src: 'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1600&q=85',
    label: 'Agent Trace',
  },
];

const CAPABILITY_ROWS = [
  {
    num: '01',
    title: <>Major-first <em>exploration</em></>,
    meta: 'Student Onboarding',
    year: 'No resume required',
    count: '12 dimensions',
    thumb: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=600&q=80',
    href: '#/student',
  },
  {
    num: '02',
    title: <>Teacher-grade <em>resource studio</em></>,
    meta: 'Teacher Console',
    year: 'Generate / Review / Deploy',
    count: '4 modules',
    thumb: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=600&q=80',
    href: '#/teacher',
  },
  {
    num: '03',
    title: <>Visible seven-agent <em>DAG</em></>,
    meta: 'Agent Runtime',
    year: 'Profile → Evaluation',
    count: '7 agents',
    thumb: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=600&q=80',
    href: '#pipeline',
  },
  {
    num: '04',
    title: <>Rationale and <em>fingerprint</em></>,
    meta: 'Evidence Layer',
    year: 'Prompt / Profile / Source',
    count: 'full trace',
    thumb: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80',
    href: '#evidence',
  },
  {
    num: '05',
    title: <>Closed-loop <em>intervention</em></>,
    meta: 'Teaching Loop',
    year: 'Action → Feedback',
    count: 'live monitor',
    thumb: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=80',
    href: '#cases',
  },
];

const INITIAL_NODES: AgentNode[] = [
  { id: 'profile', name: 'Profile Agent', role: '学生画像与证据读取', status: 'idle' },
  { id: 'planner', name: 'Planner Agent', role: 'DAG 任务拆解', status: 'idle' },
  { id: 'doc', name: 'Document Agent', role: '个性化讲解生成', status: 'idle' },
  { id: 'exercise', name: 'Exercise Agent', role: '自适应题目生成', status: 'idle' },
  { id: 'visual', name: 'Visual Agent', role: '图解与动画资源', status: 'idle' },
  { id: 'code', name: 'Code Agent', role: '双语代码案例', status: 'idle' },
  { id: 'eval', name: 'Evaluation Agent', role: '闭环评估更新', status: 'idle' },
];

const PIPELINE_LOGS: Record<string, string[]> = {
  profile: [
    'ProfileAgent: 读取学生 12 维画像和薄弱证据。',
    'Evidence: 递归调用顺序混淆，图解偏好更强。',
  ],
  planner: [
    'PlannerAgent: 生成资源 DAG，拆分讲解、题目、代码与可视化。',
    'Policy: 降低初始难度，保留老师审核溯源。',
  ],
  doc: ['DocumentAgent: 产出低认知负担讲解结构。'],
  exercise: ['ExerciseAgent: 生成 5 道自适应练习。'],
  visual: ['VisualAgent: 绑定思维导图和步骤动画。'],
  code: ['CodeAgent: 输出 Python / Java 双语代码。'],
  eval: ['EvaluationAgent: 汇总 rationale fingerprint 并回写学习画像。'],
};

export function ProjectLanding() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [activeStep, setActiveStep] = useState('idle');
  const [logs, setLogs] = useState<string[]>(['System: EduResource cinematic studio ready.']);

  useCinematicReveal();

  const triggerSimulation = () => {
    setActiveStep('profile');
    setNodes(INITIAL_NODES.map((node) => node.id === 'profile' ? { ...node, status: 'active' } : node));
    setLogs(['--- Triggering 7-Agent DAG ---', ...PIPELINE_LOGS.profile]);

    [
      { id: 'planner', delay: 1000 },
      { id: 'doc', delay: 2000 },
      { id: 'exercise', delay: 2800 },
      { id: 'visual', delay: 3600 },
      { id: 'code', delay: 4400 },
      { id: 'eval', delay: 5400 },
    ].forEach((step) => {
      window.setTimeout(() => {
        setActiveStep(step.id);
        setNodes((prev) => prev.map((node) => {
          if (node.id === step.id) return { ...node, status: 'active' };
          if (node.status === 'active') return { ...node, status: 'success' };
          return node;
        }));
        setLogs((prev) => [...prev, `[${step.id}]`, ...PIPELINE_LOGS[step.id]]);
      }, step.delay);
    });

    window.setTimeout(() => {
      setActiveStep('done');
      setNodes((prev) => prev.map((node) => ({ ...node, status: 'success' })));
      setLogs((prev) => [...prev, '✓ Resource bundle generated. Teacher review queue updated.']);
    }, 6600);
  };

  return (
    <div className="cinematic-page">
      <CinematicMasthead active="home" />

      <section className="cinematic-hero" aria-label="EduResource Agent 首页">
        <div className="cinematic-hero__media">
          <img className="cinematic-hero__img" src={HERO_IMAGE} alt="教师和学生协作的学习工作台背景" />
          <div className="cinematic-hero__veil" />
          <div className="cinematic-grain" />
        </div>
        <div className="cinematic-hero__content">
          <div className="cinematic-hero__lede">
            <div className="cinematic-eyebrow">
              <span className="num">N° 07</span>
              <span className="bar" />
              <span>Agentic Learning Resource Studio</span>
            </div>
            <h1 className="cinematic-hero__title">
              <span className="word">Personalized</span>{' '}
              <span className="word">learning</span>{' '}
              <span className="word">resources</span>{' '}
              <span className="word"><em>with</em></span>{' '}
              <span className="word"><em>evidence.</em></span>
            </h1>
            <div className="cinematic-byline">
              <em>EduResource Agent</em>
              <span className="cinematic-dot" />
              <span>Major exploration first</span>
              <span className="cinematic-dot" />
              <span>Teacher-approved generation</span>
            </div>
            <div className="cinematic-hero__meta">
              <div className="cinematic-meta-cell">
                <span className="cinematic-meta-label">Entry point</span>
                <span className="cinematic-meta-value">专业探索，不依赖简历</span>
              </div>
              <div className="cinematic-meta-cell">
                <span className="cinematic-meta-label">Pipeline</span>
                <span className="cinematic-meta-value">7 Agent DAG</span>
              </div>
              <div className="cinematic-meta-cell">
                <span className="cinematic-meta-label">Teacher side</span>
                <span className="cinematic-meta-value">生成 · 审核 · 干预</span>
              </div>
              <a className="cinematic-button cinematic-button--light" href="#featured">Scroll</a>
            </div>
          </div>
        </div>
      </section>

      <main>
        <section className="cinematic-section" id="featured">
          <div className="cinematic-section__inner">
            <div className="cinematic-section__head cinematic-reveal">
              <div>
                <span className="cinematic-eyebrow"><span className="num">01</span><span className="bar" />Featured workflow</span>
                <h2 className="cinematic-section__title">From broad major discovery to <em>teacher-grade resources.</em></h2>
              </div>
              <div className="cinematic-section__aside">Student first<br />Teacher controlled<br />Agent visible</div>
            </div>

            <div className="cinematic-spread">
              <aside className="cinematic-spread__copy cinematic-reveal">
                <p className="cinematic-pull">不是让新生先上传一份并不存在的“合格简历”，而是从专业广度开始铺开，再收敛到兴趣方向和资源生成。</p>
                <div className="cinematic-body">
                  <p>主页复用作品集的叙事方式：先用一张强视觉 hero 建立产品气质，再用图版、索引、札记把系统能力摊开。</p>
                  <p>老师端保留真实操作：选择学生、触发生成、查看运行、审核 rationale，并把干预反馈回写闭环。</p>
                </div>
                <div className="cinematic-meta-grid">
                  <div>Profile<strong>12 dimensions</strong></div>
                  <div>Runtime<strong>7 agents</strong></div>
                  <div>Review<strong>Rationale panel</strong></div>
                  <div>Loop<strong>Evaluation update</strong></div>
                </div>
              </aside>
              <div className="cinematic-plates cinematic-reveal-stagger">
                {PLATES.map((plate) => (
                  <figure className={plate.className} key={plate.label}>
                    <img src={plate.src} alt={plate.label} />
                    <figcaption>{plate.label}</figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="cinematic-section" id="works">
          <div className="cinematic-section__inner">
            <div className="cinematic-section__head cinematic-reveal">
              <div>
                <span className="cinematic-eyebrow"><span className="num">02</span><span className="bar" />Index of capabilities</span>
                <h2 className="cinematic-section__title">A product map the evaluator can <em>scan.</em></h2>
              </div>
              <div className="cinematic-section__aside">Clickable index<br />No dashboard clutter</div>
            </div>

            <div className="cinematic-toc cinematic-reveal-stagger">
              {CAPABILITY_ROWS.map((row) => (
                <a className="cinematic-toc__row" href={row.href} key={row.num}>
                  <span className="cinematic-toc__num">{row.num}</span>
                  <span className="cinematic-toc__title">{row.title}</span>
                  <span className="cinematic-toc__meta">{row.meta}<span>{row.year}</span></span>
                  <span className="cinematic-toc__count">{row.count}</span>
                  <span className="cinematic-toc__arrow">→</span>
                  <span className="cinematic-toc__thumb"><img src={row.thumb} alt="" /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="cinematic-section" id="pipeline">
          <div className="cinematic-section__inner">
            <div className="cinematic-section__head cinematic-reveal">
              <div>
                <span className="cinematic-eyebrow"><span className="num">03</span><span className="bar" />Live pipeline</span>
                <h2 className="cinematic-section__title">Seven agents, one visible <em>production line.</em></h2>
              </div>
              <div className="cinematic-section__aside">Profile → Planner<br />Parallel generation<br />Evaluation</div>
            </div>

            <div className="landing-pipeline cinematic-reveal">
              <div className="landing-pipeline__nodes">
                {nodes.map((node, index) => (
                  <div className={`landing-node is-${node.status}`} key={node.id}>
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <strong>{node.name}</strong>
                    <p>{node.role}</p>
                  </div>
                ))}
              </div>
              <div className="landing-pipeline__log">
                <div className="landing-pipeline__bar">
                  <span>agent-stream.log</span>
                  <button className="cinematic-button" disabled={activeStep !== 'idle' && activeStep !== 'done'} onClick={triggerSimulation}>
                    {activeStep === 'idle' ? 'Simulate' : activeStep === 'done' ? 'Rerun' : 'Running'}
                  </button>
                </div>
                <pre>{logs.join('\n')}</pre>
              </div>
            </div>
          </div>
        </section>

        <section className="cinematic-section" id="evidence">
          <div className="cinematic-section__inner">
            <div className="cinematic-section__head cinematic-reveal">
              <div>
                <span className="cinematic-eyebrow"><span className="num">04</span><span className="bar" />Practice</span>
                <h2 className="cinematic-section__title">The same style carries the <em>teacher end.</em></h2>
              </div>
              <div className="cinematic-section__aside">Overview<br />Generator<br />Review queue</div>
            </div>
            <div className="cinematic-practice-grid cinematic-reveal-stagger">
              <article className="cinematic-practice-card">
                <small>i</small>
                <h3><em>Teacher</em><br />Studio</h3>
                <p>班级风险、学生证据、生成参数和审核队列被组织成同一套纸张/索引视觉，而不是另起后台风格。</p>
                <dl>
                  <div><dt>Modules</dt><dd>4</dd></div>
                  <div><dt>Action</dt><dd>Generate</dd></div>
                  <div><dt>Review</dt><dd>Rationale</dd></div>
                </dl>
              </article>
              <article className="cinematic-practice-card">
                <small>ii</small>
                <h3>Student<br /><em>Exploration</em></h3>
                <p>学生端继续保留已有功能，从专业、年级和兴趣切入，先找到方向，再进入资源生成。</p>
                <dl>
                  <div><dt>Entry</dt><dd>Major</dd></div>
                  <div><dt>Profile</dt><dd>12D</dd></div>
                  <div><dt>Path</dt><dd>Snail</dd></div>
                </dl>
              </article>
              <article className="cinematic-practice-card">
                <small>iii</small>
                <h3>Coach<br /><em>Workbench</em></h3>
                <p>Claude Code 式工作台继续作为系统控制台，给出会话、slash 指令、附件证据和运行轨迹。</p>
                <dl>
                  <div><dt>Mode</dt><dd>Agentic</dd></div>
                  <div><dt>Trace</dt><dd>Steps</dd></div>
                  <div><dt>Tool</dt><dd>Upload</dd></div>
                </dl>
              </article>
            </div>
          </div>
        </section>

        <section className="cinematic-section" id="cases">
          <div className="cinematic-section__inner">
            <div className="cinematic-section__head cinematic-reveal">
              <div>
                <span className="cinematic-eyebrow"><span className="num">05</span><span className="bar" />Field notes</span>
                <h2 className="cinematic-section__title">Three visible stories for a <em>demo.</em></h2>
              </div>
              <div className="cinematic-section__aside">Cases<br />Designed for inspection</div>
            </div>
            <div className="cinematic-journal-grid cinematic-reveal-stagger">
              <CaseCard
                image="https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?auto=format&fit=crop&w=900&q=80"
                date="Case 01"
                title={<>A freshman finds an <em>AI application</em> direction</>}
                body="专业探索先铺开知识地图，再让学生从 AI 应用、Web 开发、数据分析等方向中做第一次收敛。"
              />
              <CaseCard
                image="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80"
                date="Case 02"
                title={<>A teacher generates a <em>low-load</em> bundle</>}
                body="老师端读取风险队列，一键把学生、知识点和短板证据带入生成参数。"
              />
              <CaseCard
                image="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80"
                date="Case 03"
                title={<>The rationale explains <em>why</em> this resource exists</>}
                body="每张资源卡都能追溯画像、短板、难度、Agent、Prompt 版本和引用依据。"
              />
            </div>
          </div>
        </section>

        <section className="cinematic-section cinematic-section--ink" id="contact">
          <div className="cinematic-contact">
            <div className="cinematic-section__head cinematic-reveal" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
              <div>
                <span className="cinematic-eyebrow"><span className="num">06</span><span className="bar" />Open the studios</span>
              </div>
              <div className="cinematic-section__aside">Homepage<br />Teacher side<br />Student side</div>
            </div>
            <h2 className="cinematic-contact__lede cinematic-reveal">Choose the workspace and keep the <em>same visual language.</em></h2>
            <div className="cinematic-contact__rows cinematic-reveal">
              <div className="cinematic-contact__block">
                <span>Teacher</span>
                <a href="#/teacher">Open teacher resource studio</a>
                <p>生成、审核、追踪和干预闭环集中在老师端。</p>
              </div>
              <div className="cinematic-contact__block">
                <span>Student</span>
                <a href="#/student">Open student exploration app</a>
                <p>从专业探索开始，不强迫学生先有简历或明确职业目标。</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <CinematicFooter />
      <div className="cinematic-rail cinematic-rail--left"><span className="tick" /><span>EduResource · MMXXVI</span></div>
      <div className="cinematic-rail cinematic-rail--right"><span>Teacher-grade resources</span><span className="tick" /></div>
    </div>
  );
}

export function CinematicMasthead({ active }: { active: 'home' | 'teacher' }) {
  return (
    <header className="cinematic-masthead">
      <a className="cinematic-brand" href="#/">
        <span className="cinematic-mark">E</span>
        <span>EduResource&nbsp;Agent</span>
      </a>
      <div className="cinematic-masthead__center">Agentic&nbsp;Learning&nbsp;·&nbsp;2026</div>
      <nav className="cinematic-nav" aria-label="Primary">
        <a href="#/" aria-current={active === 'home' ? 'page' : undefined}>官网</a>
        <a href="#/teacher" aria-current={active === 'teacher' ? 'page' : undefined}>老师端</a>
        <a href="#/student">学生端</a>
      </nav>
    </header>
  );
}

function CaseCard({ image, date, title, body }: { image: string; date: string; title: ReactNode; body: string }) {
  return (
    <article className="cinematic-journal-card">
      <div className="cinematic-journal-cover"><img src={image} alt="" /></div>
      <div className="cinematic-journal-date"><span>{date}</span><span className="cinematic-dot" /><span>Traceable workflow</span></div>
      <h3 className="cinematic-journal-title">{title}</h3>
      <p>{body}</p>
    </article>
  );
}

export function CinematicFooter() {
  return (
    <footer className="cinematic-footer">
      <div className="cinematic-footer__inner">
        <div className="cinematic-footer__brand">
          <span className="cinematic-mark">E</span>
          <span className="cinematic-footer__name">EduResource <em>Agent</em><br />Studio</span>
          <span>Agentic learning · 2026</span>
        </div>
        <FooterColumn title="Index" links={[['Featured', '#featured'], ['Capabilities', '#works'], ['Pipeline', '#pipeline'], ['Cases', '#cases']]} />
        <FooterColumn title="Workspace" links={[['Teacher side', '#/teacher'], ['Student side', '#/student'], ['Homepage', '#/']]} />
        <FooterColumn title="System" links={[['7-Agent DAG', '#pipeline'], ['Rationale', '#evidence'], ['Closed loop', '#cases']]} />
      </div>
      <div className="cinematic-footer__bottom">
        <span>© MMXXVI · EduResource Agent</span>
        <span>Adapted from bkhlbb.html visual system</span>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {links.map(([label, href]) => <li key={label}><a href={href}>{label}</a></li>)}
      </ul>
    </div>
  );
}

export function useCinematicReveal() {
  const installed = useRef(false);

  useEffect(() => {
    if (installed.current) return undefined;
    installed.current = true;
    const targets = Array.from(document.querySelectorAll('.cinematic-reveal, .cinematic-reveal-stagger'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      targets.forEach((target) => target.classList.add('in'));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);
}
