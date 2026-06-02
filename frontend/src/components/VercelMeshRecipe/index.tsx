import type { CSSProperties, ReactNode } from 'react';
import '../../vercel-mesh.css';

export interface MeshNavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface MeshHeroLogLine {
  scope: string;
  text: string;
  ok?: boolean;
}

export interface MeshFeatureCard {
  title: string;
  body: string;
  eyebrow?: string;
}

export interface MeshMetric {
  value: string;
  label: string;
}

interface MeshPageProps {
  active: 'home' | 'teacher';
  kicker: string;
  title: ReactNode;
  subtitle: string;
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  terminalTitle?: string;
  logs?: MeshHeroLogLine[];
  children: ReactNode;
  footer?: string;
}

export function VercelMeshPage({
  active,
  kicker,
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  terminalTitle = 'deployment.log',
  logs,
  children,
  footer,
}: MeshPageProps) {
  return (
    <div className="mesh-page">
      <div className="mesh-shell">
        <VercelMeshNav active={active} />
        <main className="mesh-main">
          <section className="mesh-hero">
            <div>
              <MeshKicker>{kicker}</MeshKicker>
              <h1 className="mesh-title">{title}</h1>
              <p className="mesh-subtitle">{subtitle}</p>
              {(primaryAction || secondaryAction) && (
                <div className="mesh-actions">
                  {primaryAction && <a className="mesh-primary-button" href={primaryAction.href}>{primaryAction.label}</a>}
                  {secondaryAction && <a className="mesh-ghost-button" href={secondaryAction.href}>{secondaryAction.label}</a>}
                </div>
              )}
            </div>
            {logs && <MeshTerminal title={terminalTitle} logs={logs} />}
          </section>
          {children}
        </main>
        {footer && <footer className="mesh-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function VercelMeshNav({ active }: { active: 'home' | 'teacher' }) {
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

export function MeshKicker({ children }: { children: ReactNode }) {
  return <div className="mesh-kicker"><span className="mesh-pulse" /> {children}</div>;
}

export function MeshTerminal({ title, logs }: { title: string; logs: MeshHeroLogLine[] }) {
  return (
    <div className="mesh-terminal">
      <div className="mesh-terminal-bar">
        <div className="mesh-dots"><span /><span /><span /></div>
        <span>{title}</span>
      </div>
      <div className="mesh-terminal-body">
        {logs.map((line) => (
          <div className="mesh-log-line" key={`${line.scope}-${line.text}`}>
            <strong>{line.scope}</strong>
            <span>{line.ok !== false && <span className="mesh-log-ok">✓</span>} {line.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MeshSection({ title, eyebrow, children }: { title: ReactNode; eyebrow?: string; children: ReactNode }) {
  return (
    <section className="mesh-section">
      <div className="mesh-section-head">
        <h2>{title}</h2>
        {eyebrow && <span className="mesh-mono">{eyebrow}</span>}
      </div>
      {children}
    </section>
  );
}

export function MeshCardGrid({ cards, columns = 3 }: { cards: MeshFeatureCard[]; columns?: 2 | 3 }) {
  return (
    <div className={columns === 2 ? 'mesh-grid-2' : 'mesh-grid-3'}>
      {cards.map((card) => (
        <article className="mesh-card" key={card.title}>
          {card.eyebrow && <small>{card.eyebrow}</small>}
          <h3>{card.title}</h3>
          <p>{card.body}</p>
        </article>
      ))}
    </div>
  );
}

export function MeshMetricGrid({ metrics }: { metrics: MeshMetric[] }) {
  return (
    <div className="mesh-metric-grid">
      {metrics.map((item) => (
        <div className="mesh-metric" key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function MeshProgress({ value }: { value: number }) {
  return <div className="mesh-progress"><span style={{ '--value': `${value}%` } as CSSProperties} /></div>;
}
