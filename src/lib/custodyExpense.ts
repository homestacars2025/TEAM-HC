import { sortCarsByModel } from './car-picker';

/**
 * The rules of the Add expense form, kept out of the components so they can be
 * tested. The server checks the same things again in `staff_add_custody_expense`.
 */

export type ExpenseScope = 'car' | 'company';

export interface ExpenseCategory {
  /** What is stored in `employee_wallets.category`. Always English. */
  value: string;
  /** Under `expense.categories` in the custody translations. */
  key: string;
}

export const EXPENSE_CATEGORIES: Record<ExpenseScope, ExpenseCategory[]> = {
  car: [
    { value: 'Wash', key: 'wash' },
    { value: 'Petrol', key: 'petrol' },
    { value: 'Parking', key: 'parking' },
    { value: 'Maintenance', key: 'maintenance' },
    { value: 'Oil', key: 'oil' },
    { value: 'Other', key: 'other' },
  ],
  company: [
    { value: 'Branch', key: 'branch' },
    { value: 'Office supplies', key: 'officeSupplies' },
    { value: 'Transport', key: 'transport' },
    { value: 'Other', key: 'other' },
  ],
};

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** An Arabic keyboard types its own digits; everything downstream wants Latin ones. */
export function latinDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, digit => {
    const arabic = ARABIC_DIGITS.indexOf(digit);
    return String(arabic >= 0 ? arabic : PERSIAN_DIGITS.indexOf(digit));
  });
}

/**
 * Takes what a phone keypad produces, in any locale: `12,50`, `12.50`, `1.250,50`,
 * `1,250.50`, `١٢٫٥`. Money has at most two decimals, so a final group of exactly
 * three digits is thousands, not decimals. `null` when it isn't a positive amount.
 */
export function parseAmount(text: string): number | null {
  const cleaned = latinDigits(text).replace(/[\s₺]/g, '').replace(/٫/g, ',').replace(/٬/g, '.');
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;

  const lastSeparator = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  let whole = cleaned;
  let decimals = '';
  if (lastSeparator !== -1) {
    const tail = cleaned.slice(lastSeparator + 1);
    if (tail.length !== 3) {
      if (tail.length > 2) return null;
      whole = cleaned.slice(0, lastSeparator);
      decimals = tail;
      // One character can't be both the thousands and the decimal separator.
      if (whole.includes(cleaned[lastSeparator])) return null;
    }
  }
  if (!/^\d{1,3}(?:[.,]\d{3})*$|^\d+$/.test(whole)) return null;

  const amount = Number(`${whole.replace(/[.,]/g, '')}.${decimals || '0'}`);
  return amount > 0 ? amount : null;
}

/** `34KDK804` → `34 KDK 804`, the way it is printed on the car. */
export function formatPlate(plate: string): string {
  const parts = plate.trim().toUpperCase().match(/^(\d{2})\s*([A-ZÇĞİÖŞÜ]{1,3})\s*(\d{2,4})$/);
  return parts ? `${parts[1]} ${parts[2]} ${parts[3]}` : plate;
}

export interface ExpenseCar {
  id: number;
  plate_number: string;
  model: string | null;
}

export interface CarGroup {
  model: string | null;
  cars: ExpenseCar[];
}

/** Models A to Z, plates in order inside each, and a car with no model last. */
export function groupCars(cars: readonly ExpenseCar[]): CarGroup[] {
  const groups: CarGroup[] = [];
  for (const car of sortCarsByModel(cars)) {
    const model = car.model?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.model === model) last.cars.push(car);
    else groups.push({ model, cars: [car] });
  }
  return groups;
}

const searchable = (text: string): string => latinDigits(text).toLocaleLowerCase('en').replace(/\s+/g, '');

/** Spaces never matter, so `34 kdk` finds 34KDK804. */
export function filterCars(cars: readonly ExpenseCar[], query: string): ExpenseCar[] {
  const needle = searchable(query);
  if (!needle) return [...cars];
  return cars.filter(car => searchable(car.plate_number).includes(needle) || searchable(car.model ?? '').includes(needle));
}

interface UsedCar {
  car_id?: number | null;
}

/**
 * The cars this person used last, newest first. `rows` is oldest first, the order
 * the movements arrive in. A car that has since left the fleet is not offered.
 */
export function recentCars(rows: readonly UsedCar[], cars: readonly ExpenseCar[], limit = 3): ExpenseCar[] {
  const seen = new Set<number>();
  const recent: ExpenseCar[] = [];
  for (let i = rows.length - 1; i >= 0 && recent.length < limit; i -= 1) {
    const id = rows[i].car_id;
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    const car = cars.find(c => c.id === id);
    if (car) recent.push(car);
  }
  return recent;
}

export type ExpenseProblem = 'amount' | 'car' | 'category' | 'description' | 'date' | 'receipt';

export interface ExpenseDraft {
  amount: string;
  scope: ExpenseScope;
  carId: number | null;
  category: string | null;
  description: string;
  date: string;
  hasReceipt: boolean;
}

/** What still stands in the way of saving, in the order the form asks for it. */
export function expenseProblems(draft: ExpenseDraft, today: string): ExpenseProblem[] {
  const problems: ExpenseProblem[] = [];
  if (parseAmount(draft.amount) === null) problems.push('amount');
  if (draft.scope === 'car' && draft.carId === null) problems.push('car');
  if (!draft.category) problems.push('category');
  if (!draft.description.trim()) problems.push('description');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || draft.date > today) problems.push('date');
  if (!draft.hasReceipt) problems.push('receipt');
  return problems;
}

const HOURS_24 = 24 * 60 * 60 * 1000;

interface DeletableRow {
  direction: 'IN' | 'OUT';
  created_by?: string | null;
  created_at?: string | null;
  posted_car_tx_id?: number | null;
  posted_company_expense_id?: number | null;
  review_status?: string | null;
}

/** The same test `staff_delete_custody_expense` applies, so the button never lies. */
export function canDeleteExpense(row: DeletableRow, userId: string | null, now = Date.now()): boolean {
  if (!userId || row.direction !== 'OUT' || row.created_by !== userId || !row.created_at) return false;
  if (row.review_status !== 'pending') return false;
  if (row.posted_car_tx_id != null || row.posted_company_expense_id != null) return false;
  return now - new Date(row.created_at).getTime() < HOURS_24;
}

/** Turns the server's refusal into a translation key under `expense.errors`. */
export function expenseErrorKey(message: string | undefined): string {
  const known: Array<[RegExp, string]> = [
    [/Amount/i, 'amount'],
    [/Category/i, 'category'],
    [/Description/i, 'description'],
    [/Choose a car/i, 'car'],
    [/Choose car or company/i, 'scope'],
    [/Receipt/i, 'receipt'],
    [/Invalid date/i, 'date'],
    [/not active/i, 'inactive'],
    [/signed in/i, 'signedOut'],
    [/within 24 hours/i, 'tooLate'],
  ];
  return known.find(([pattern]) => pattern.test(message ?? ''))?.[1] ?? 'generic';
}
