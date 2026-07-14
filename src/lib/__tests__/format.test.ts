import { formatPhone } from '../format';

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
