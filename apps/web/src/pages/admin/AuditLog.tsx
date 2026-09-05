import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AuditEntry, Page } from '../../lib/types';
import {
  Badge, Button, EmptyState, ErrorState, PageHeader, Segmented, SimpleTable, SkeletonTable,
} from '../../components/ui';
import { IconShield } from '../../components/icons';
import { relativeTime } from '../../lib/format';

/* ============================================================
   Audit log
   Append-only, newest first, cursor-paged. Pages accumulate as
   you load more rather than replacing — an audit trail is read
   as a sequence, not jumped around.
   ============================================================ */
const FILTERS = [
  { value: 'ALL', label: 'Everything' },
  { value: 'module', label: 'Modules' },
  { value: 'lesson', label: 'Lessons' },
] as const;

/** "2 Sep, 14:05" — the audit stamp needs the time, which the shared
    date helper does not print. The year rides in the tooltip. */
function stamp(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
function stampFull(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminAuditLog() {
  const [targetType, setTargetType] = useState<string>('ALL');
  const [pages, setPages] = useState<string[]>([]);

  const key = ['audit', targetType, pages.length] as const;
  const query = useQuery({
    queryKey: key,
    queryFn: () => {
      const p = new URLSearchParams({ take: '25' });
      if (targetType !== 'ALL') p.set('targetType', targetType);
      const cursor = pages[pages.length - 1];
      if (cursor) p.set('cursor', cursor);
      return api.get<Page<AuditEntry>>(`/audit?${p}`);
    },
  });

  const [rows, setRows] = useState<AuditEntry[]>([]);
  // Accumulate rather than replace, so "load more" extends the list.
  const items = pages.length === 0 ? query.data?.items ?? [] : [...rows, ...(query.data?.items ?? [])];

  return (
    <>
      <PageHeader
        title="Audit log"
        lede="Every consequential action on the platform, newest first. Entries are never edited or removed."
      />

      <div className="toolbar">
        <Segmented
          label="Filter by type"
          value={targetType}
          onChange={(v) => { setTargetType(v); setPages([]); setRows([]); }}
          options={FILTERS as unknown as { value: string; label: string }[]}
        />
        <span className="toolbar-end t-caption t-muted">
          {items.length ? `${items.length} ${items.length === 1 ? 'entry' : 'entries'} loaded${query.data?.hasMore ? ' · more available' : ''}` : ''}
        </span>
      </div>

      <div className="table-frame">
        {query.isLoading && items.length === 0 ? (
          <SkeletonTable rows={8} cols={4} />
        ) : query.isError ? (
          <ErrorState onRetry={() => void query.refetch()} />
        ) : !items.length ? (
          <EmptyState
            icon={<IconShield size={18} />}
            title="Nothing recorded yet"
            description="Publishing a lesson, approving a teacher or changing a grade will appear here as it happens."
          />
        ) : (
          <>
            <SimpleTable
              rows={items}
              getRowId={(e) => e.id}
              caption="Audit entries"
              columns={[
                {
                  key: 'when', header: 'Time', width: 110,
                  cell: (e) => (
                    <span className="cell-data audit-stamp" title={`${stampFull(e.createdAt)} · ${relativeTime(e.createdAt)}`}>
                      {stamp(e.createdAt)}
                    </span>
                  ),
                },
                {
                  key: 'actor', header: 'Actor', width: 200, secondary: true,
                  cell: (e) => (
                    <span className="cell-actor">
                      <span className="cell-primary t-clamp-1">{e.actor?.name ?? e.actorEmail}</span>
                      {e.actor?.role && <Badge tone="neutral">{e.actor.role[0] + e.actor.role.slice(1).toLowerCase()}</Badge>}
                    </span>
                  ),
                },
                {
                  key: 'action', header: 'Action', width: 180, secondary: true,
                  cell: (e) => <span className="cell-data">{e.action}</span>,
                },
                {
                  key: 'summary', header: 'Summary',
                  cell: (e) => <span className="audit-cell-summary">{e.summary}</span>,
                },
              ]}
            />

            {query.data?.hasMore && (
              <div className="audit-more">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={query.isFetching}
                  onClick={() => {
                    setRows(items);
                    setPages((p) => [...p, query.data!.nextCursor!]);
                  }}
                >
                  Load older entries
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
