import { formatMonthDay } from '@/i18n';

import { formatPhone, maskBirthday, maskPhone } from '../format';

describe('formatPhone', () => {
  it('formats a 10-digit NANP number', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567');
  });

  it('formats an 11-digit number with a leading 1', () => {
    expect(formatPhone('15551234567')).toBe('(555) 123-4567');
  });

  it('passes through international numbers unchanged', () => {
    // Not 10 or 11 digits once stripped, so it doesn't match the NANP shape.
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
  });

  it('passes through already-formatted input unchanged', () => {
    expect(formatPhone('(555) 123-4567')).toBe('(555) 123-4567');
  });
});

describe('maskBirthday', () => {
  test('inserts the dash after the month', () => {
    expect(maskBirthday('0322')).toBe('03-22');
    expect(maskBirthday('032')).toBe('03-2');
  });
  test('partial and empty input pass through', () => {
    expect(maskBirthday('0')).toBe('0');
    expect(maskBirthday('03')).toBe('03');
    expect(maskBirthday('')).toBe('');
  });
  test('strips stray characters and caps at four digits', () => {
    expect(maskBirthday('03-22')).toBe('03-22');
    expect(maskBirthday('03/22/1990')).toBe('03-22');
    expect(maskBirthday('3a')).toBe('3');
  });
});

describe('maskPhone', () => {
  test('progressive NANP shaping as digits accrue', () => {
    expect(maskPhone('2')).toBe('2');
    expect(maskPhone('21')).toBe('21');
    expect(maskPhone('212')).toBe('212');
    expect(maskPhone('2125')).toBe('(212) 5');
    expect(maskPhone('21255')).toBe('(212) 55');
    expect(maskPhone('212555')).toBe('(212) 555');
    expect(maskPhone('2125550')).toBe('(212) 555-0');
    expect(maskPhone('21255501')).toBe('(212) 555-01');
    expect(maskPhone('212555017')).toBe('(212) 555-017');
    expect(maskPhone('2125550178')).toBe('(212) 555-0178');
  });

  test('11 digits with a leading 1 get the country-code shape', () => {
    expect(maskPhone('12125550178')).toBe('1 (212) 555-0178');
  });

  test('international input (leading +) passes through untouched', () => {
    expect(maskPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(maskPhone('  +1 555 123 4567')).toBe('  +1 555 123 4567');
  });

  test('backspacing regenerates cleanly from the shorter digit string', () => {
    expect(maskPhone('(212) 555-017')).toBe('(212) 555-017');
    expect(maskPhone('(212) 555-01')).toBe('(212) 555-01');
    expect(maskPhone('(212) 555-')).toBe('(212) 555');
    expect(maskPhone('(212) 55')).toBe('(212) 55');
    expect(maskPhone('(21')).toBe('21');
  });

  test('oversized NANP input stops accepting digits', () => {
    // No leading 1: caps at 10 digits, ignoring the rest.
    expect(maskPhone('92125550178999')).toBe('(921) 255-5017');
    // Leading 1: caps at 11 digits, ignoring the rest.
    expect(maskPhone('121255501789999')).toBe('1 (212) 555-0178');
  });
});

describe('formatMonthDay', () => {
  test('renders a localized short month and day', () => {
    expect(formatMonthDay('03-22')).toBe('Mar 22');
    expect(formatMonthDay('12-01')).toBe('Dec 1');
  });

  test('invalid input echoes back unchanged', () => {
    expect(formatMonthDay('13-01')).toBe('13-01');
    expect(formatMonthDay('')).toBe('');
    expect(formatMonthDay('03/22')).toBe('03/22');
  });
});
