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

/** Money only lands where it can really be. The server refuses any other pairing. */
export function accountsForMethod(accounts: PaymentAccount[], method: PayMethod | null): PaymentAccount[] {
  if (method === 'cash') return accounts.filter(account => account.kind === 'safe');
  if (method === 'card') return accounts.filter(account => account.kind === 'pos');
  if (method === 'bank_transfer' || method === 'online') return accounts.filter(account => account.kind === 'bank' || account.kind === 'gateway');
  return [];
}

export type PaymentProblem = 'amount' | 'method' | 'account';

/**
 * An empty or zero amount has nothing wrong with it: not paying yet is allowed.
 * `routeOptional` is for finance (admins and the Accounting page): they may record the
 * amount alone, and `record_customer_payment` accepts no method and no account from them.
 */
export function paymentProblem(draft: PaymentDraft, routeOptional = false): PaymentProblem | null {
  if (/^[\s0٠۰.,٫٬₺]*$/.test(draft.amount)) return null;
  if (parseAmount(draft.amount) === null) return 'amount';
  if (routeOptional) return null;
  if (!draft.method) return 'method';
  if (draft.accountId === null) return 'account';
  return null;
}

export const hasPayment = (draft: PaymentDraft): boolean => (parseAmount(draft.amount) ?? 0) > 0;

/** Everything that goes on a cash envelope, as `record_customer_payment` hands it back. */
export interface PaymentReceipt {
  ref: string;
  plate: string | null;
  customer: string | null;
  booking_number: string | null;
  /** `YYYY-MM-DD HH:MM`, Istanbul time. */
  date: string;
  amount: number;
  currency: PayCurrency;
  safe: string;
}

/** A refusal from the server, as a key under `payment.errors`. */
export function paymentErrorKey(message: string | undefined): string {
  const known: Array<[RegExp, string]> = [
    [/forbidden/i, 'forbidden'],
    [/into a safe/i, 'safe'],
    [/POS/i, 'pos'],
    [/bank or payment gateway/i, 'bank'],
    [/money went|account/i, 'account'],
    [/exchange rate/i, 'rate'],
    [/received/i, 'method'],
  ];
  return known.find(([pattern]) => pattern.test(message ?? ''))?.[1] ?? 'generic';
}
