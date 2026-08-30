/**
 * Ordering for the car dropdowns.
 *
 * Every picker in the dashboard reads `PLATE — Model`, and staff pick a car by
 * recognising the model first: "the white i20" narrows to a handful of plates,
 * where a flat alphabetical plate list scatters those same cars across the
 * whole menu. So the list groups by model, and plates run in order inside each
 * group.
 *
 * The two field names both exist in the wild — `model` in Car Issues, and
 * `model_name` in Fines and Accounting — so the comparator reads either rather
 * than forcing three pages to rename their own option types.
 */

export interface PickerCar {
  plate_number: string;
  model?: string | null;
  model_name?: string | null;
}

const modelOf = (c: PickerCar): string => (c.model ?? c.model_name ?? '').trim();

/**
 * Collated as English on purpose. Model names and plates are Latin whichever
 * language the dashboard is in, so Arabic collation would only reorder them
 * against what is printed on the car.
 *
 * `numeric` keeps 34ABC9 ahead of 34ABC10, which a plain string sort inverts.
 */
const compare = (a: string, b: string): number =>
  a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

export function compareCarsByModel(a: PickerCar, b: PickerCar): number {
  const ma = modelOf(a);
  const mb = modelOf(b);
  if (ma !== mb) {
    // A car with no model group sinks to the bottom rather than sorting under
    // the empty string, where it would head the list looking like an error.
    if (!ma) return 1;
    if (!mb) return -1;
    const byModel = compare(ma, mb);
    if (byModel !== 0) return byModel;
  }
  return compare(a.plate_number, b.plate_number);
}

/** Non-mutating, so a fetched array can be handed straight in. */
export function sortCarsByModel<T extends PickerCar>(cars: readonly T[]): T[] {
  return [...cars].sort(compareCarsByModel);
}
