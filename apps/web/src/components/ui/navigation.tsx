import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronRight, IconCopy } from '../icons';
import { IconButton } from './primitives';
import { useToast } from './feedback';

/* ============================================================
   Breadcrumbs — location, not navigation history
   ============================================================ */
export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={item.label} className="row-tight" style={{ minWidth: 0 }}>
          {i > 0 && <IconChevronRight size={13} />}
          {item.to && i < items.length - 1
            ? <Link to={item.to}>{item.label}</Link>
            : <span className="crumbs-current t-clamp-1">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/* ============================================================
   Page header — context, then the primary action
   ============================================================ */
export function PageHeader({ eyebrow, title, lede, actions }: {
  eyebrow?: string; title: string; lede?: ReactNode; actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="grow">
        {eyebrow && <span className="page-eyebrow">{eyebrow}</span>}
        <h1 className="page-title">{title}</h1>
        {lede && <p className="page-lede">{lede}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function SectionHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  );
}

/* ============================================================
   Tabs — in-page sections. Route-level navigation belongs in
   the sidebar, not here.
   ============================================================ */
export function Tabs<T extends string>({ value, onChange, items, label }: {
  value: T; onChange: (v: T) => void;
  items: { value: T; label: ReactNode; count?: number }[];
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button
          key={t.value}
          type="button" role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && <span className="t-muted t-num"> ({t.count})</span>}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   Room code — the product's signature element. Rendered as
   discrete tiles because it is read aloud and typed in, one
   character at a time, from the back of a lecture hall.
   ============================================================ */
export function RoomCode({ code, size = 'md', invert, copyable }: {
  code: string; size?: 'sm' | 'md' | 'lg'; invert?: boolean; copyable?: boolean;
}) {
  const toast = useToast();
  return (
    <div className="row-tight">
      <div
        className={`roomcode roomcode-${size} ${invert ? 'roomcode-invert' : ''}`.trim()}
        aria-label={`Room code ${code.split('').join(' ')}`}
      >
        {code.split('').map((ch, i) => <span key={i} aria-hidden="true">{ch}</span>)}
      </div>
      {copyable && (
        <IconButton
          label="Copy room code"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              toast.success('Room code copied', `${code} is on your clipboard.`);
            } catch {
              toast.error('Could not copy', 'Your browser blocked clipboard access.');
            }
          }}
        >
          <IconCopy size={16} />
        </IconButton>
      )}
    </div>
  );
}
