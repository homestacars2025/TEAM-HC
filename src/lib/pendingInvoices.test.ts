import { currentMonth, dottedDate, hasNoRental, idTypeKey, inInvoiceFilter, inMonth, lineLabel, invoiceCsvRows, invoiceMatches, invoiceTable, invoiceTotals, linesDisagree, linesTotal, readMonth, shiftMonth, type PendingInvoice } from './pendingInvoices';

const invoice = (o: Partial<PendingInvoice> = {}): PendingInvoice => ({
  booking_id: 1, booking_number: 'HOM-10-26-001', start_date: '2026-10-01', end_date: '2026-10-05', days: 4, plate: '34GRN568', car_brand: 'Toyota', car_model: 'Corolla',
  customer_id: 'c', customer_name: 'Ali Kaya', nationality: 'Turkey', id_type: 'PASSPORT', id_number: 'U123', phone: '+90', email: null, address: null, birth_date: null,
  rental_total: 1200, extras_total: 0, invoice_total: 1200, net_amount: 1000, vat_amount: 200, paid_total: 0, lines: [{ type: 'rental', description: 'Rental fee', amount: 1200, date: '2026-10-01' }], invoice_text: 'x', ...o,
});

describe('month', () => {
  it('defaults to the current Istanbul month', () => {
    const lateOct = new Date('2026-10-31T22:30:00Z');
    expect(currentMonth(lateOct)).toBe('2026-11');
    expect(readMonth(null, lateOct)).toBe('2026-11');
  });

  it('reads the address, and ignores nonsense', () => {
    expect(readMonth('2026-02')).toBe('2026-02');
    expect(readMonth('all')).toBe('all');
    expect(readMonth('2026-13', new Date('2026-11-02T10:00:00Z'))).toBe('2026-11');
    expect(readMonth('junk', new Date('2026-11-02T10:00:00Z'))).toBe('2026-11');
  });

  it('crosses years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('tiles', () => {
  it('sums without floating point dust', () => {
    const totals = invoiceTotals([invoice({ invoice_total: 0.1, net_amount: 0.08, vat_amount: 0.02 }), invoice({ invoice_total: 0.2, net_amount: 0.17, vat_amount: 0.03 }), invoice({ invoice_total: 0, net_amount: 0, vat_amount: 0 })]);
    expect(totals).toEqual({ count: 3, total: 0.3, net: 0.25, vat: 0.05, missing: 1 });
  });

  it('splits rows with an amount from rows without', () => {
    expect(inInvoiceFilter(invoice(), 'ready')).toBe(true);
    expect(inInvoiceFilter(invoice(), 'missing')).toBe(false);
    expect(inInvoiceFilter(invoice({ invoice_total: 0 }), 'ready')).toBe(false);
    expect(inInvoiceFilter(invoice({ invoice_total: 0 }), 'missing')).toBe(true);
    expect(inInvoiceFilter(invoice({ invoice_total: 0 }), 'all')).toBe(true);
  });
});

describe('months and warnings', () => {
  it('goes by the return date', () => {
    expect(inMonth(invoice({ start_date: '2026-09-28', end_date: '2026-10-02' }), '2026-10')).toBe(true);
    expect(inMonth(invoice({ start_date: '2026-09-28', end_date: '2026-10-02' }), '2026-09')).toBe(false);
    expect(inMonth(invoice(), 'all')).toBe(true);
  });

  it('spots an invoice with only extras on it', () => {
    expect(hasNoRental(invoice({ rental_total: 0, invoice_total: 300 }))).toBe(true);
    expect(hasNoRental(invoice({ rental_total: -5, invoice_total: 300 }))).toBe(true);
    expect(hasNoRental(invoice())).toBe(false);
    expect(hasNoRental(invoice({ rental_total: 0, invoice_total: 0 }))).toBe(false);
  });

  it('labels a line without its internal marker', () => {
    expect(lineLabel({ type: 'fuel', description: 'Fuel charge ‹op:598›' })).toBe('Fuel charge');
    expect(lineLabel({ type: 'car_wash', description: null })).toBe('Car wash');
    expect(lineLabel({ type: 'extra_km', description: '‹op:1›' })).toBe('Extra km');
  });
});

describe('search', () => {
  it('covers name, plate, booking and ID', () => {
    expect(invoiceMatches(invoice(), 'ali')).toBe(true);
    expect(invoiceMatches(invoice(), '34 grn 568')).toBe(true);
    expect(invoiceMatches(invoice(), '10-26-001')).toBe(true);
    expect(invoiceMatches(invoice(), 'u123')).toBe(true);
    expect(invoiceMatches(invoice(), 'nobody')).toBe(false);
  });
});

describe('details', () => {
  it('catches lines that do not reach the total, like HOM-09-26-003', () => {
    const off = invoice({ invoice_total: 1500, lines: [{ type: 'rental', description: null, amount: 21890, date: '2026-09-01' }] });
    expect(linesTotal(off)).toBe(21890);
    expect(linesDisagree(off)).toBe(true);
    expect(linesDisagree(invoice())).toBe(false);
  });

  it('lets a kuruş of rounding through', () => {
    expect(linesDisagree(invoice({ invoice_total: 1200.01 }))).toBe(false);
  });

  it('reads the ID type in either case', () => {
    expect(idTypeKey('PASSPORT')).toBe('passport');
    expect(idTypeKey('national_id')).toBe('nationalId');
    expect(idTypeKey('NATIONAL_ID')).toBe('nationalId');
    expect(idTypeKey(null)).toBeNull();
  });

  it('writes dates the way the portal does', () => {
    expect(dottedDate('1990-03-07')).toBe('07.03.1990');
    expect(dottedDate(null)).toBe('');
  });

  it('keeps a pasted table to one cell per value', () => {
    expect(invoiceTable([['Address', 'Line 1\nLine 2'], ['Email', null]])).toBe('Address\tLine 1 Line 2\nEmail\t');
  });
});

describe('export', () => {
  it('has a column for each field, with a value in each', () => {
    const [head, row] = invoiceCsvRows([invoice()]);
    expect(head).toHaveLength(25);
    expect(row).toHaveLength(25);
    expect(head).toContain('invoice_text');
    expect(row[head.indexOf('invoice_total')]).toBe(1200);
    expect(row[head.indexOf('lines')]).toBe('2026-10-01 Rental fee: 1200.00');
  });
});
