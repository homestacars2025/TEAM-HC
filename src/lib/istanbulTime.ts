/**
 * "Today" for this business means Istanbul, wherever the browser happens to be, so
 * the greeting and every `date` column comparison go through here.
 */

export const BUSINESS_TIME_ZONE = 'Europe/Istanbul';

/** `YYYY-MM-DD`, the shape of a Postgres `date`. */
export function istanbulDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

export function istanbulHour(at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE, hour: '2-digit', hourCycle: 'h23',
  }).format(at);
  return Number(hour);
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
