/**
 * Cursor pagination.
 *
 * Offset paging (`skip`) drifts when rows are inserted between requests
 * and forces Postgres to walk every skipped row. A cursor is the id of
 * the last row returned: the next page is "everything after this one",
 * which is stable under concurrent writes and uses the index directly.
 *
 * The caller asks for `take` rows; we request one more to learn whether
 * a further page exists without a second COUNT query.
 */
export interface PageQuery {
  take?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const MAX_TAKE = 100;
export const DEFAULT_TAKE = 25;

/** Clamps client input; a request for 10,000 rows becomes a request for 100. */
export function pageArgs({ take, cursor }: PageQuery) {
  const size = Math.min(Math.max(Number(take) || DEFAULT_TAKE, 1), MAX_TAKE);
  return {
    size,
    // One extra row is the "is there more?" probe.
    take: size + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }>(rows: T[], size: number): Page<T> {
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  return {
    items,
    hasMore,
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  };
}
