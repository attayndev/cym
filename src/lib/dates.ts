const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "06-14" for June 14 */
export function monthDay(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** Next occurrence of an MM-DD birthday on or after `now`. */
export function nextOccurrence(mmdd: string, now: Date): Date {
  const [m, d] = mmdd.split('-').map(Number);
  const candidate = new Date(now.getFullYear(), m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return candidate >= today
    ? candidate
    : new Date(now.getFullYear() + 1, m - 1, d);
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function relativeDays(iso: string, now: Date): string {
  const days = daysBetween(new Date(iso), now);
  if (days <= 0) {
    const ahead = -days;
    if (ahead === 0) return 'today';
    if (ahead === 1) return 'tomorrow';
    return `in ${ahead} days`;
  }
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? 'a month ago' : `${months} months ago`;
  const years = Math.round(months / 12);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}
