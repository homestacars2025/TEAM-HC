import { parseAmount } from './custodyExpense';

export const PAY_CURRENCIES = ['TRY', 'USD', 'EUR'] as const;
export type PayCurrency = typeof PAY_CURRENCIES[number];

export const PAY_METHODS = ['cash', 'bank_transfer', 'card', 'online'] as const;
export type PayMethod = typeof PAY_METHODS[number];

export type PaymentType = 'payment' | 'deposit';

export interface PaymentAccount {
  id: number;
  name: string;
  kind: string;
}

export interface PaymentDraft {
  amount: string;
  currency: PayCurrency;
  method: PayMethod | null;
  accountId: number | null;
}

export const emptyPayment = (): PaymentDraft => ({ amount: '', currency: 'TRY', method: null, accountId: null });

interface RateRow { currency: string; rate_to_try: number; }

export function rateOf(currency: PayCurrency, rates: RateRow[]): number | null {
  if (currency === 'TRY') return 1;
  const rate = rates.find(row => row.currency === currency)?.rate_to_try;
  return rate && rate > 0 ? Number(rate) : null;
}

/** A preview. The server works out the figure that is stored, from the same table. */
export function toLira(draft: Pick<PaymentDraft, 'amount' | 'currency'>, rates: RateRow[]): number {
  const amount = parseAmount(draft.amount) ?? 0;
  return Math.round(amount * (rateOf(draft.currency, rates) ?? 0) * 100) / 100;
}

/**
 * Money only lands where it can really be. The server insists on this for cards only,
 * but a bank transfer sitting in a POS account would throw off both balances.
 */
export function accountsForMethod(accounts: PaymentAccount[], method: PayMethod | null): PaymentAccount[] {
  if (method === 'card') return accounts.filter(account => account.kind === 'pos');
  if (method === 'bank_transfer') return accounts.filter(account => account.kind === 'bank');
  if (method === 'online') return accounts.filter(account => account.kind === 'gateway');
  return [];
}

export type PaymentProblem = 'amount' | 'method' | 'account';

/** An untouched draft has nothing wrong with it: paying nothing is allowed. */
export function paymentProblem(draft: PaymentDraft): PaymentProblem | null {
  if (!draft.amount.trim()) return null;
  if (parseAmount(draft.amount) === null) return 'amount';
  if (!draft.method) return 'method';
  if (draft.method !== 'cash' && draft.accountId === null) return 'account';
  return null;
}

export const hasPayment = (draft: PaymentDraft): boolean => (parseAmount(draft.amount) ?? 0) > 0;

export interface PaymentReceipt {
  ref: string;
  amount: number;
  currency: PayCurrency;
  plate: string | null;
  customer: string | null;
}

/** A refusal from the server, as a key under `payment.errors`. */
export function paymentErrorKey(message: string | undefined): string {
  const known: Array<[RegExp, string]> = [
    [/forbidden/i, 'forbidden'],
    [/account/i, 'account'],
    [/POS/i, 'account'],
    [/exchange rate/i, 'rate'],
    [/received/i, 'method'],
  ];
  return known.find(([pattern]) => pattern.test(message ?? ''))?.[1] ?? 'generic';
}
