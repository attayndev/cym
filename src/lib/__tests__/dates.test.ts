import { addDays, daysBetween, isoDate, monthDay, nextOccurrence } from '@/lib/dates';

describe('dates', () => {
  test('addDays / daysBetween round-trip', () => {
    const base = new Date('2026-06-13T12:00:00Z');
    expect(daysBetween(base, addDays(base, 5))).toBe(5);
    expect(daysBetween(addDays(base, -3), base)).toBe(3);
  });

  test('isoDate strips time', () => {
    expect(isoDate(new Date('2026-06-13T23:30:00Z'))).toBe('2026-06-13');
  });

  test('monthDay pads', () => {
    expect(monthDay(new Date(2026, 0, 5))).toBe('01-05');
    expect(monthDay(new Date(2026, 11, 25))).toBe('12-25');
  });

  test('nextOccurrence returns this year when the date is still ahead', () => {
    const now = new Date(2026, 5, 1); // Jun 1
    expect(nextOccurrence('06-14', now).getFullYear()).toBe(2026);
  });

  test('nextOccurrence rolls to next year when the date has passed', () => {
    const now = new Date(2026, 5, 20); // Jun 20
    const next = nextOccurrence('06-14', now);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(5);
  });

  test('nextOccurrence treats today as the next occurrence', () => {
    const now = new Date(2026, 5, 14);
    expect(nextOccurrence('06-14', now).getFullYear()).toBe(2026);
  });
});
