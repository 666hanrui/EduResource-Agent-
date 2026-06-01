import type { CSSProperties, ReactNode } from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'small';
};

interface FieldProps {
  label: string;
  wide?: boolean;
  children: ReactNode;
}

interface PanelProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  cream?: boolean;
  children: ReactNode;
}

interface BarProps {
  value: number;
  tone?: 'market' | 'student';
}

export function Field({ label, wide, children }: FieldProps) {
  return (
    <div className={wide ? 'major-field major-field--wide' : 'major-field'}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function MajorInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`major-input ${props.className ?? ''}`} />;
}

export function MajorSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`major-select ${props.className ?? ''}`} />;
}

export function MajorTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`major-textarea ${props.className ?? ''}`} />;
}

export function MajorButton({ variant, className, children, ...props }: ButtonProps) {
  const variantClass = variant === 'primary' ? 'major-button--primary' : variant === 'small' ? 'major-button--small' : '';
  return (
    <button {...props} className={`major-button ${variantClass} ${className ?? ''}`}>
      {children}
    </button>
  );
}

export function EmptyPrompt() {
  return (
    <div className="major-empty">
      <div>
        <div className="major-empty__face" />
        <h2>先生成一张探索地图</h2>
        <p>从专业开始，不需要简历，也不要求先确定目标岗位。系统会先铺开知识广度，再帮你收敛方向。</p>
      </div>
    </div>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return <div className="major-error">{children}</div>;
}

export function Panel({ title, subtitle, action, cream, children }: PanelProps) {
  return (
    <section className={cream ? 'major-panel major-panel--cream' : 'major-panel'}>
      {(title || subtitle || action) && (
        <div className="major-panel__header">
          <div className="major-section-title">
            {title && <h3>{title}</h3>}
            {subtitle && <p className="major-probe">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="major-eyebrow">{children}</span>;
}

export function Chip({ children, tone }: { children: ReactNode; tone?: 'gap' | 'soft' }) {
  const cls = tone === 'gap' ? 'major-chip major-chip--gap' : tone === 'soft' ? 'major-chip major-chip--soft' : 'major-chip';
  return <span className={cls}>{children}</span>;
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="major-badge">{children}</span>;
}

export function ScorePill({ children }: { children: ReactNode }) {
  return <span className="major-score-pill">{children}</span>;
}

export function RowBetween({ children }: { children: ReactNode }) {
  return <div className="major-row-between">{children}</div>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="major-muted">{children}</p>;
}

export function Probe({ children }: { children: ReactNode }) {
  return <p className="major-probe">{children}</p>;
}

export function ProgressBar({ value, tone = 'student' }: BarProps) {
  const width = `${Math.max(0, Math.min(100, value))}%`;
  return (
    <div className="major-bar-track">
      <div
        className={tone === 'market' ? 'major-bar-fill major-bar-fill--market' : 'major-bar-fill'}
        style={{ '--value': width } as CSSProperties}
      />
    </div>
  );
}

export function DualBar({ label, value, tone }: { label: string; value: number; tone?: 'market' | 'student' }) {
  return (
    <div className="major-bar-row">
      <span>{label}</span>
      <ProgressBar value={value} tone={tone} />
      <strong>{value}</strong>
    </div>
  );
}

export function List({ items }: { items: string[] }) {
  return (
    <ul className="major-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}
