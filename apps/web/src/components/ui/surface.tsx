import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconAlert, IconCheckCircle, IconInfo, IconMinus, IconTrendDown, IconTrendUp, IconWarning } from '../icons';

/* ============================================================
   Card — a bordered surface. It carries no shadow unless it is
   interactive, so the page reads as layered paper, not floats.
   ============================================================ */
export function Card({ className = '', children, ...rest }: {
  className?: string; children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return <section className={`card ${className}`.trim()} {...rest}>{children}</section>;
}

export function CardHead({ title, sub, action, plain, className = '' }: {
  title: ReactNode; sub?: ReactNode; action?: ReactNode; plain?: boolean; className?: string;
}) {
  return (
    <header className={`card-head ${plain ? 'card-head-plain' : ''} ${className}`.trim()}>
      <div className="grow">
        <h3 className="card-title">{title}</h3>
        {sub && <p className="card-sub">{sub}</p>}
      </div>
      {action}
    </header>
  );
}

export function CardBody({ tight, className = '', children }: {
  tight?: boolean; className?: string; children: ReactNode;
}) {
  return <div className={`${tight ? 'card-body-tight' : 'card-body'} ${className}`.trim()}>{children}</div>;
}

export function CardFoot({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card-foot ${className}`.trim()}>{children}</div>;
}

/** A row inside a card list; becomes a link when `to` is given. */
export function PanelRow({ to, children, className = '' }: {
  to?: string; children: ReactNode; className?: string;
}) {
  const cls = `panel-row ${to ? 'panel-row-link' : ''} ${className}`.trim();
  return to ? <Link to={to} className={cls}>{children}</Link> : <div className={cls}>{children}</div>;
}

/* ============================================================
   Stat — a metric with its context. Values stay at a readable
   size; the label and footnote do the explaining.
   ============================================================ */
export function Stat({ label, value, foot, delta, deltaLabel }: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
  /** Signed percentage; renders direction as icon + colour + text. */
  delta?: number;
  deltaLabel?: string;
}) {
  const dir = delta === undefined ? null : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      <span className="stat-foot">
        {dir && (
          <span className={`stat-delta ${dir}`}>
            {dir === 'up' ? <IconTrendUp size={13} /> : dir === 'down' ? <IconTrendDown size={13} /> : <IconMinus size={13} />}
            {Math.abs(delta!)}%
            {deltaLabel && <span className="t-muted" style={{ fontWeight: 400 }}>{deltaLabel}</span>}
          </span>
        )}
        {foot}
      </span>
    </div>
  );
}

export function StatGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`stat-grid ${className}`.trim()}>{children}</div>;
}

/* ============================================================
   Progress
   ============================================================ */
export function Progress({ value, tone = 'accent', size, label }: {
  value: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'foundation';
  size?: 'sm' | 'lg';
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`progress ${size ? `progress-${size}` : ''}`.trim()}
      role="progressbar"
      aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      aria-label={label}
    >
      <i className={tone === 'accent' ? undefined : `is-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Labelled progress row — the standard way to show a rate. */
export function Meter({ label, sub, value, suffix = '%', tone }: {
  label: ReactNode; sub?: ReactNode; value: number; suffix?: string;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'foundation';
}) {
  const auto = value >= 75 ? 'success' : value >= 45 ? 'warning' : 'danger';
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">{label}{sub && <em>{sub}</em>}</span>
        <span className="meter-value">{Math.round(value)}{suffix}</span>
      </div>
      <Progress value={value} tone={tone ?? auto} label={typeof label === 'string' ? label : undefined} />
    </div>
  );
}

/* ============================================================
   Banner — inline message. Colour is never the only signal:
   each tone carries its own icon.
   ============================================================ */
const BANNER_ICON = {
  info: IconInfo, success: IconCheckCircle, warning: IconWarning, error: IconAlert, neutral: IconInfo,
} as const;

export function Banner({ tone = 'info', title, children, action }: {
  tone?: 'info' | 'success' | 'warning' | 'error' | 'neutral';
  title?: ReactNode; children?: ReactNode; action?: ReactNode;
}) {
  const Ico = BANNER_ICON[tone];
  return (
    <div
      className={`banner ${tone === 'neutral' ? '' : `banner-${tone}`}`.trim()}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Ico size={16} />
      <div className="grow">
        {title && <strong>{title}</strong>}
        {children}
      </div>
      {action}
    </div>
  );
}
