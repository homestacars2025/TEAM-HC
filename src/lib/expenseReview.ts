import { istanbulDate } from './istanbulTime';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_FILTERS = ['pending', 'unsigned', 'approved', 'rejected', 'noReceipt'] as const;
export type ReviewFilter = typeof REVIEW_FILTERS[number] | 'all';

export type MatchTarget = 'car' | 'company' | 'other';

/**
 * One custody movement as finance sees it. Nothing here says who owns a car: this
 * reaches the Team dashboard, where investors must never appear.
 */
export interface ReviewExpense {
  id: number;
  employee_id: string;
  transaction_date: string;
  direction: 'IN' | 'OUT';
  category: string | null;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  created_at: string | null;
  expense_scope: 'car' | 'company' | null;
  car_id: number | null;
  review_status: ReviewStatus;
  reviewed_at: string | null;
  review_note: string | null;
  posted_car_tx_id: number | null;
  posted_company_expense_id: number | null;
  car: { plate_number: string } | null;
  supplier: { name: string; category: string } | null;
}

/** The car a posted row is really on, which finance can change while matching. */
export interface PostedCar {
  id: number;
  car_id: number;
  plate_number: string;
}

type PostedFields = Pick<ReviewExpense, 'review_status' | 'reviewed_at' | 'posted_car_tx_id' | 'posted_company_expense_id'>;

/** Marked approved when this flow arrived, and never posted anywhere. They carry no review date. */
export const isLegacyApproval = (row: Pick<PostedFields, 'review_status' | 'reviewed_at'> & Partial<PostedFields>): boolean =>
  row.review_status === 'approved' && !row.reviewed_at && row.posted_car_tx_id == null && row.posted_company_expense_id == null;

export type Settlement = { kind: 'car'; plate: string | null } | { kind: 'company' } | { kind: 'other' } | { kind: 'legacy' };

/** Where an approved expense ended up. `null` until it is approved. */
export function settlement(row: PostedFields, posted: Map<number, PostedCar>): Settlement | null {
  if (row.review_status !== 'approved') return null;
  if (row.posted_car_tx_id !== null) return { kind: 'car', plate: posted.get(row.posted_car_tx_id)?.plate_number ?? null };
  if (row.posted_company_expense_id !== null) return { kind: 'company' };
  return isLegacyApproval(row) ? { kind: 'legacy' } : { kind: 'other' };
}

/** The row this expense became. Nothing to link to when it went nowhere. */
export function sheetLink(row: Pick<ReviewExpense, 'transaction_date' | 'posted_car_tx_id' | 'posted_company_expense_id'>, posted: Map<number, PostedCar>): string | null {
  const month = row.transaction_date.slice(0, 7);
  if (row.posted_car_tx_id !== null) {
    const car = posted.get(row.posted_car_tx_id)?.car_id;
    return `/dashboard/accounting?tab=car_sheets&month=${month}${car ? `&car=${car}` : ''}&entry=${row.posted_car_tx_id}`;
  }
  if (row.posted_company_expense_id !== null) return `/dashboard/accounting?tab=company&month=${month}&entry=${row.posted_company_expense_id}`;
  return null;
}

/** The server's own mapping, so the popover opens on what would post anyway. */
export function carSheetCategory(category: string | null): string {
  const known: Record<string, string> = { wash: 'Wash', petrol: 'Petrol', fuel: 'Petrol', maintenance: 'Maintenance', oil: 'Oil' };
  return known[(category ?? '').toLowerCase()] ?? 'Other';
}

export interface MatchDraft {
  target: MatchTarget;
  carId: number | null;
  category: string;
}

export function matchDefaults(row: Pick<ReviewExpense, 'expense_scope' | 'car_id' | 'category'>): MatchDraft {
  const target = row.expense_scope === 'car' && row.car_id !== null ? 'car' : 'company';
  return { target, carId: row.car_id, category: target === 'car' ? carSheetCategory(row.category) : row.category || 'Other' };
}

/** What pressing Add posts: the expense's own car or company, with a category the sheet knows. */
export function suggestedMatch(row: Pick<ReviewExpense, 'car_id' | 'category'>, scope: 'car' | 'company'): { target: MatchTarget; carId: number | null; category: string; note: null } {
  return scope === 'car'
    ? { target: 'car', carId: row.car_id, category: carSheetCategory(row.category), note: null }
    : { target: 'company', carId: null, category: row.category || 'Other', note: null };
}

/** The month of the expense is the month its row lands on, so that is the sheet it shows on. */
export const suggestionsFor = (rows: ReviewExpense[], month: string): ReviewExpense[] =>
  rows.filter(row => row.transaction_date.startsWith(month));

export interface ReviewContext {
  month: string;
  /** Expense ids the signed-in person has signed. */
  signed: Set<number>;
}

/** Filters look at expenses only: money handed to an employee is not reviewed. */
export function inReviewFilter(row: ReviewExpense, filter: ReviewFilter, { month, signed }: ReviewContext): boolean {
  if (filter === 'all') return true;
  if (row.direction !== 'OUT') return false;
  if (filter === 'pending') return row.review_status === 'pending';
  if (filter === 'unsigned') return row.review_status !== 'rejected' && !signed.has(row.id);
  if (filter === 'approved') return row.review_status === 'approved' && !!row.reviewed_at && istanbulDate(new Date(row.reviewed_at)).startsWith(month);
  if (filter === 'rejected') return row.review_status === 'rejected';
  return !row.receipt_url;
}

export function reviewStats(rows: ReviewExpense[], context: ReviewContext) {
  const group = (filter: ReviewFilter) => {
    const matched = rows.filter(row => row.direction === 'OUT' && inReviewFilter(row, filter, context));
    return { count: matched.length, total: matched.reduce((sum, row) => sum + row.amount, 0) };
  };
  return { all: group('all'), pending: group('pending'), unsigned: group('unsigned'), approved: group('approved'), rejected: group('rejected'), noReceipt: group('noReceipt') };
}

export interface EmployeeCustody {
  employeeId: string;
  rows: ReviewExpense[];
  balance: number;
  received: number;
  spent: number;
  pending: number;
}

/** Whoever is waiting comes first, and inside a person so do the rows to act on. */
export function employeeCustody(rows: ReviewExpense[], balances: Map<string, number>, month: string): EmployeeCustody[] {
  const groups = new Map<string, ReviewExpense[]>();
  rows.forEach(row => groups.set(row.employee_id, [...(groups.get(row.employee_id) ?? []), row]));
  const waiting = (row: ReviewExpense) => (row.direction === 'OUT' && row.review_status === 'pending' ? 0 : 1);
  const inMonth = (row: ReviewExpense) => row.transaction_date.startsWith(month);
  const sum = (own: ReviewExpense[]) => own.reduce((total, row) => total + row.amount, 0);
  return Array.from(groups, ([employeeId, own]) => ({
    employeeId,
    rows: [...own].sort((a, b) => waiting(a) - waiting(b) || b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id),
    balance: balances.get(employeeId) ?? sum(own.filter(row => row.direction === 'IN')) - sum(own.filter(row => row.direction === 'OUT')),
    received: sum(own.filter(row => row.direction === 'IN' && inMonth(row))),
    spent: sum(own.filter(row => row.direction === 'OUT' && inMonth(row))),
    pending: own.filter(row => row.direction === 'OUT' && row.review_status === 'pending').length,
  })).sort((a, b) => b.pending - a.pending);
}

/** A refusal from the server, as a key under `review.errors`. */
export function reviewErrorKey(message: string | undefined): string {
  const known: Array<[RegExp, string]> = [
    [/forbidden/i, 'forbidden'],
    [/no investor/i, 'noCarSheet'],
    [/Already approved/i, 'alreadyDone'],
    [/Only pending/i, 'alreadyDone'],
    [/Reason required/i, 'reason'],
    [/Choose a car/i, 'car'],
  ];
  return known.find(([pattern]) => pattern.test(message ?? ''))?.[1] ?? 'generic';
}
