import { overlaps, toMinutes } from './overlap';

describe('toMinutes', () => {
  it('parses HH:MM', () => {
    expect(toMinutes('09:00')).toBe(540);
    expect(toMinutes('10:30')).toBe(630);
  });
  it('rejects rubbish', () => {
    expect(toMinutes('half nine')).toBeNaN();
  });
});

describe('overlaps', () => {
  const base = { dayOfWeek: 1, startTime: '09:00', endTime: '10:30' };
  it('detects a plain overlap', () => {
    expect(overlaps(base, { dayOfWeek: 1, startTime: '10:00', endTime: '11:00' })).toBe(true);
  });
  it('detects containment', () => {
    expect(overlaps(base, { dayOfWeek: 1, startTime: '09:15', endTime: '09:45' })).toBe(true);
  });
  it('ignores different days', () => {
    expect(overlaps(base, { dayOfWeek: 2, startTime: '09:00', endTime: '10:30' })).toBe(false);
  });
  it('back-to-back slots do not conflict', () => {
    expect(overlaps(base, { dayOfWeek: 1, startTime: '10:30', endTime: '12:00' })).toBe(false);
    expect(overlaps(base, { dayOfWeek: 1, startTime: '08:00', endTime: '09:00' })).toBe(false);
  });
  it('never matches on unparseable times', () => {
    expect(overlaps(base, { dayOfWeek: 1, startTime: 'x', endTime: 'y' })).toBe(false);
  });
});
