/** Human-readable phone display. NANP 10/11-digit numbers get the familiar
 *  (xxx) xxx-xxxx shape; anything else renders as entered. Display only —
 *  never write this back to storage. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d.startsWith('1'))
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
}

/** Progressive MM-DD input mask: digits in, dash appears after the month.
 *  "0322" → "03-22", "03" → "03", deleting through the dash works naturally
 *  because the value is always rebuilt from the digits alone. */
export function maskBirthday(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}-${d.slice(2)}`;
}

/** Progressive NANP input mask: digits rebuild the shape as you type —
 *  2125550178 → (212) 555-0178. International input (leading +) passes
 *  through untouched; oversized NANP input stops accepting digits. */
export function maskPhone(raw: string): string {
  if (raw.trim().startsWith('+')) return raw;
  let d = raw.replace(/\D/g, '');
  if (d.length >= 11) {
    d = d[0] === '1' ? d.slice(0, 11) : d.slice(0, 10);
  }
  if (d.length === 11) {
    return `1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}
