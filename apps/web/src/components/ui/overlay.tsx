import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../icons';
import { Button, IconButton } from './primitives';

/* ============================================================
   Shared overlay behaviour: Escape closes, focus is trapped
   inside, the page behind cannot scroll, and focus returns to
   whatever opened it.
   ============================================================ */
function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const first = ref.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]), textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const nodes = Array.from(ref.current.querySelectorAll<HTMLElement>(
        'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const firstNode = nodes[0]!, lastNode = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === firstNode) { e.preventDefault(); lastNode.focus(); }
      else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); firstNode.focus(); }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}

/* ============================================================
   Modal — short, self-contained decisions only. Anything with
   more than a couple of fields belongs in a Drawer or a page.
   ============================================================ */
export function Modal({ open, onClose, title, description, children, footer, size }: {
  open: boolean; onClose: () => void;
  title: string; description?: ReactNode;
  children?: ReactNode; footer?: ReactNode;
  /** sm 400 · md 560 · lg 800. Defaults to sm: most decisions are short. */
  size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useOverlay(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={ref}
        className={`modal ${size === 'lg' ? 'modal-lg' : size === 'md' ? 'modal-md' : ''}`.trim()}
        role="dialog" aria-modal="true" aria-labelledby="modal-title"
        style={{ position: 'relative' }}
      >
        <header className="modal-head">
          <h2 id="modal-title" className="modal-title">{title}</h2>
          {description && <p className="modal-desc">{description}</p>}
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
            <IconClose size={16} />
          </button>
        </header>
        {children && <div className="modal-body">{children}</div>}
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Destructive confirmation — the default focus is Cancel. */
export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', destructive, loading,
}: {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; description?: ReactNode; confirmLabel?: string;
  destructive?: boolean; loading?: boolean;
}) {
  return (
    <Modal
      open={open} onClose={onClose} title={title} description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={destructive ? 'danger-solid' : 'primary'} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

/* ============================================================
   Drawer — multi-field workflows that keep the page behind
   visible for context.
   ============================================================ */
export function Drawer({ open, onClose, title, description, children, footer }: {
  open: boolean; onClose: () => void;
  title: string; description?: ReactNode;
  children: ReactNode; footer?: ReactNode;
}) {
  const ref = useOverlay(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="scrim drawer-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-head">
          <div className="grow">
            <h2 id="drawer-title" className="card-title">{title}</h2>
            {description && <p className="card-sub">{description}</p>}
          </div>
          <IconButton label="Close panel" onClick={onClose}><IconClose size={16} /></IconButton>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ============================================================
   Menu — a small anchored list of actions.
   Rendered into a portal and positioned against the trigger,
   so it is never clipped by a scrolling table or the sidebar's
   own overflow. It closes on scroll and resize rather than
   drifting away from the control that opened it.
   ============================================================ */
interface MenuPos { top?: number; bottom?: number; left?: number; right?: number; minWidth?: number }

export function Menu({ trigger, label, children, align = 'right', triggerClassName = 'icon-btn' }: {
  trigger: ReactNode; label: string; children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  /** Presentation of the trigger. Defaults to the square icon button;
      pass a class when the control is a full-width row. */
  triggerClassName?: string;
}) {
  const [pos, setPos] = useState<MenuPos | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = pos !== null;
  const close = useCallback(() => setPos(null), []);

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const GAP = 6;
    const ESTIMATED_HEIGHT = 220;
    const flipUp = r.bottom + ESTIMATED_HEIGHT > window.innerHeight && r.top > ESTIMATED_HEIGHT;
    setPos({
      ...(flipUp ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
      ...(align === 'right' ? { right: window.innerWidth - r.right } : { left: r.left }),
      // Never narrower than the control it belongs to.
      minWidth: Math.max(200, Math.round(r.width)),
    });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!btn.current?.contains(target) && !panel.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); btn.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={triggerClassName}
        aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => (open ? close() : place())}
      >
        {trigger}
      </button>
      {open && createPortal(
        <div
          ref={panel}
          className={`menu menu-fixed menu-${align}`}
          role="menu"
          style={pos as never}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>,
        document.body,
      )}
    </>
  );
}

export function MenuItem({ onClick, danger, icon, children }: {
  onClick?: () => void; danger?: boolean; icon?: ReactNode; children: ReactNode;
}) {
  return (
    <button
      type="button" role="menuitem"
      className={`menu-item ${danger ? 'menu-item-danger' : ''}`.trim()}
      onClick={onClick}
    >
      {icon}{children}
    </button>
  );
}

export function MenuSep() { return <div className="menu-sep" role="separator" />; }
