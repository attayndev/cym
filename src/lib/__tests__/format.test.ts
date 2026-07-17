import { formatPhone, maskBirthday } from '../format';

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
