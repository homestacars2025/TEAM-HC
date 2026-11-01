/**
 * Fuel is the remaining driving range in km, as the car's dashboard shows it. Every form,
 * screen and print uses this one unit, and pickup charges are worked out from the drop in it.
 */

export const MAX_FUEL_RANGE_KM = 2000;

/** Keys under `fuelRange` in the `common` translations. */
export type FuelRangeProblem = 'required' | 'max';

export function fuelRangeProblem(value: string, required = false): FuelRangeProblem | null {
  if (value.trim() === '') return required ? 'required' : null;
  return Number(value) > MAX_FUEL_RANGE_KM ? 'max' : null;
}

/** `280 km`. Only a plain number is a reading, so anything else is shown as it was stored. */
export function formatFuelRange(value: number | string | null | undefined, unit = 'km'): string {
  const stored = String(value ?? '').trim();
  if (!stored) return '—';
  return /^\d+$/.test(stored) ? `${Number(stored).toLocaleString('en-US')} ${unit}` : stored;
}
