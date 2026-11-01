import fs from 'fs';
import path from 'path';
import { accountFilter, canReverse, cashErrorKey, findEnvelope, holdingSummary, inCashFilter, isOverdue, movementInFilter, pendingSettlement, type Envelope, type Movement } from './envelopes';
import { accountsForMethod, emptyPayment, hasPayment, paymentErrorKey, paymentProblem, rateOf, toLira, type PaymentDraft } from './payments';

const RATES = [{ currency: 'USD', rate_to_try: 49 }, { currency: 'EUR', rate_to_try: 53 }];
const draft = (o: Partial<PaymentDraft> = {}): PaymentDraft => ({ ...emptyPayment(), ...o });

describe('a payment before it is sent', () => {
  it('converts for the preview', () => {
    expect(toLira(draft({ amount: '300', currency: 'USD' }), RATES)).toBe(14700);
    expect(toLira(draft({ amount: '1.250,50' }), RATES)).toBe(1250.5);
    expect(rateOf('EUR', RATES)).toBe(53);
    expect(rateOf('TRY', RATES)).toBe(1);
  });

  it('has nothing wrong with no amount: paying nothing is allowed', () => {
    expect(paymentProblem(emptyPayment())).toBeNull();
    expect(hasPayment(emptyPayment())).toBe(false);
  });

  it('asks for the method, then the account, except for cash', () => {
    expect(paymentProblem(draft({ amount: 'abc' }))).toBe('amount');
    expect(paymentProblem(draft({ amount: '100' }))).toBe('method');
    expect(paymentProblem(draft({ amount: '100', method: 'card' }))).toBe('account');
    expect(paymentProblem(draft({ amount: '100', method: 'card', accountId: 6 }))).toBeNull();
    expect(paymentProblem(draft({ amount: '100', method: 'cash' }))).toBeNull();
  });

  it('only offers accounts the money could really be in', () => {
    const accounts = [{ id: 1, name: 'POS', kind: 'pos' }, { id: 2, name: 'Bank', kind: 'bank' }, { id: 3, name: 'Gate', kind: 'gateway' }];
    expect(accountsForMethod(accounts, 'card').map(a => a.id)).toEqual([1]);
    expect(accountsForMethod(accounts, 'bank_transfer').map(a => a.id)).toEqual([2]);
    expect(accountsForMethod(accounts, 'online').map(a => a.id)).toEqual([3]);
    expect(accountsForMethod(accounts, 'cash')).toEqual([]);
  });

  it.each([
    ['forbidden', 'forbidden'],
    ['Card payments go to a POS account', 'account'],
    ['Choose the account the money went to', 'account'],
    ['No exchange rate for EUR', 'rate'],
    ['Choose how the money was received', 'method'],
    ['boom', 'generic'],
  ])('%s', (message, key) => expect(paymentErrorKey(message)).toBe(key));
});

describe('every payment goes through the server', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

  it.each(['pages/BookingsPage.tsx', 'pages/CustomerWalletsPage.tsx'])('%s calls record_customer_payment through recordPayment', file => {
    expect(read(file)).toContain('recordPayment(');
  });

  it('no booking save writes a payment or deposit row', () => {
    const source = read('pages/BookingsPage.tsx');
    expect(source).not.toMatch(/type: 'deposit'|type: 'payment'/);
    expect(source).not.toContain("key: 'deposit'");
    expect(source).not.toContain("key: 'payment'");
  });

  it('extending sends no money to the old function', () => {
    expect(read('pages/BookingsPage.tsx')).toMatch(/p_paid_amount: +0,/);
  });

  it('a wallet payment never reaches the plain insert', () => {
    const source = read('pages/CustomerWalletsPage.tsx');
    expect(source.indexOf('if (isPayment) {')).toBeLessThan(source.indexOf(".from('customer_accounting_ledger').insert"));
  });
});

const NOW = Date.parse('2026-11-10T12:00:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const envelope = (o: Partial<Envelope> = {}): Envelope => ({
  id: 1, ref: 'ENV-2611-0001', amount: 100, currency: 'TRY', holder_profile_id: 'a', status: 'with_employee', current_account_id: null, booking_id: 1,
  counted_amount: null, difference: null, difference_note: null, created_at: ago(1), handed_at: null, admin_received_at: null, customer: null, car: null, ...o,
});
const movement = (o: Partial<Movement> = {}): Movement => ({
  id: 1, ref: 'MOV-1', kind: 'transfer', status: 'done', from_account_id: 1, to_account_id: 2, amount: 100, currency: 'TRY', amount_try: 100,
  expected_at: null, note: null, reverses_id: null, created_by: null, created_at: ago(1), ...o,
});

describe('envelopes', () => {
  it('is late after 24 hours, and only while with staff', () => {
    expect(isOverdue(envelope({ created_at: ago(23) }), NOW)).toBe(false);
    expect(isOverdue(envelope({ created_at: ago(25) }), NOW)).toBe(true);
    expect(isOverdue(envelope({ created_at: ago(25), status: 'in_safe' }), NOW)).toBe(false);
  });

  it('adds up what someone holds per currency, never across', () => {
    const summary = holdingSummary([envelope({ amount: 100 }), envelope({ amount: 50 }), envelope({ amount: 20, currency: 'USD' }), envelope({ amount: 999, status: 'in_safe' })], NOW);
    expect(summary.count).toBe(3);
    expect(summary.totals).toEqual([{ currency: 'TRY', total: 150 }, { currency: 'USD', total: 20 }]);
    expect(summary.overdue).toBe(false);
  });

  it('finds a number typed by hand', () => {
    expect(findEnvelope([envelope()], ' env-2611-0001 ')?.id).toBe(1);
    expect(findEnvelope([envelope()], 'ENV-2611-0002')).toBeNull();
  });
});

describe('cash tab', () => {
  it('filters by account and by who holds it', () => {
    expect(inCashFilter(envelope({ status: 'in_safe', current_account_id: 2 }), accountFilter(2))).toBe(true);
    expect(inCashFilter(envelope({ status: 'in_safe', current_account_id: 2 }), accountFilter(3))).toBe(false);
    expect(inCashFilter(envelope(), 'staff')).toBe(true);
    expect(inCashFilter(envelope(), 'pos')).toBe(false);
    expect(movementInFilter(movement(), accountFilter(2))).toBe(true);
    expect(movementInFilter(movement(), accountFilter(9))).toBe(false);
    expect(movementInFilter(movement({ status: 'pending', kind: 'pos_settlement' }), 'pos')).toBe(true);
  });

  it('sums pending POS money per currency, with the next date', () => {
    const pending = (o: Partial<Movement>) => movement({ status: 'pending', kind: 'pos_settlement', ...o });
    const result = pendingSettlement([pending({ amount: 100, expected_at: '2026-12-09' }), pending({ amount: 50, expected_at: '2026-12-01' }), movement()]);
    expect(result).toMatchObject({ count: 2, next: '2026-12-01', totals: [{ currency: 'TRY', total: 150 }] });
  });

  it('offers reversal only where it would change something', () => {
    expect(canReverse(movement(), new Set())).toBe(true);
    expect(canReverse(movement({ id: 5 }), new Set([5]))).toBe(false);
    expect(canReverse(movement({ kind: 'reversal' }), new Set())).toBe(false);
    expect(canReverse(movement({ status: 'pending' }), new Set())).toBe(false);
    expect(canReverse(movement({ from_account_id: null, to_account_id: null }), new Set())).toBe(false);
  });

  it.each([
    ['forbidden', 'forbidden'],
    ['Only the admin can receive into the admin account', 'adminOnly'],
    ['Envelope ENV-1 not found', 'notFound'],
    ['Envelope ENV-1 is already in_safe', 'alreadyDone'],
    ['Counted amount differs by 5 — a note is required', 'note'],
    ['Choose two different accounts', 'sameAccount'],
    ['boom', 'generic'],
  ])('%s', (message, key) => expect(cashErrorKey(message)).toBe(key));
});
