/** Minimal vCard 3.0 builder for the sharing card. Values are escaped per
 *  RFC 2426 (backslash, semicolon, comma, newline). */

export interface VCardInput {
  name: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
}

function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function buildVCard(p: VCardInput): string {
  const [first, ...rest] = p.name.split(' ');
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${esc(rest.join(' '))};${esc(first)};;;`,
    `FN:${esc(p.name)}`,
    p.company ? `ORG:${esc(p.company)}` : null,
    p.role ? `TITLE:${esc(p.role)}` : null,
    p.phone ? `TEL;TYPE=CELL:${esc(p.phone)}` : null,
    p.email ? `EMAIL:${esc(p.email)}` : null,
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\n');
}
