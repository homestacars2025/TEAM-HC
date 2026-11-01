import {
  EXPENSE_CATEGORIES, canDeleteExpense, expenseErrorKey, expenseProblems, filterCars, formatPlate, groupCars,
  latinDigits, parseAmount, recentCars, type ExpenseCar, type ExpenseDraft,
} from './custodyExpense';
import { fittedSize, isPdfFile, receiptRejection } from './receiptImage';
import { receiptPath } from './queries/custody';

const car = (id: number, plate_number: string, model: string | null): ExpenseCar => ({ id, plate_number, model });
const CARS = [car(1, '34ZZZ100', 'Renault Clio'), car(2, '34AAA200', 'Renault Clio'), car(3, '06FHP284', 'Fiat Egea'), car(4, '34KDK804', 'Hyundai i20'), car(5, '34NLP107', null)];

describe('parseAmount', () => {
  test.each([
    ['150', 150], ['12,50', 12.5], ['12.50', 12.5], ['12,5', 12.5], ['1.250,50', 1250.5], ['1,250.50', 1250.5],
    ['1.250', 1250], ['1,250', 1250], ['1.234.567,89', 1234567.89], ['٧٥', 75], ['١٢٫٥', 12.5], ['۳۰۰', 300], ['₺ 45', 45], ['45,', 45],
  ])('%s is %d', (text, expected) => expect(parseAmount(text)).toBe(expected));

  test.each(['', '0', '0,00', 'abc', '-5', '12,345,6', '1.2345', '1..2', ',5'])('%j is refused', text => {
    expect(parseAmount(text)).toBeNull();
  });
});

test('Arabic and Persian digits become Latin', () => {
  expect(latinDigits('٣٤ ۱۲ ab')).toBe('34 12 ab');
});

test('plates read the way they are printed, and an odd one is left alone', () => {
  expect(formatPlate('34KDK804')).toBe('34 KDK 804');
  expect(formatPlate('34DK6500')).toBe('34 DK 6500');
  expect(formatPlate('TEST-1')).toBe('TEST-1');
});

test('cars group by model A to Z, plates in order, no model last', () => {
  expect(groupCars(CARS).map(g => [g.model, g.cars.map(c => c.plate_number)])).toEqual([
    ['Fiat Egea', ['06FHP284']],
    ['Hyundai i20', ['34KDK804']],
    ['Renault Clio', ['34AAA200', '34ZZZ100']],
    [null, ['34NLP107']],
  ]);
});

test('the search finds a plate or a model, ignoring spaces, case and Arabic digits', () => {
  const ids = (query: string) => filterCars(CARS, query).map(c => c.id);
  expect(ids('34 kdk')).toEqual([4]);
  expect(ids('CLIO')).toEqual([1, 2]);
  expect(ids('٣٤ك')).toEqual([]);
  expect(ids('٨٠٤')).toEqual([4]);
  expect(ids('  ')).toHaveLength(5);
});

test('recent cars are newest first, unique, and only ones still in the fleet', () => {
  const rows = [{ car_id: 1 }, { car_id: 3 }, { car_id: null }, { car_id: 99 }, { car_id: 2 }, { car_id: 3 }];
  expect(recentCars(rows, CARS).map(c => c.id)).toEqual([3, 2, 1]);
  expect(recentCars(rows, CARS, 1).map(c => c.id)).toEqual([3]);
});

const DRAFT: ExpenseDraft = { amount: '50', scope: 'car', carId: 1, category: 'Wash', description: 'x', date: '2026-10-31', hasReceipt: true };

describe('expenseProblems', () => {
  test('a complete expense has none', () => expect(expenseProblems(DRAFT, '2026-10-31')).toEqual([]));
  test('company needs no car', () => expect(expenseProblems({ ...DRAFT, scope: 'company', carId: null }, '2026-10-31')).toEqual([]));
  test('they come back in form order', () => {
    expect(expenseProblems({ amount: '', scope: 'car', carId: null, category: null, description: '  ', date: '', hasReceipt: false }, '2026-10-31'))
      .toEqual(['amount', 'car', 'category', 'description', 'date', 'receipt']);
  });
  test('tomorrow is refused', () => expect(expenseProblems({ ...DRAFT, date: '2026-11-01' }, '2026-10-31')).toEqual(['date']));
});

test('every category is stored in English, with both scopes ending in Other', () => {
  for (const list of Object.values(EXPENSE_CATEGORIES)) {
    expect(list.every(c => /^[A-Za-z ]+$/.test(c.value))).toBe(true);
    expect(list[list.length - 1].value).toBe('Other');
  }
});

describe('canDeleteExpense', () => {
  const NOW = Date.parse('2026-10-31T12:00:00Z');
  const row = { direction: 'OUT' as const, created_by: 'me', created_at: '2026-10-31T01:00:00Z', posted_car_tx_id: null, posted_company_expense_id: null, review_status: 'pending' };
  test('own, recent, unposted', () => expect(canDeleteExpense(row, 'me', NOW)).toBe(true));
  test('after 24 hours', () => expect(canDeleteExpense({ ...row, created_at: '2026-10-30T11:59:00Z' }, 'me', NOW)).toBe(false));
  test('someone else recorded it', () => expect(canDeleteExpense({ ...row, created_by: 'finance' }, 'me', NOW)).toBe(false));
  test('money coming in', () => expect(canDeleteExpense({ ...row, direction: 'IN' }, 'me', NOW)).toBe(false));
  test('already posted', () => expect(canDeleteExpense({ ...row, posted_car_tx_id: 8 }, 'me', NOW)).toBe(false));
  test('no user yet', () => expect(canDeleteExpense(row, null, NOW)).toBe(false));
});

test('each server refusal maps to a message', () => {
  expect(expenseErrorKey('Receipt photo required')).toBe('receipt');
  expect(expenseErrorKey('Choose a car')).toBe('car');
  expect(expenseErrorKey('Can only delete your own expense within 24 hours')).toBe('tooLate');
  expect(expenseErrorKey('something else')).toBe('generic');
  expect(expenseErrorKey(undefined)).toBe('generic');
});

test('a receipt never grows, and its long side stops at 1600', () => {
  expect(fittedSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  expect(fittedSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  expect(fittedSize(800, 600)).toEqual({ width: 800, height: 600 });
});

test('receipts must be an image or a PDF of a sane size', () => {
  expect(isPdfFile({ name: 'a.PDF', type: '' })).toBe(true);
  expect(receiptRejection({ name: 'a.jpg', type: 'image/jpeg', size: 5e6 })).toBeNull();
  expect(receiptRejection({ name: 'a.pdf', type: 'application/pdf', size: 11 * 1024 * 1024 })).toBe('receiptTooLarge');
  expect(receiptRejection({ name: 'a.doc', type: 'application/msword', size: 10 })).toBe('receiptType');
});

test('uploads land in the user\'s own folder, under the month', () => {
  expect(receiptPath('u1', { name: 'x.heic', type: 'image/jpeg' }, 'abc', '2026-10-31')).toBe('u1/2026-10/abc.jpg');
  expect(receiptPath('u1', { name: 'x.pdf', type: 'application/pdf' }, 'abc', '2026-10-31')).toBe('u1/2026-10/abc.pdf');
  expect(receiptPath('u1', { name: 'x.png', type: '' }, 'abc', '2026-10-31')).toBe('u1/2026-10/abc.png');
});
