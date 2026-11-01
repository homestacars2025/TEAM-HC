import { isExtensionLine, isZeroRental, rentalProblem } from './rentalAmount';

describe('rental amount', () => {
  it('needs an answer, and 0 is one', () => {
    expect(rentalProblem('')).toBe('required');
    expect(rentalProblem('   ')).toBe('required');
    expect(rentalProblem('0')).toBeNull();
    expect(rentalProblem('0.00')).toBeNull();
    expect(rentalProblem('500')).toBeNull();
  });

  it('refuses a negative amount', () => {
    expect(rentalProblem('-5')).toBe('negative');
    expect(rentalProblem('abc')).toBe('negative');
  });

  it('only calls a typed zero a zero', () => {
    expect(isZeroRental('0')).toBe(true);
    expect(isZeroRental('0.00')).toBe(true);
    expect(isZeroRental('')).toBe(false);
    expect(isZeroRental('5')).toBe(false);
  });

  it('tells an extension line from the booking fee', () => {
    expect(isExtensionLine('Rental extension (10 Nov 2026 -> 15 Nov 2026)')).toBe(true);
    expect(isExtensionLine('Rental fee')).toBe(false);
    expect(isExtensionLine(null)).toBe(false);
  });
});
