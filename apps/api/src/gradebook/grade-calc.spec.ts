import { combineWeighted, letterFor, ratioPct } from './grade-calc';

describe('combineWeighted', () => {
  it('weights categories by their declared percentages', () => {
    expect(combineWeighted([
      { weightPct: 60, pct: 90 },
      { weightPct: 40, pct: 60 },
    ])).toBe(78);
  });

  it('re-normalises when a category has no data yet', () => {
    // Final exam (30%) not held: the grade is computed from what exists.
    expect(combineWeighted([
      { weightPct: 70, pct: 80 },
      { weightPct: 30, pct: null },
    ])).toBe(80);
  });

  it('returns null when nothing has been graded', () => {
    expect(combineWeighted([{ weightPct: 100, pct: null }])).toBeNull();
    expect(combineWeighted([])).toBeNull();
  });

  it('ignores zero-weight categories', () => {
    expect(combineWeighted([
      { weightPct: 0, pct: 10 },
      { weightPct: 50, pct: 70 },
    ])).toBe(70);
  });

  it('rounds to one decimal place', () => {
    expect(combineWeighted([
      { weightPct: 3, pct: 100 },
      { weightPct: 7, pct: 50 },
    ])).toBe(65);
    expect(combineWeighted([
      { weightPct: 1, pct: 100 },
      { weightPct: 2, pct: 50 },
    ])).toBe(66.7);
  });
});

describe('ratioPct', () => {
  it('converts earned/possible to a percentage', () => {
    expect(ratioPct(7, 10)).toBe(70);
    expect(ratioPct(1, 3)).toBe(33.3);
  });
  it('is null with nothing possible', () => {
    expect(ratioPct(0, 0)).toBeNull();
  });
});

describe('letterFor', () => {
  it('maps the boundaries correctly', () => {
    expect(letterFor(90)).toBe('A+');
    expect(letterFor(89.9)).toBe('A');
    expect(letterFor(85)).toBe('A');
    expect(letterFor(75)).toBe('B');
    expect(letterFor(50)).toBe('D');
    expect(letterFor(49.9)).toBe('F');
    expect(letterFor(0)).toBe('F');
  });
  it('passes null through', () => {
    expect(letterFor(null)).toBeNull();
  });
});
