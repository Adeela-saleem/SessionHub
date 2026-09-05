/**
 * Pure grade arithmetic — no I/O, fully unit-tested.
 *
 * A category's score is null until it has data (no graded assignments,
 * no held sessions). Null categories are excluded from the weighted
 * combination and the remaining weights are re-normalised, so an empty
 * "Final exam 30%" early in the semester doesn't drag everyone to 70%.
 */

export interface CategoryScore {
  weightPct: number;
  /** 0–100, or null when the category has no data yet. */
  pct: number | null;
}

export function combineWeighted(categories: CategoryScore[]): number | null {
  const scored = categories.filter((c) => c.pct !== null && c.weightPct > 0);
  const totalWeight = scored.reduce((sum, c) => sum + c.weightPct, 0);
  if (totalWeight === 0) return null;
  const weighted = scored.reduce((sum, c) => sum + (c.pct as number) * c.weightPct, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

/** Points earned over points possible, as a 0–100 percentage. */
export function ratioPct(earned: number, possible: number): number | null {
  if (possible <= 0) return null;
  return Math.round((earned / possible) * 1000) / 10;
}

const SCALE: [number, string][] = [
  [90, 'A+'], [85, 'A'], [80, 'B+'], [75, 'B'],
  [70, 'C+'], [65, 'C'], [50, 'D'],
];

export function letterFor(pct: number | null): string | null {
  if (pct === null) return null;
  for (const [min, letter] of SCALE) if (pct >= min) return letter;
  return 'F';
}
