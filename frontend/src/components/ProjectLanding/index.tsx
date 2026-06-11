import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AgentSystemsShowcase } from '../AgentSystemsShowcase';
import './cinematic-resource.css';

export type EntryRole = 'teacher' | 'student';

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
    meta: 'Student',
    year: 'Explore',
    count: '12 dimensions',
    thumb: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=600&q=80',
    href: '/register/student',
  },
  {
    num: '02',
    title: <>Teacher-grade <em>resource studio</em></>,
    meta: 'Teacher',
    year: 'Generate',
    count: '4 modules',
    thumb: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=600&q=80',
    href: '/register/teacher',
  },
  {
    num: '03',
    title: <>Two visible <em>agent systems</em></>,
    meta: 'Agents',
    year: '2 x 7',
    count: '2 x 7 agents',
    thumb: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=600&q=80',
    href: '#evidence',
  },
  {
    num: '04',
    title: <>Rationale and <em>fingerprint</em></>,
    meta: 'Trace',
    year: 'Evidence',
    count: 'full trace',
    thumb: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=600&q=80',
    href: '#evidence',
  },
  {
    num: '05',
    title: <>Closed-loop <em>intervention</em></>,
    meta: 'Loop',
    year: 'Feedback',
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
    '[Profile] 读取画像',
    '[Profile] 锁定偏好',
  ],
  planner: [
    '[Planner] 拆解任务',
    '[Planner] 排定顺序',
  ],
  doc: ['[Document] 生成讲解'],
  exercise: ['[Exercise] 生成题目'],
  visual: ['[Visual] 生成图解'],
  code: ['[Code] 生成代码'],
  eval: ['[Evaluation] 回写评估'],
};

export function ProjectLanding() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [activeStep, setActiveStep] = useState('idle');
  const [logs, setLogs] = useState<string[]>(['[System] Ready']);

  useCinematicReveal();

  const triggerSimulation = () => {
    setActiveStep('profile');
    setNodes(INITIAL_NODES.map((node) => node.id === 'profile' ? { ...node, status: 'active' } : node));
    setLogs([
      '[Main] Start',
      ...PIPELINE_LOGS.profile,
    ]);

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
        setLogs((prev) => [...prev, ...PIPELINE_LOGS[step.id]]);
      }, step.delay);
    });

    window.setTimeout(() => {
      setActiveStep('done');
      setNodes((prev) => prev.map((node) => ({ ...node, status: 'success' })));
      setLogs((prev) => [...prev, '[Bundle] Done']);
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
              <span>Student</span>
              <span className="cinematic-dot" />
              <span>Teacher</span>
            </div>
            <div className="cinematic-hero__meta">
              <div className="cinematic-meta-cell">
                <span className="cinematic-meta-label">Entry point</span>
                <span className="cinematic-meta-value">专业探索</span>
              </div>
              <div className="cinematic-meta-cell">
                <span className="cinematic-meta-label">Pipeline</span>
                <span className="cinematic-meta-value">2 x 7 Agent</span>
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
                <h2 className="cinematic-section__title">Student explore. <em>Teacher generate.</em></h2>
              </div>
              <div className="cinematic-section__aside">Student<br />Teacher<br />Agents</div>
            </div>

            <div className="cinematic-spread">
              <aside className="cinematic-spread__copy cinematic-reveal">
                <p className="cinematic-pull">Explore · Generate</p>
                <div className="cinematic-meta-grid">
                  <div>Profile<strong>12 dimensions</strong></div>
                  <div>Runtime<strong>2 x 7 agents</strong></div>
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
                <h2 className="cinematic-section__title">Product map.</h2>
              </div>
              <div className="cinematic-section__aside">Index<br />Scan</div>
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
                <h2 className="cinematic-section__title">Seven agents. <em>One line.</em></h2>
              </div>
              <div className="cinematic-section__aside">Profile<br />Planner<br />Eval</div>
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
                  <span>运行日志 · agent-stream.log</span>
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
                <span className="cinematic-eyebrow"><span className="num">04</span><span className="bar" />Dual systems</span>
                <h2 className="cinematic-section__title">Two visible <em>agent systems.</em></h2>
              </div>
              <div className="cinematic-section__aside">Student<br />Teacher<br />Visible</div>
            </div>
            <div className="cinematic-reveal">
              <AgentSystemsShowcase activeSuiteId="generation" />
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
                body="专业探索 → AI 应用"
              />
              <CaseCard
                image="https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=900&q=80"
                date="Case 02"
                title={<>A teacher generates a <em>low-load</em> bundle</>}
                body="风险队列 → 资源生成"
              />
              <CaseCard
                image="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=900&q=80"
                date="Case 03"
                title={<>The rationale explains <em>why</em> this resource exists</>}
                body="资源卡可溯源"
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
            <h2 className="cinematic-contact__lede cinematic-reveal">Choose side.</h2>
            <div className="cinematic-contact__rows cinematic-reveal">
              <div className="cinematic-contact__block">
                <span>Teacher</span>
                <a href="/register/teacher" data-app-route>注册老师</a>
              </div>
              <div className="cinematic-contact__block">
                <span>Student</span>
                <a href="/register/student" data-app-route>注册学生</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <CinematicFooter />
      <div className="cinematic-rail cinematic-rail--left"><span className="tick" /><span>EduResource · MMXXVI</span></div>
      <div className="cinematic-rail cinematic-rail--right"><span>2 x 7 agents</span><span className="tick" /></div>
    </div>
  );
}

export function RoleEntryPage({
  currentRole,
  presetRole,
  onSelect,
}: {
  currentRole: EntryRole | null;
  presetRole?: EntryRole | null;
  onSelect: (role: EntryRole) => void;
}) {
  useCinematicReveal();
  const highlightedRole = presetRole ?? currentRole ?? 'teacher';

  return (
    <div className="cinematic-page role-entry-page">
      <CinematicMasthead active="home" />
      <main className="role-entry-shell">
        <section className="role-entry-panel cinematic-reveal in">
          <div className="cinematic-eyebrow">
            <span className="num">Entry</span>
            <span className="bar" />
            <span>Role register</span>
          </div>

          <div className="role-entry-copy">
            <h1 className="role-entry-title">Choose side.</h1>
            <p className="role-entry-note">
              老师进老师端，学生进学生端。
            </p>
          </div>

          <div className="role-entry-grid">
            <button
              type="button"
              className={highlightedRole === 'teacher' ? 'role-entry-card is-active' : 'role-entry-card'}
              onClick={() => onSelect('teacher')}
            >
              <span>Teacher</span>
              <strong>老师端</strong>
              <small>人培 / 教案 / PPT / 大纲</small>
            </button>

            <button
              type="button"
              className={highlightedRole === 'student' ? 'role-entry-card is-active' : 'role-entry-card'}
              onClick={() => onSelect('student')}
            >
              <span>Student</span>
              <strong>学生端</strong>
              <small>探索 / 培养 / 课堂 / 进度</small>
            </button>
          </div>

          <div className="role-entry-actions">
            {currentRole ? (
              <span className="role-entry-badge">当前身份 · {currentRole === 'teacher' ? '老师' : '学生'}</span>
            ) : (
              <span className="role-entry-badge">首次进入</span>
            )}
            <a className="cinematic-inline-link" href="/landing" data-app-route>浏览主页</a>
          </div>
        </section>
      </main>
    </div>
  );
}

export function CinematicMasthead({ active }: { active: 'home' | 'teacher' }) {
  return (
    <header className="cinematic-masthead">
      <a className="cinematic-brand" href="/landing" data-app-route>
        <span className="cinematic-mark">E</span>
        <span>EduResource&nbsp;Agent</span>
      </a>
      <div className="cinematic-masthead__center">Agentic&nbsp;Learning&nbsp;·&nbsp;2026</div>
      <nav className="cinematic-nav" aria-label="Primary">
        <a href="/landing" data-app-route aria-current={active === 'home' ? 'page' : undefined}>官网</a>
        <a href="/register" data-app-route>注册</a>
        <a href="/teacher" data-app-route aria-current={active === 'teacher' ? 'page' : undefined}>老师端</a>
        <a href="/student/exploration" data-app-route>学生端</a>
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
        <FooterColumn title="Workspace" links={[['Teacher side', '/teacher'], ['Student side', '/student/exploration'], ['Homepage', '/landing'], ['Register', '/register']]} />
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
        {links.map(([label, href]) => {
          const appRouteProps = href.startsWith('/') ? { 'data-app-route': '' } : {};
          return (
            <li key={label}>
              <a href={href} {...appRouteProps}>{label}</a>
            </li>
          );
        })}
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
