import fs from 'fs';
import path from 'path';
import { canDeleteExpense } from './custodyExpense';
import { toCsv } from './csv';
import { groupByEmployee, inReviewFilter, postingTarget, reviewErrorKey, reviewStats, sheetLink, type ReviewExpense } from './expenseReview';
import { accountsFor, formatMoney, inSupplierFilter, ledgerTotals, matchesSupplier, owedByCurrency, whatsappLink, withRunning, type Supplier, type SupplierBalance, type SupplierTx } from './suppliers';

const expense = (o: Partial<ReviewExpense> = {}): ReviewExpense => ({
  id: 1, employee_id: 'a', transaction_date: '2026-11-01', category: 'Wash', amount: 100, description: 'x', receipt_url: 'r', created_at: null,
  expense_scope: 'company', car_id: null, review_status: 'pending', reviewed_at: null, review_note: null, posted_car_tx_id: null, posted_company_expense_id: null,
  car: null, supplier: null, ...o,
});

describe('where an expense posts', () => {
  const car = { plate_number: '34ABC123', model_group: null };

  it('goes to the car sheet only for a car expense with a car', () => {
    expect(postingTarget(expense({ expense_scope: 'car', car_id: 3, car }))).toEqual({ kind: 'car', plate: '34ABC123' });
  });

  it('goes to company expenses otherwise, like the server', () => {
    expect(postingTarget(expense())).toEqual({ kind: 'company' });
    expect(postingTarget(expense({ expense_scope: null, car_id: 3, car }))).toEqual({ kind: 'company' });
  });

  it('never carries an investor to the Team dashboard', () => {
    const queries = fs.readFileSync(path.join(__dirname, 'queries', 'expenseReview.ts'), 'utf8');
    const screen = fs.readFileSync(path.join(__dirname, '..', 'components', 'accounting', 'ExpenseApprovals.tsx'), 'utf8');
    expect(queries.split('\n').filter(line => !line.includes('who owns')).join('\n')).not.toMatch(/investor|commission/i);
    expect(screen).not.toMatch(/investor|commission/i);
    expect(JSON.stringify(postingTarget(expense({ expense_scope: 'car', car_id: 3, car })))).not.toMatch(/investor/i);
  });
});

describe('link to the posted row', () => {
  it('opens the car sheet on the expense month', () => {
    expect(sheetLink(expense({ car_id: 3, transaction_date: '2026-10-30', posted_car_tx_id: 9 }))).toBe('/dashboard/accounting?tab=cars&month=2026-10&car=3&entry=9');
  });

  it('opens company expenses', () => {
    expect(sheetLink(expense({ posted_company_expense_id: 7 }))).toBe('/dashboard/accounting?tab=expenses&month=2026-11&entry=7');
  });

  it('has nothing for a row confirmed before posting existed', () => {
    expect(sheetLink(expense({ review_status: 'approved' }))).toBeNull();
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
  ];
  const stats = reviewStats(rows, '2026-11');

  it('counts and sums each group', () => {
    expect(stats.pending).toEqual({ count: 2, total: 101 });
    expect(stats.rejected).toEqual({ count: 1, total: 5 });
    expect(stats.noReceipt).toEqual({ count: 1, total: 1 });
    expect(stats.all.count).toBe(6);
  });

  it('counts approved this month by when it was confirmed', () => {
    expect(stats.approved).toEqual({ count: 1, total: 50 });
  });

  it('takes the month in Istanbul', () => {
    expect(inReviewFilter(expense({ review_status: 'approved', reviewed_at: '2026-10-31T22:00:00Z' }), 'approved', '2026-11')).toBe(true);
  });
});

describe('grouping', () => {
  it('puts whoever waits most first, and pending rows first inside', () => {
    const groups = groupByEmployee([
      expense({ id: 1, employee_id: 'done', review_status: 'approved' }),
      expense({ id: 2, employee_id: 'small', amount: 10 }),
      expense({ id: 3, employee_id: 'big', amount: 900, transaction_date: '2026-10-01' }),
      expense({ id: 4, employee_id: 'big', review_status: 'approved', transaction_date: '2026-11-01' }),
    ]);
    expect(groups.map(g => g.employeeId)).toEqual(['big', 'small', 'done']);
    expect(groups[0].rows.map(r => r.id)).toEqual([3, 4]);
    expect(groups[0].pendingTotal).toBe(900);
  });
});

describe('refusals', () => {
  it.each([
    ['forbidden', 'forbidden'],
    ['Car has no investor — cannot post to a car sheet', 'noCarSheet'],
    ['Already approved', 'alreadyDone'],
    ['Only pending expenses can be rejected', 'alreadyDone'],
    ['something else', 'generic'],
  ])('%s', (message, key) => expect(reviewErrorKey(message)).toBe(key));
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
