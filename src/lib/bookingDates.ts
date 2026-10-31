/** Dates here are plain `YYYY-MM-DD` strings, the shape of a Postgres `date`, so no time zone can move them. */

const toDayNumber = (iso: string): number => {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};

/** Rental days: the 10th to the 15th is 5. A same-day booking still counts as one. */
export function rentalDays(start: string, end: string): number {
  if (!start || !end) return 0;
  return Math.max(toDayNumber(end) - toDayNumber(start), 1);
}

export const addDay = (iso: string, by: number): string =>
  new Date(Date.UTC(...(iso.split('-').map(Number).map((part, index) => (index === 1 ? part - 1 : part)) as [number, number, number])) + by * 86400000)
    .toISOString().slice(0, 10);

export interface MonthDay {
  iso: string;
  day: number;
  inMonth: boolean;
}

/** A six-week grid, Monday first, so the calendar never changes height between months. */
export function monthGrid(year: number, month: number): MonthDay[] {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month, 1 - offset + index));
    return { iso: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: date.getUTCMonth() === month };
  });
}

/** What clicking a day does to the range: the first click starts it, the second ends it. */
export function nextRange(start: string, end: string, day: string): { start: string; end: string } {
  if (!start || end || day < start) return { start: day, end: '' };
  return { start, end: day };
}
