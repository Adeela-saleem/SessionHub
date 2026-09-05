/** "HH:MM" → minutes since midnight. Invalid input becomes NaN, which
 *  never satisfies an overlap comparison. */
export function toMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface TimeSpan { dayOfWeek: number; startTime: string; endTime: string }

/** Half-open interval overlap on the same weekday. Touching edges
 *  (one ends 10:30, the next starts 10:30) do not conflict. */
export function overlaps(a: TimeSpan, b: TimeSpan): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  const aS = toMinutes(a.startTime), aE = toMinutes(a.endTime);
  const bS = toMinutes(b.startTime), bE = toMinutes(b.endTime);
  return aS < bE && bS < aE;
}
