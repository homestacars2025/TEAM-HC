import { istanbulDate } from './istanbulTime';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export const REVIEW_FILTERS = ['pending', 'approved', 'rejected', 'noReceipt'] as const;
export type ReviewFilter = typeof REVIEW_FILTERS[number] | 'all';

/**
 * A custody expense as finance sees it. Nothing here says who owns a car: this
 * reaches the Team dashboard, where investors must never appear.
 */
export interface ReviewExpense {
  id: number;
  employee_id: string;
  transaction_date: string;
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
  car: { plate_number: string; model_group: { name: string; image_url: string | null } | null } | null;
  supplier: { name: string; category: string } | null;
}

export type PostingTarget = { kind: 'car'; plate: string } | { kind: 'company' };

/** The same test `finance_approve_custody_expense` makes. */
export function postingTarget(row: Pick<ReviewExpense, 'expense_scope' | 'car_id' | 'car'>): PostingTarget {
  if (row.expense_scope === 'car' && row.car_id !== null) return { kind: 'car', plate: row.car?.plate_number ?? '—' };
  return { kind: 'company' };
}

/** The row this expense became. `null` for one confirmed before anything was posted. */
export function sheetLink(row: Pick<ReviewExpense, 'transaction_date' | 'car_id' | 'posted_car_tx_id' | 'posted_company_expense_id'>): string | null {
  const month = row.transaction_date.slice(0, 7);
  if (row.posted_car_tx_id !== null) return `/dashboard/accounting?tab=cars&month=${month}&car=${row.car_id}&entry=${row.posted_car_tx_id}`;
  if (row.posted_company_expense_id !== null) return `/dashboard/accounting?tab=expenses&month=${month}&entry=${row.posted_company_expense_id}`;
  return null;
}

/** "This month" counts the day it was confirmed, which older rows never had. */
export function inReviewFilter(row: ReviewExpense, filter: ReviewFilter, month: string): boolean {
  if (filter === 'pending') return row.review_status === 'pending';
  if (filter === 'approved') return row.review_status === 'approved' && !!row.reviewed_at && istanbulDate(new Date(row.reviewed_at)).startsWith(month);
  if (filter === 'rejected') return row.review_status === 'rejected';
  if (filter === 'noReceipt') return !row.receipt_url;
  return true;
}

export function reviewStats(rows: ReviewExpense[], month: string) {
  const group = (filter: ReviewFilter) => {
    const matched = rows.filter(row => inReviewFilter(row, filter, month));
    return { count: matched.length, total: matched.reduce((sum, row) => sum + row.amount, 0) };
  };
  return { all: group('all'), pending: group('pending'), approved: group('approved'), rejected: group('rejected'), noReceipt: group('noReceipt') };
}

export interface EmployeeGroup {
  employeeId: string;
  rows: ReviewExpense[];
  pendingTotal: number;
}

/** Whoever is waiting comes first, and inside a group so do the rows to act on. */
export function groupByEmployee(rows: ReviewExpense[]): EmployeeGroup[] {
  const groups = new Map<string, ReviewExpense[]>();
  rows.forEach(row => groups.set(row.employee_id, [...(groups.get(row.employee_id) ?? []), row]));
  const waiting = (row: ReviewExpense) => (row.review_status === 'pending' ? 0 : 1);
  return Array.from(groups, ([employeeId, own]) => ({
    employeeId,
    rows: [...own].sort((a, b) => waiting(a) - waiting(b) || b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id),
    pendingTotal: own.filter(row => row.review_status === 'pending').reduce((sum, row) => sum + row.amount, 0),
  })).sort((a, b) => b.pendingTotal - a.pendingTotal);
}

/** A refusal from the server, as a key under `review.errors`. */
export function reviewErrorKey(message: string | undefined): string {
  const known: Array<[RegExp, string]> = [
    [/forbidden/i, 'forbidden'],
    [/no investor/i, 'noCarSheet'],
    [/Already approved/i, 'alreadyDone'],
    [/Only pending/i, 'alreadyDone'],
    [/Reason required/i, 'reason'],
  ];
  return known.find(([pattern]) => pattern.test(message ?? ''))?.[1] ?? 'generic';
}
