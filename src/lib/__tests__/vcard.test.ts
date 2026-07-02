import { buildVCard } from '../vcard';

describe('buildVCard', () => {
  it('includes all provided fields', () => {
    const v = buildVCard({
      name: 'Maya Chen',
      role: 'Design Lead',
      company: 'Looplight',
      email: 'maya@looplight.io',
      phone: '+1 555 0100',
    });
    expect(v).toContain('BEGIN:VCARD');
    expect(v).toContain('VERSION:3.0');
    expect(v).toContain('N:Chen;Maya;;;');
    expect(v).toContain('FN:Maya Chen');
    expect(v).toContain('ORG:Looplight');
    expect(v).toContain('TITLE:Design Lead');
    expect(v).toContain('TEL;TYPE=CELL:+1 555 0100');
    expect(v).toContain('EMAIL:maya@looplight.io');
    expect(v).toContain('END:VCARD');
  });

  it('omits absent optional fields', () => {
    const v = buildVCard({ name: 'Mom' });
    expect(v).not.toContain('ORG:');
    expect(v).not.toContain('TITLE:');
    expect(v).not.toContain('TEL;');
    expect(v).not.toContain('EMAIL:');
    expect(v).toContain('N:;Mom;;;');
  });

  it('joins multi-part last names', () => {
    const v = buildVCard({ name: 'Ana de la Cruz' });
    expect(v).toContain('N:de la Cruz;Ana;;;');
    expect(v).toContain('FN:Ana de la Cruz');
  });

  it('escapes separators and newlines in values', () => {
    const v = buildVCard({
      name: 'Smith; Jones',
      company: 'Acme, Inc.',
      role: 'Line1\nLine2',
    });
    expect(v).toContain('FN:Smith\\; Jones');
    expect(v).toContain('ORG:Acme\\, Inc.');
    expect(v).toContain('TITLE:Line1\\nLine2');
  });
});
