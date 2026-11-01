import fs from 'fs';
import path from 'path';
import { canDeleteExpense } from './custodyExpense';
import { toCsv } from './csv';
import { convertEntry, customerBalances, ledgerTotals as customerTotals, type LedgerRow } from './customerLedger';
import { carSheetCategory, employeeCustody, inReviewFilter, isLegacyApproval, matchDefaults, reviewErrorKey, reviewStats, settlement, sheetLink, suggestedMatch, suggestionsFor, type ReviewExpense } from './expenseReview';
import { accountsFor, formatMoney, inSupplierFilter, ledgerTotals, matchesSupplier, owedByCurrency, whatsappLink, withRunning, type Supplier, type SupplierBalance, type SupplierTx } from './suppliers';

const expense = (o: Partial<ReviewExpense> = {}): ReviewExpense => ({
  id: 1, employee_id: 'a', transaction_date: '2026-11-01', direction: 'OUT', category: 'Wash', amount: 100, description: 'x', receipt_url: 'r', created_at: null,
  expense_scope: 'company', car_id: null, review_status: 'pending', reviewed_at: null, review_note: null, posted_car_tx_id: null, posted_company_expense_id: null,
  car: null, supplier: null, ...o,
});

const posted = new Map([[9, { id: 9, car_id: 7, plate_number: '06XYZ789' }]]);
const context = { month: '2026-11', signed: new Set<number>() };

describe('what the popover opens on', () => {
  it('follows the expense: a car expense goes to that car', () => {
    expect(matchDefaults(expense({ expense_scope: 'car', car_id: 3, category: 'Petrol' }))).toEqual({ target: 'car', carId: 3, category: 'Petrol' });
  });

  it('sends anything else to company expenses', () => {
    expect(matchDefaults(expense({ category: 'Branch' }))).toEqual({ target: 'company', carId: null, category: 'Branch' });
  });

  it('uses the same category mapping as the server', () => {
    expect(carSheetCategory('Fuel')).toBe('Petrol');
    expect(carSheetCategory('wash')).toBe('Wash');
    expect(carSheetCategory('Parking')).toBe('Other');
    expect(carSheetCategory(null)).toBe('Other');
  });

  it('never carries an investor to the Team dashboard', () => {
    const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const code = (text: string) => text.split('\n').filter(line => !/who owns|no investor|^\s*\*/.test(line)).join('\n');
    expect(code(read('lib/queries/expenseReview.ts'))).not.toMatch(/investor|commission/i);
    expect(code(read('lib/queries/financeHome.ts'))).not.toMatch(/investor_id|financial_transactions/i);
    for (const file of ['components/accounting/CustodyTab.tsx', 'components/accounting/MatchPopover.tsx', 'components/accounting/FinanceHome.tsx', 'components/accounting/Suggestions.tsx']) {
      expect(read(file)).not.toMatch(/investor|commission/i);
    }
  });
});

describe('where an approved expense went', () => {
  const approved = { review_status: 'approved' as const, reviewed_at: '2026-11-01T10:00:00Z' };

  it('names the car it was really posted to, not the one on the expense', () => {
    const row = expense({ ...approved, car_id: 3, car: { plate_number: '34ABC123' }, posted_car_tx_id: 9 });
    expect(settlement(row, posted)).toEqual({ kind: 'car', plate: '06XYZ789' });
    expect(sheetLink(row, posted)).toBe('/dashboard/accounting?tab=car_sheets&month=2026-11&car=7&entry=9');
  });

  it('links a company expense', () => {
    const row = expense({ ...approved, posted_company_expense_id: 7 });
    expect(settlement(row, posted)).toEqual({ kind: 'company' });
    expect(sheetLink(row, posted)).toBe('/dashboard/accounting?tab=company&month=2026-11&entry=7');
  });

  it('tells "confirmed, not posted" from an old row: only the new one has a review date', () => {
    expect(settlement(expense(approved), posted)).toEqual({ kind: 'other' });
    expect(settlement(expense({ review_status: 'approved' }), posted)).toEqual({ kind: 'legacy' });
    expect(isLegacyApproval(expense({ review_status: 'approved' }))).toBe(true);
    expect(isLegacyApproval(expense(approved))).toBe(false);
  });

  it('has no link when nothing was posted, and no result until approved', () => {
    expect(sheetLink(expense({ review_status: 'approved' }), posted)).toBeNull();
    expect(settlement(expense(), posted)).toBeNull();
  });
});

describe('review tiles', () => {
  const rows = [
    expense({ id: 1, amount: 100 }),
    expense({ id: 2, amount: 50, review_status: 'approved', reviewed_at: '2026-11-01T10:00:00Z' }),
    expense({ id: 3, amount: 25, review_status: 'approved', reviewed_at: '2026-10-31T10:00:00Z' }),
    expense({ id: 4, amount: 10, review_status: 'approved' }),
    expense({ id: 5, amount: 5, review_status: 'rejected', review_note: 'no' }),
    expense({ id: 6, amount: 1, receipt_url: null }),
    expense({ id: 7, amount: 9000, direction: 'IN', receipt_url: null }),
  ];
  const stats = reviewStats(rows, { month: '2026-11', signed: new Set([1]) });

  it('counts and sums each group, and money in is never an expense', () => {
    expect(stats.pending).toEqual({ count: 2, total: 101 });
    expect(stats.rejected).toEqual({ count: 1, total: 5 });
    expect(stats.noReceipt).toEqual({ count: 1, total: 1 });
    expect(stats.all.count).toBe(6);
  });

  it('counts confirmed this month by when it was confirmed', () => {
    expect(stats.approved).toEqual({ count: 1, total: 50 });
  });

  it('asks for my signature on everything but what I signed and what was rejected', () => {
    expect(stats.unsigned).toEqual({ count: 4, total: 86 });
  });

  it('takes the month in Istanbul', () => {
    expect(inReviewFilter(expense({ review_status: 'approved', reviewed_at: '2026-10-31T22:00:00Z' }), 'approved', context)).toBe(true);
  });

  it('shows money in only under All', () => {
    expect(inReviewFilter(expense({ direction: 'IN' }), 'all', context)).toBe(true);
    expect(inReviewFilter(expense({ direction: 'IN', review_status: 'pending' }), 'pending', context)).toBe(false);
  });
});

describe('per employee', () => {
  const rows = [
    expense({ id: 1, employee_id: 'done', review_status: 'approved' }),
    expense({ id: 2, employee_id: 'small', amount: 10 }),
    expense({ id: 3, employee_id: 'big', amount: 900, transaction_date: '2026-10-01' }),
    expense({ id: 4, employee_id: 'big', amount: 5 }),
    expense({ id: 5, employee_id: 'big', review_status: 'approved', amount: 20 }),
    expense({ id: 6, employee_id: 'big', direction: 'IN', amount: 1000, review_status: 'approved' }),
  ];
  const groups = employeeCustody(rows, new Map([['big', 75]]), '2026-11');

  it('puts whoever waits most first, and pending rows first inside', () => {
    expect(groups.map(g => g.employeeId)).toEqual(['big', 'small', 'done']);
    expect(groups[0].rows[0].review_status).toBe('pending');
    expect(groups[0].rows.slice(-1)[0].review_status).toBe('approved');
  });

  it('takes the balance from the view and works out the month', () => {
    expect(groups[0]).toMatchObject({ balance: 75, received: 1000, spent: 25, pending: 2 });
  });

  it('falls back to its own rows for the balance', () => {
    expect(groups.find(g => g.employeeId === 'small')?.balance).toBe(-10);
  });
});

describe('suggested rows', () => {
  it('posts a car expense to its car, in a category the sheet knows', () => {
    expect(suggestedMatch(expense({ car_id: 3, category: 'Parking' }), 'car')).toEqual({ target: 'car', carId: 3, category: 'Other', note: null });
    expect(suggestedMatch(expense({ car_id: 3, category: 'Fuel' }), 'car').category).toBe('Petrol');
  });

  it('posts a company expense with its own category', () => {
    expect(suggestedMatch(expense({ category: 'Food' }), 'company')).toEqual({ target: 'company', carId: null, category: 'Food', note: null });
    expect(suggestedMatch(expense({ category: null }), 'company').category).toBe('Other');
  });

  it('shows on the sheet of the month it will land on', () => {
    const rows = [expense({ id: 1, transaction_date: '2026-10-31' }), expense({ id: 2, transaction_date: '2026-11-01' })];
    expect(suggestionsFor(rows, '2026-11').map(row => row.id)).toEqual([2]);
  });
});

describe('refusals', () => {
  it.each([
    ['forbidden', 'forbidden'],
    ['Car has no investor — cannot post to a car sheet', 'noCarSheet'],
    ['Already approved', 'alreadyDone'],
    ['Only pending expenses can be rejected', 'alreadyDone'],
    ['Choose a car', 'car'],
    ['something else', 'generic'],
  ])('%s', (message, key) => expect(reviewErrorKey(message)).toBe(key));
});

const ledgerRow = (o: Partial<LedgerRow> = {}): LedgerRow => ({
  id: 'x', booking_id: null, customer_id: 'c1', car_id: 1, type: 'rental', description: null, amount: 100, direction: 'OUT', exchange_rate_at_entry: null, created_at: null,
  customers: { first_name: 'Ali', last_name: 'Kaya', is_banned: false, ban_reason: null }, cars: { plate_number: '34ABC123' }, ...o,
});

describe('customer balances', () => {
  it('counts a customer once per car, like the wallets screen', () => {
    const balances = customerBalances([ledgerRow({ amount: 100 }), ledgerRow({ amount: 30, direction: 'IN' }), ledgerRow({ car_id: 2, cars: { plate_number: '06X' }, amount: 50, direction: 'IN' })], 'TRY', [], null);
    expect(balances).toHaveLength(2);
    expect(balances[0]).toMatchObject({ name: 'Ali Kaya', plate: '34ABC123', balance: -70 });
  });

  it('adds up who owes and who is in credit, biggest debt first', () => {
    const totals = customerTotals([
      { customerId: 'a', name: 'a', plate: null, balance: -10 },
      { customerId: 'b', name: 'b', plate: null, balance: -300 },
      { customerId: 'c', name: 'c', plate: null, balance: 40 },
      { customerId: 'd', name: 'd', plate: null, balance: 0.001 },
    ]);
    expect(totals.debtors.map(d => d.name)).toEqual(['b', 'a']);
    expect(totals).toMatchObject({ owed: 310, credit: 40, inCredit: 1 });
  });

  it('converts at the rate stored on the entry', () => {
    expect(convertEntry({ amount: 340, exchange_rate_at_entry: 34 }, 'USD', [], 40)).toEqual({ value: 10, approx: false });
  });
});

describe('deleting from custody', () => {
  const row = { direction: 'OUT' as const, created_by: 'me', created_at: new Date().toISOString(), review_status: 'pending' as const };

  it('allows your own pending expense', () => {
    expect(canDeleteExpense(row, 'me')).toBe(true);
  });

  it('stops once finance has answered', () => {
    expect(canDeleteExpense({ ...row, review_status: 'approved' }, 'me')).toBe(false);
    expect(canDeleteExpense({ ...row, review_status: 'rejected' }, 'me')).toBe(false);
  });

  it('stops after 24 hours', () => {
    expect(canDeleteExpense({ ...row, created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() }, 'me')).toBe(false);
  });
});

const tx = (o: Partial<SupplierTx> = {}): SupplierTx => ({
  id: 1, supplier_id: 1, kind: 'bill', tx_date: '2026-11-01', amount: 100, currency: 'TRY', car_id: null, description: null, receipt_url: null,
  paid_from_account_id: null, custody_expense_id: null, voided_at: null, void_reason: null, created_at: '', car: null, account: null, ...o,
});

describe('supplier sheet', () => {
  it('formats each currency with its own symbol, never converted', () => {
    expect(formatMoney(1234.5, 'TRY')).toBe('₺1.234,50');
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50');
    expect(formatMoney(-5, 'USD')).toBe('−$5.00');
  });

  it('keeps a running balance per currency', () => {
    const rows = withRunning([tx({ amount: 100 }), tx({ amount: 40, currency: 'USD' }), tx({ kind: 'payment', amount: 30 }), tx({ kind: 'payment', amount: 40, currency: 'USD' })]);
    expect(rows.map(row => row.running)).toEqual([100, 40, 70, 0]);
  });

  it('leaves a voided row out of every figure', () => {
    const rows = [tx({ amount: 100 }), tx({ amount: 999, voided_at: 'x' }), tx({ kind: 'payment', amount: 25 })];
    expect(withRunning(rows).map(row => row.running)).toEqual([100, null, 75]);
    expect(ledgerTotals(rows)).toEqual([{ currency: 'TRY', bills: 100, paid: 25, balance: 75 }]);
  });

  it('totals each currency apart', () => {
    expect(ledgerTotals([tx({ amount: 10 }), tx({ amount: 20, currency: 'EUR' })]).map(row => row.currency)).toEqual(['TRY', 'EUR']);
  });

  it('nets out a custody expense, which is a bill already paid', () => {
    expect(ledgerTotals([tx({ custody_expense_id: 5 }), tx({ kind: 'payment', custody_expense_id: 5 })])[0].balance).toBe(0);
  });
});

describe('supplier list', () => {
  const supplier = (o: Partial<Supplier> = {}) => ({ id: 1, name: 'x', is_active: true, ...o }) as Supplier;
  const balance = (o: Partial<SupplierBalance> = {}): SupplierBalance => ({ supplier_id: 1, currency: 'TRY', total_bills: 0, total_paid: 0, balance: 0, last_tx: null, ...o });

  it('filters by what we owe', () => {
    expect(inSupplierFilter(supplier(), [balance({ balance: 5 })], 'owed')).toBe(true);
    expect(inSupplierFilter(supplier(), [balance({ balance: 0 })], 'owed')).toBe(false);
    expect(inSupplierFilter(supplier(), [], 'settled')).toBe(true);
    expect(inSupplierFilter(supplier(), [balance({ balance: -5 })], 'settled')).toBe(true);
    expect(inSupplierFilter(supplier({ is_active: false }), [], 'inactive')).toBe(true);
  });

  it('adds up what is owed per currency, ignoring credit', () => {
    expect(owedByCurrency([balance({ balance: 5 }), balance({ balance: 7 }), balance({ balance: -100 }), balance({ balance: 3, currency: 'USD' })]))
      .toEqual([{ currency: 'TRY', total: 12 }, { currency: 'USD', total: 3 }]);
  });

  it('finds a name typed without Turkish letters or spaces', () => {
    expect(matchesSupplier({ name: 'Şişli Oto Yıkama' }, 'sisli oto')).toBe(true);
    expect(matchesSupplier({ name: 'Şişli Oto Yıkama' }, 'YIKAMA')).toBe(true);
    expect(matchesSupplier({ name: 'Çağrı Lastik' }, 'cagri')).toBe(true);
    expect(matchesSupplier({ name: 'Şişli Oto' }, 'lastik')).toBe(false);
  });

  it('offers only accounts that hold the currency', () => {
    expect(accountsFor([{ currencies: ['TRY'] }, { currencies: ['USD', 'TRY'] }], 'USD')).toEqual([{ currencies: ['USD', 'TRY'] }]);
  });

  it('builds a WhatsApp link with the country code', () => {
    expect(whatsappLink('0532 123 45 67')).toBe('https://wa.me/905321234567');
    expect(whatsappLink('+90 532 123 45 67')).toBe('https://wa.me/905321234567');
    expect(whatsappLink('123')).toBeNull();
  });
});

describe('csv', () => {
  it('moved out of tracking and still guards formulas', () => {
    expect(toCsv([['=1+1', 5]]).slice(1)).toBe("'=1+1,5\r\n");
  });
});
