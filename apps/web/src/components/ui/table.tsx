import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { IconChevronLeft, IconChevronRight, IconSort } from '../icons';
import { SkeletonTable, EmptyState, ErrorState } from './feedback';
import { Checkbox, SearchInput } from './form';
import { Button } from './primitives';

/* ============================================================
   DataTable
   One table implementation for the whole product: search, sort,
   selection, bulk actions, pagination, and a card layout that
   takes over below the tablet breakpoint. Loading, empty and
   error states are part of the component, not the caller.
   ============================================================ */

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Enables click-to-sort on this column. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right';
  width?: string | number;
  /** Hidden on narrow desktop widths where space is tight. */
  secondary?: boolean;
}

export function DataTable<T>({
  rows, columns, getRowId, loading, error, onRetry, empty,
  search, toolbar, selectable, bulkActions, pageSize = 10, mobileCard, caption,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty: ReactNode;
  /** Client-side search over the string this returns for each row. */
  search?: { placeholder?: string; match: (row: T) => string };
  toolbar?: ReactNode;
  selectable?: boolean;
  bulkActions?: (ids: string[], clear: () => void) => ReactNode;
  pageSize?: number;
  mobileCard?: (row: T) => ReactNode;
  caption?: string;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const base = q && search ? rows.filter((r) => search.match(r).toLowerCase().includes(q)) : rows;
    if (!sort) return base;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return base;
    return [...base].sort((a, b) => {
      const av = col.sortValue!(a), bv = col.sortValue!(b);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, query, sort, columns, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  // A filter that shortens the list must not strand the viewer on page 7.
  useEffect(() => { setPage((p) => Math.min(p, pageCount)); }, [pageCount]);
  useEffect(() => { setPage(1); }, [query]);

  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = visible.map(getRowId);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  function toggleSort(key: string) {
    setSort((s) =>
      s?.key !== key ? { key, dir: 'asc' }
      : s.dir === 'asc' ? { key, dir: 'desc' }
      : null,
    );
  }

  const showToolbar = !!(search || toolbar);

  return (
    <div>
      {showToolbar && (
        <div className="table-toolbar">
          {search && (
            <SearchInput
              value={query}
              onValueChange={setQuery}
              placeholder={search.placeholder ?? 'Search…'}
            />
          )}
          {toolbar}
        </div>
      )}

      {selectable && selected.length > 0 && (
        <div className="bulk-bar">
          <strong>{selected.length} selected</strong>
          <span className="grow" />
          {bulkActions?.(selected, () => setSelected([]))}
          <Button variant="tertiary" size="xs" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={Math.min(pageSize, 6)} cols={Math.min(columns.length, 5)} />
      ) : error ? (
        <ErrorState onRetry={onRetry} />
      ) : filtered.length === 0 ? (
        query ? (
          <EmptyState
            tight
            title={`No results for “${query}”`}
            description="Check the spelling, or clear the search to see everything."
            action={<Button variant="secondary" size="sm" onClick={() => setQuery('')}>Clear search</Button>}
          />
        ) : empty
      ) : (
        <>
          {/* Desktop: a real table. */}
          <div className={`table-wrap ${mobileCard ? 'hide-sm' : ''}`.trim()}>
            <table className="data">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead>
                <tr>
                  {selectable && (
                    <th style={{ width: 44 }}>
                      <Checkbox
                        aria-label="Select all rows on this page"
                        checked={allOnPageSelected}
                        onChange={(e) => setSelected((s) =>
                          e.target.checked
                            ? [...new Set([...s, ...pageIds])]
                            : s.filter((id) => !pageIds.includes(id)),
                        )}
                      />
                    </th>
                  )}
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        style={{ width: c.width, textAlign: c.align }}
                        className={c.sortValue ? 'sortable' : undefined}
                        aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                        onClick={c.sortValue ? () => toggleSort(c.key) : undefined}
                      >
                        {c.header}
                        {c.sortValue && <span className="sort-mark"><IconSort size={12} /></span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const id = getRowId(row);
                  const isSelected = selected.includes(id);
                  return (
                    <tr key={id} data-selected={isSelected || undefined}>
                      {selectable && (
                        <td>
                          <Checkbox
                            aria-label="Select row"
                            checked={isSelected}
                            onChange={(e) => setSelected((s) =>
                              e.target.checked ? [...s, id] : s.filter((x) => x !== id),
                            )}
                          />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} style={{ textAlign: c.align }} className={c.align === 'right' ? 'cell-num' : undefined}>
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: the same records as cards, never a squeezed table. */}
          {mobileCard && (
            <div className="record-list">
              {visible.map((row) => <div key={getRowId(row)}>{mobileCard(row)}</div>)}
            </div>
          )}

          {filtered.length > pageSize && (
            <Pagination
              page={page}
              pageCount={pageCount}
              total={filtered.length}
              from={(page - 1) * pageSize + 1}
              to={Math.min(page * pageSize, filtered.length)}
              onChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================
   Pagination — window of five, with ends always reachable
   ============================================================ */
export function Pagination({ page, pageCount, total, from, to, onChange }: {
  page: number; pageCount: number; total: number; from: number; to: number;
  onChange: (p: number) => void;
}) {
  const window = pageWindow(page, pageCount);
  return (
    <nav className="pagination" aria-label="Pagination">
      <span>Showing <strong className="t-num">{from}–{to}</strong> of <strong className="t-num">{total}</strong></span>
      <div className="pagination-controls">
        <button className="page-btn" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page">
          <IconChevronLeft size={15} />
        </button>
        {window.map((p, i) =>
          p === null
            ? <span key={`gap-${i}`} className="page-btn" aria-hidden="true">…</span>
            : (
              <button
                key={p}
                className="page-btn"
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                onClick={() => onChange(p)}
              >
                {p}
              </button>
            ),
        )}
        <button className="page-btn" onClick={() => onChange(page + 1)} disabled={page === pageCount} aria-label="Next page">
          <IconChevronRight size={15} />
        </button>
      </div>
    </nav>
  );
}

function pageWindow(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(count - 1, page + 1);
  if (start > 2) out.push(null);
  for (let p = start; p <= end; p++) out.push(p);
  if (end < count - 1) out.push(null);
  out.push(count);
  return out;
}

/* ============================================================
   SimpleTable — a table with none of the machinery. Dashboards
   and panels use it for short, already-sorted lists; it sits
   bare under a section title or inside a card.
   ============================================================ */
export function SimpleTable<T>({ rows, columns, getRowId, bare, compact, caption, onRowClick, className = '' }: {
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => string;
  bare?: boolean;
  compact?: boolean;
  caption?: string;
  onRowClick?: (row: T) => void;
  className?: string;
}) {
  return (
    <div className={`table-wrap ${className}`.trim()}>
      <table className={`data ${bare ? 'data-bare' : ''} ${compact ? 'data-compact' : ''}`.trim()}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align }} className={c.secondary ? 'hide-sm' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowId(row)}
              className={onRowClick ? 'is-link' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{ textAlign: c.align }}
                  className={[c.align === 'right' ? 'cell-num' : '', c.secondary ? 'hide-sm' : ''].filter(Boolean).join(' ') || undefined}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
