import {
  cashBookings, cleanAmountInput, envelopeLabelHtml, envelopeShareText, formatCashAmount, heldFor, heldSummary, heldTooLong, needsNote,
  parseAmount, plateTerm, preselectBooking, receiveCashErrorKey, toCashReceipt, toHeldEnvelope, whatsappUrl,
  type CashBooking, type EnvelopeLines,
} from './receiveCash';

const booking = (id: number, status: CashBooking['status'], startDate: string): CashBooking => ({
  id, bookingNumber: `HOM-${id}`, status, startDate, endDate: startDate, plate: '34ABC101', model: null, customerId: 'c1', customerName: 'Ali Veli', createdAt: null,
});

describe('amount', () => {
  test('a comma or a dot, two decimals at most, above zero', () => {
    expect([parseAmount('1250'), parseAmount('1250,5'), parseAmount('99.99'), parseAmount(' 10 ')]).toEqual([1250, 1250.5, 99.99, 10]);
    expect([parseAmount(''), parseAmount('0'), parseAmount('1.234'), parseAmount('-5'), parseAmount('1.2.3'), parseAmount('abc')]).toEqual([null, null, null, null, null, null]);
  });

  test('the field keeps digits and one separator, Arabic digits too', () => {
    expect(cleanAmountInput('12a3,456')).toBe('123,45');
    expect(cleanAmountInput('.5')).toBe('5');
    expect(cleanAmountInput('١٢٠٠')).toBe('1200');
    expect(cleanAmountInput('10.0.1')).toBe('10.01');
  });

  test('shown with its own sign', () => {
    expect([formatCashAmount(1250.5, 'TRY'), formatCashAmount(100, 'USD'), formatCashAmount(1000, 'EUR')]).toEqual(['₺1.250,5', '$100', '€1,000']);
  });

  test('"other" needs a note, nothing else does', () => {
    expect([needsNote('other'), needsNote('rental'), needsNote(null)]).toEqual([true, false, false]);
  });
});

describe('bookings', () => {
  test('newest first, no cancelled', () => {
    const rows = cashBookings([booking(1, 'completed', '2026-09-01'), booking(2, 'cancelled', '2026-11-20'), booking(3, 'confirmed', '2026-11-10')]);
    expect(rows.map(row => row.id)).toEqual([3, 1]);
  });

  test('the only active booking is chosen; two, or none, and nobody chooses', () => {
    expect(preselectBooking([booking(1, 'completed', '2026-09-01'), booking(3, 'confirmed', '2026-11-10')])?.id).toBe(3);
    expect(preselectBooking([booking(3, 'confirmed', '2026-11-10'), booking(4, 'pending', '2026-11-18')])).toBeNull();
    expect(preselectBooking([booking(1, 'completed', '2026-09-01')])).toBeNull();
  });

  test('a plate is letters and digits together; a name or a phone is not', () => {
    expect([plateTerm('34 abc 101'), plateTerm('34-MDJ'), plateTerm('ali'), plateTerm('0532 111'), plateTerm('3A')]).toEqual(['34ABC101', '34MDJ', null, null, null]);
  });
});

describe("the server's answer", () => {
  test('reads the envelope', () => {
    const receipt = toCashReceipt({ ledger_id: 'l1', amount_try: '4321.5', envelope: { ref: 'ENV-2611-0042', purpose: 'Rental', plate: '34ABC101', customer: 'Ali Veli', booking_number: 'HOM-11-26-007', date: '2026-11-21 14:05', amount: 100, currency: 'USD', holder: 'Lina', status: 'with_employee' } });
    expect(receipt).toMatchObject({ ledgerId: 'l1', amountTry: 4321.5, envelope: { ref: 'ENV-2611-0042', currency: 'USD', bookingNumber: 'HOM-11-26-007', holder: 'Lina' } });
  });

  test('each refusal has a friendly message', () => {
    const cases: Array<[string, string]> = [
      ['forbidden', 'forbidden'], ['Choose what the money is for', 'purpose'], ['Amount must be greater than 0', 'amount'],
      ['Currency must be TRY, USD or EUR', 'currency'], ['Add a note for "other"', 'note'], ['Booking not found', 'notFound'],
      ['This booking is cancelled', 'cancelled'], ['No exchange rate for EUR', 'rate'], ['TypeError: Failed to fetch', 'offline'], ['boom', 'generic'],
    ];
    expect(cases.map(([message]) => receiveCashErrorKey(message))).toEqual(cases.map(([, key]) => key));
    expect(receiveCashErrorKey(undefined)).toBe('generic');
  });
});

describe('the envelope', () => {
  const lines: EnvelopeLines = { ref: 'ENV-2611-0042', customer: 'Ali <Veli>', booking: 'HOM-7', plate: '34ABC101', amount: '$100', purpose: 'Rental', date: '21 Nov 2026 14:05', holder: '' };
  const labels = { ref: 'Code', customer: 'Customer', booking: 'Booking', plate: 'Plate', amount: 'Amount', purpose: 'Purpose', date: 'Date', holder: 'Held by' };

  test('the WhatsApp text: a line per field, empty ones left out', () => {
    const text = envelopeShareText('Cash received', labels, lines, 'Write the code on the envelope.');
    expect(text.split('\n')).toEqual(['Cash received', 'Code: ENV-2611-0042', 'Customer: Ali <Veli>', 'Booking: HOM-7', 'Plate: 34ABC101', 'Amount: $100', 'Purpose: Rental', 'Date: 21 Nov 2026 14:05', '', 'Write the code on the envelope.']);
    expect(whatsappUrl('a b&c')).toBe('https://wa.me/?text=a%20b%26c');
  });

  test('the label escapes what it prints and carries both languages', () => {
    const html = envelopeLabelHtml(lines, { en: labels, ar: { ...labels, customer: 'العميل' } }, { en: 'Hand it to finance', ar: 'سلّمه للمالية' });
    expect(html).toContain('ENV-2611-0042');
    expect(html).toContain('Ali &lt;Veli&gt;');
    expect(html).not.toContain('Ali <Veli>');
    expect(html).toContain('العميل');
    expect(html).toContain('@page { size: 100mm 70mm');
  });
});

describe('held envelopes', () => {
  const now = Date.parse('2026-11-21T12:00:00Z');
  const rows = [
    toHeldEnvelope({ id: 1, ref: 'ENV-1', amount: '100', currency: 'TRY', created_at: '2026-11-20T09:00:00Z', customer: 'Ali' }),
    toHeldEnvelope({ id: 2, ref: 'ENV-2', amount: 50.5, currency: 'TRY', created_at: '2026-11-21T09:00:00Z' }),
    toHeldEnvelope({ id: 3, ref: 'ENV-3', amount: 20, currency: 'EUR', created_at: '2026-11-21T11:59:40Z' }),
  ];

  test('count, a total per currency, and how many are past a day', () => {
    expect(heldSummary(rows, now)).toEqual({ count: 3, totals: [{ currency: 'TRY', total: 150.5 }, { currency: 'EUR', total: 20 }], late: 1 });
    expect(rows.map(row => heldTooLong(row, now))).toEqual([true, false, false]);
  });

  test('time held', () => {
    expect(rows.map(row => heldFor(row.createdAt, now))).toEqual([{ unit: 'days', count: 1 }, { unit: 'hours', count: 3 }, { unit: 'now', count: 0 }]);
    expect(heldFor('2026-11-21T11:15:00Z', now)).toEqual({ unit: 'minutes', count: 45 });
    expect(heldFor('nonsense', now)).toBeNull();
  });
});
