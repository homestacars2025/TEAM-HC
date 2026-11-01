export type RentalProblem = 'required' | 'negative';

/** 0 is a real answer: the booking still needs its line in the monthly close. Only no answer isn't. */
export function rentalProblem(text: string): RentalProblem | null {
  if (!text.trim()) return 'required';
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? null : 'negative';
}

export const isZeroRental = (text: string): boolean => text.trim() !== '' && Number(text) === 0;

/** Each extension writes its own rental line, which isn't the booking's first charge. */
export const isExtensionLine = (description: string | null): boolean => /^Rental extension/i.test(description ?? '');
