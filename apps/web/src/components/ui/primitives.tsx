import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { useId, useState } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

/* ============================================================
   Button
   Four intents, one height ramp. The label stays in the DOM
   while loading so the control never changes width mid-action.
   ============================================================ */
export type ButtonVariant =
  | 'primary' | 'foundation' | 'secondary' | 'tertiary' | 'danger' | 'danger-solid';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

interface BaseButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  iconOnly?: boolean;
  className?: string;
}

function classes({ variant = 'primary', size = 'md', block, iconOnly, className = '' }: BaseButtonProps) {
  return [
    'btn', `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    block ? 'btn-block' : '',
    iconOnly ? 'btn-icon' : '',
    className,
  ].filter(Boolean).join(' ');
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Button({
  variant, size, block, loading, iconOnly, className, children, disabled, ...rest
}: BaseButtonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={classes({ variant, size, block, iconOnly, className })}
      data-loading={loading ? 'true' : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {children}
      {loading && <span className="btn-spinner"><Spinner /></span>}
    </button>
  );
}

export function LinkButton({
  variant, size, block, iconOnly, className, children, ...rest
}: BaseButtonProps & LinkProps) {
  return (
    <Link className={classes({ variant, size, block, iconOnly, className })} {...rest}>
      {children}
    </Link>
  );
}

export function AnchorButton({
  variant, size, block, iconOnly, className, children, ...rest
}: BaseButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={classes({ variant, size, block, iconOnly, className })} {...rest}>{children}</a>
  );
}

/** Bare square control for toolbars — no border, tonal hover. */
export function IconButton({
  label, className = '', children, ...rest
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`icon-btn ${className}`.trim()} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* ============================================================
   Badge
   ============================================================ */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'solid' | 'live';

export function Badge({ tone = 'neutral', dot, children, className = '' }: {
  tone?: BadgeTone; dot?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <span className={`badge badge-${tone} ${className}`.trim()}>
      {(dot || tone === 'live') && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ============================================================
   Avatar — initials fall back from a name, never a broken image
   ============================================================ */
export function Avatar({ name, src, size = 'md', accent, className = '' }: {
  name?: string | null; src?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; accent?: boolean; className?: string;
}) {
  const initials = (name ?? '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map((w) => w[0]!.toUpperCase()).join('') || '?';
  // A stable tone per name, so the same person is the same colour on every screen.
  let hash = 0;
  for (const ch of name ?? '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const cls = [
    'avatar',
    `avatar-t${hash % 6}`,
    size !== 'md' ? `avatar-${size}` : '',
    accent ? 'avatar-accent' : '',
    className,
  ].filter(Boolean).join(' ');
  return (
    <span className={cls} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initials}
    </span>
  );
}

/* ============================================================
   Tooltip — hover and focus, never the only source of meaning
   ============================================================ */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="tip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>
      {open && <span role="tooltip" id={id} className="tip">{label}</span>}
    </span>
  );
}
