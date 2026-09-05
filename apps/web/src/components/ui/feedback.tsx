import type { CSSProperties, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { IconAlert, IconCheckCircle, IconClose, IconInfo, IconOffline, IconRefresh } from '../icons';
import { Button, IconButton } from './primitives';

/* ============================================================
   Skeleton
   Loading UI mirrors the shape of the content it replaces, so
   nothing shifts when the data lands.
   ============================================================ */
export function Skeleton({ w, h = 12, radius, circle, className = '', style }: {
  w?: number | string; h?: number | string; radius?: number; circle?: boolean;
  className?: string; style?: CSSProperties;
}) {
  return (
    <span
      className={`sk ${circle ? 'sk-circle' : ''} ${className}`.trim()}
      style={{ display: 'block', width: w ?? '100%', height: h, borderRadius: circle ? '50%' : radius, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({ lines = 3, lastWidth = '60%' }: { lines?: number; lastWidth?: string }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="sk-line" w={i === lines - 1 ? lastWidth : '100%'} />
      ))}
    </div>
  );
}

/** Table placeholder that keeps the real row rhythm. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden="true" style={{ padding: 'var(--s-2) 0' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{
          display: 'grid',
          gridTemplateColumns: `1.6fr repeat(${Math.max(cols - 1, 1)}, 1fr)`,
          gap: 'var(--s-4)',
          padding: 'var(--s-4) var(--s-6)',
          borderBottom: '1px solid var(--border)',
        }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} h={12} w={c === 0 ? '72%' : '46%'} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, height = 132 }: { count?: number; height?: number }) {
  return (
    <div className="grid-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="sk-block" h={height} />
      ))}
    </div>
  );
}

/* ============================================================
   Empty state — explanation plus the one action that resolves it
   ============================================================ */
export function EmptyState({ icon, title, description, action, secondary, tight }: {
  icon?: ReactNode; title: string; description?: ReactNode;
  action?: ReactNode; secondary?: ReactNode; tight?: boolean;
}) {
  return (
    <div className={`empty ${tight ? 'empty-tight' : ''}`.trim()}>
      {icon && <span className="empty-mark" aria-hidden="true">{icon}</span>}
      <h4 className="empty-title">{title}</h4>
      {description && <p className="empty-text">{description}</p>}
      {(action || secondary) && <div className="empty-actions">{action}{secondary}</div>}
    </div>
  );
}

/* ============================================================
   Error state — what happened, then what to do about it
   ============================================================ */
export function ErrorState({ title, description, onRetry, icon }: {
  title?: string; description?: ReactNode; onRetry?: () => void; icon?: ReactNode;
}) {
  return (
    <div className="empty" role="alert">
      <span className="empty-mark empty-mark-error" aria-hidden="true">{icon ?? <IconOffline size={20} />}</span>
      <h4 className="empty-title">{title ?? 'We could not load this'}</h4>
      <p className="empty-text">
        {description ?? 'The connection to the server failed. Your work is safe — try again in a moment.'}
      </p>
      {onRetry && (
        <div className="empty-actions">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <IconRefresh size={14} />Try again
          </Button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Toast
   Confirmation for actions whose result is not visible on screen.
   ============================================================ */
type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; title: string; description?: string }

const ToastCtx = createContext<((t: Omit<ToastItem, 'id'>) => void) | null>(null);

const TOAST_ICON = { success: IconCheckCircle, error: IconAlert, info: IconInfo } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-3), { ...t, id }]);
    window.setTimeout(() => dismiss(id), t.tone === 'error' ? 7000 : 4500);
  }, [dismiss]);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toast-region" role="region" aria-label="Notifications">
        {items.map((t) => {
          const Ico = TOAST_ICON[t.tone];
          return (
            <div key={t.id} className="toast" role={t.tone === 'error' ? 'alert' : 'status'}>
              <span className={`toast-icon ${t.tone}`}><Ico size={17} /></span>
              <div className="grow">
                <div className="toast-title">{t.title}</div>
                {t.description && <div className="toast-desc">{t.description}</div>}
              </div>
              <IconButton label="Dismiss" onClick={() => dismiss(t.id)} style={{ width: 26, height: 26 }}>
                <IconClose size={14} />
              </IconButton>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastCtx);
  return useMemo(() => ({
    success: (title: string, description?: string) => push?.({ tone: 'success', title, description }),
    error:   (title: string, description?: string) => push?.({ tone: 'error', title, description }),
    info:    (title: string, description?: string) => push?.({ tone: 'info', title, description }),
  }), [push]);
}
