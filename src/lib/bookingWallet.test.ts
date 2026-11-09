import { readFileSync } from 'fs';
import { join } from 'path';
import {
  balanceTone, bookingNotes, buildWallet, canMove, defaultTarget, foldHgs, formatLira, hgsDay, hgsDetail, humanType, leftoverBalance, lineKind, walletItems,
  transferAmount, transferFailure, walletTotal, type WalletBookingRow, type WalletLineRow,
} from './bookingWallet';

const booking = (id: number, o: Partial<WalletBookingRow> = {}): WalletBookingRow => ({
  id, booking_number: `HOM-${id}`, customer_id: 'c1', car_id: 1, start_date: `2026-0${id}-01`, end_date: `2026-0${id}-05`,
  status: 'completed', is_currently_active: false, plate: '34ABC123', model: 'Fiat Egea', ...o,
});
let seq = 0;
const line = (bookingId: number, amount: number, direction: 'IN' | 'OUT', o: Partial<WalletLineRow> = {}): WalletLineRow => ({
  id: `l${++seq}`, booking_id: bookingId, customer_id: 'c1', car_id: 1, type: 'rental', description: null, amount, direction,
  exchange_rate_at_entry: null, created_at: `2026-01-01T10:00:${String(seq).padStart(2, '0')}Z`, cars: { plate_number: '34ABC123' }, ...o,
});

describe('balances', () => {
  it('is IN minus OUT per booking, and the customer total is the sum of the bookings', () => {
    const wallet = buildWallet(
      [line(1, 1000, 'OUT'), line(1, 1500, 'IN', { type: 'payment' }), line(2, 0.1, 'OUT', { type: 'fuel' }), line(2, 0.2, 'OUT', { type: 'fuel' })],
      [booking(1), booking(2)],
    );
    expect(wallet.map(entry => [entry.booking.id, entry.balance])).toEqual([[2, -0.3], [1, 500]]);
    expect(walletTotal(wallet)).toBe(499.7);
  });

  it('calls a kuruş either way settled', () => {
    expect(balanceTone(0.004)).toBe('settled');
    expect(balanceTone(-0.004)).toBe('settled');
    expect(balanceTone(0.01)).toBe('credit');
    expect(balanceTone(-0.01)).toBe('owes');
  });

  it('writes lira the Turkish way, kuruş only when there are some', () => {
    expect(formatLira(-1500)).toBe('₺1.500');
    expect(formatLira(1234.5)).toBe('₺1.234,5');
  });

  it('keeps a cancelled booking only while it still has lines', () => {
    const wallet = buildWallet([line(1, 100, 'IN', { type: 'deposit' })], [booking(1, { status: 'cancelled' }), booking(2, { status: 'cancelled' })]);
    expect(wallet.map(entry => entry.booking.id)).toEqual([1]);
  });
});

describe('lines', () => {
  it('sorts types into kinds, and names the rest from their text', () => {
    expect(['rental', ' Deposit ', 'payment', 'HGS', 'transfer', 'REF TO 34DK6500', 'refund', 'car_wash'].map(lineKind))
      .toEqual(['rental', 'deposit', 'payment', 'hgs', 'transfer', 'refund', 'refund', 'other']);
    expect(humanType('car_wash')).toBe('Car wash');
    expect(humanType('EXTRA_KM')).toBe('Extra km');
  });

  it('lists a booking newest line first', () => {
    const [entry] = buildWallet([line(1, 10, 'OUT', { created_at: '2026-01-01T10:00:00Z' }), line(1, 20, 'IN', { created_at: '2026-01-03T10:00:00Z' })], [booking(1)]);
    expect(entry.lines.map(item => item.amount)).toEqual([20, 10]);
  });

  it('links a transfer to its other half by the shared reference, and keeps the note', () => {
    const wallet = buildWallet([
      line(1, 500, 'OUT', { type: 'transfer', payment_ref: 'TRF-1', description: 'Balance moved to HOM-2 · paid twice' }),
      line(2, 500, 'IN', { type: 'transfer', payment_ref: 'TRF-1', description: 'Balance moved from HOM-1 · paid twice' }),
    ], [booking(1), booking(2)]);
    const out = wallet.find(entry => entry.booking.id === 1)!.lines[0];
    expect(out.partner).toEqual({ id: 2, number: 'HOM-2' });
    expect(out.note).toBe('paid twice');
    expect(wallet.find(entry => entry.booking.id === 2)!.lines[0].partner).toEqual({ id: 1, number: 'HOM-1' });
  });

  it('falls back to the booking number in the description', () => {
    const [entry] = buildWallet([line(1, 50, 'IN', { type: 'transfer', payment_ref: 'TRF-9', description: 'Balance moved from HOM-07-26-001' })], [booking(1)]);
    expect(entry.lines[0].partner).toEqual({ id: null, number: 'HOM-07-26-001' });
    expect(entry.lines[0].note).toBeNull();
  });
});

describe('car history', () => {
  it('reads a car change from lines left on the old car, and skips a replacement car', () => {
    const current = booking(1, { car_id: 2, plate: '34XYZ9' });
    const [entry] = buildWallet([
      line(1, 100, 'OUT', { type: 'hgs', car_id: 1, cars: { plate_number: '34ABC123' } }),
      line(1, 40, 'OUT', { type: 'hgs', car_id: 3, cars: { plate_number: '34REP1' } }),
      line(1, 900, 'OUT', { car_id: 2, cars: { plate_number: '34XYZ9' } }),
    ], [current], [{ original_booking_id: 1, original_car_id: 2, replacement_car_id: 3, start_date: '2026-01-03', original_plate: '34XYZ9', replacement_plate: '34REP1' }]);
    expect(entry.notes).toEqual([
      { kind: 'carChanged', from: '34ABC123', to: '34XYZ9' },
      { kind: 'replacement', from: '34XYZ9', to: '34REP1', date: '2026-01-03' },
    ]);
  });

  it('says nothing when every line is on the booking car', () => {
    expect(bookingNotes(booking(1), [], [])).toEqual([]);
  });
});

describe('moving a balance', () => {
  const wallet = buildWallet(
    [line(1, 1500, 'OUT'), line(3, 200, 'IN', { type: 'payment' })],
    [booking(1), booking(2, { status: 'cancelled' }), booking(3, { is_currently_active: true }), booking(4)],
  );

  it('goes to a booking that is on the road, else the newest, never a cancelled one', () => {
    expect(defaultTarget(wallet, 1)).toBe(3);
    expect(defaultTarget(wallet, 3)).toBe(4);
    expect(canMove(wallet, wallet.find(entry => entry.booking.id === 1)!)).toBe(true);
    expect(canMove(wallet, wallet.find(entry => entry.booking.id === 4)!)).toBe(false);
  });

  it('sends the amount signed like the balance, and never more than it', () => {
    expect(transferAmount(-1500, '1500')).toEqual({ amount: -1500 });
    expect(transferAmount(-1500, '1.000,5'.replace('.', ''))).toEqual({ amount: -1000.5 });
    expect(transferAmount(200, '50')).toEqual({ amount: 50 });
    expect(transferAmount(200, '200.004')).toEqual({ amount: 200 });
    expect(transferAmount(200, '200.01')).toEqual({ problem: 'tooMuch' });
    expect(transferAmount(200, '0')).toEqual({ problem: 'zero' });
    expect(transferAmount(200, ' ')).toEqual({ problem: 'empty' });
  });

  it('offers the newest other booking that still holds money', () => {
    expect(leftoverBalance(wallet, 4)?.booking.id).toBe(3);
    expect(leftoverBalance(wallet, 3)?.booking.id).toBe(1);
  });

  it('words only "forbidden" itself and shows anything else as the server said it', () => {
    expect(transferFailure('forbidden')).toEqual({ key: 'forbidden', message: null });
    expect(transferFailure('Amount is more than the balance (-1500)')).toEqual({ key: 'failed', message: 'Amount is more than the balance (-1500)' });
    expect(transferFailure(undefined)).toEqual({ key: 'failed', message: null });
  });
});

describe('the wallet never reads who owns a car', () => {
  const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
  it.each(['queries/bookingWallet.ts', '../components/wallet/CustomerWalletSheet.tsx', '../pages/CustomerWalletsPage.tsx'])('%s', file => {
    expect(read(file)).not.toMatch(/investor|commission/i);
  });
});

describe('HGS lines, grouped', () => {
  const hgs = (amount: number, description: string | null, created_at: string, direction: 'IN' | 'OUT' = 'OUT') => line(7, amount, direction, { type: 'hgs', description, created_at });

  it('reads an automatic line: transit date, route, optional time and toll name', () => {
    expect(hgsDetail({ description: '[AUTO-HGS] 06-10-2026 MAHMUTBEY → AVCILAR', created_at: '2026-10-07T10:20:53Z' }))
      .toEqual({ date: '2026-10-06', time: null, route: 'MAHMUTBEY → AVCILAR', toll: null, pass: true });
    expect(hgsDetail({ description: '[AUTO-HGS] 02-11-2026 9:05 HASDAL → HASDAL · KMO', created_at: null }))
      .toEqual({ date: '2026-11-02', time: '09:05', route: 'HASDAL', toll: 'KMO', pass: true });
    expect(hgsDetail({ description: '[AUTO-HGS] 02-10-2026 ? → 15 TEMMUZ ŞEHİTLER KÖPRÜSÜ', created_at: null }).route).toBe('15 TEMMUZ ŞEHİTLER KÖPRÜSÜ');
    expect(hgsDetail({ description: '[AUTO-HGS] 02-10-2026 * → YSS KÖPRÜSÜ · KMO', created_at: null }).route).toBe('YSS KÖPRÜSÜ');
    expect(hgsDetail({ description: '[AUTO-HGS] 02-10-2026 ÇAMLICA', created_at: null }).route).toBe('ÇAMLICA');
  });

  it('a line typed by hand keeps its text, dated by when it was recorded in Istanbul', () => {
    expect(hgsDetail({ description: 'HGS TO 07/10/2026', created_at: '2026-10-07T22:30:00Z' })).toEqual({ date: '2026-10-08', time: null, route: 'HGS TO 07/10/2026', toll: null, pass: false });
    expect(hgsDetail({ description: 'hgs', created_at: '2026-10-07T00:00:00Z' }).route).toBeNull();
    expect(hgsDetail({ description: null, created_at: '2026-10-07T00:00:00Z' }).route).toBeNull();
  });

  it('folds every HGS line of a booking into one item, where the newest was, with the same net', () => {
    const rows = [
      line(7, 5000, 'OUT', { created_at: '2026-09-27T09:00:00Z' }),
      hgs(49, '[AUTO-HGS] 28-09-2026 MAHMUTBEY → AVCILAR', '2026-09-29T08:00:00Z'),
      line(7, 3000, 'IN', { type: 'payment', created_at: '2026-10-01T09:00:00Z' }),
      hgs(1127, 'HGS TO 20/10/2026', '2026-10-20T00:00:00Z'),
      hgs(41, '[AUTO-HGS] 22-10-2026 HASDAL → HASDAL', '2026-10-23T08:00:00Z'),
      hgs(41, 'HGS refund', '2026-10-24T08:00:00Z', 'IN'),
    ];
    const [entry] = buildWallet(rows, [booking(7)]);
    const items = walletItems(entry.lines);
    expect(items.map(item => item.kind)).toEqual(['hgs', 'line', 'line']);
    const group = items[0].kind === 'hgs' ? items[0].group : null;
    expect(group).toMatchObject({ signed: -1176, from: '2026-09-28', to: '2026-10-24', passes: 2, entries: 2 });
    expect(group!.lines.map(l => l.amount)).toEqual([41, 41, 1127, 49]);
    // The booking's balance is what it was before grouping.
    expect(entry.balance).toBe(-5000 + 3000 - 1176);
  });

  it('keeps each portal batch its own line, apart from what was typed by hand (HOM-09-26-037)', () => {
    const batch = (amount: number, day: string, eventNo: number, at: string) => line(7, amount, 'OUT', { type: 'hgs', description: `${day} KARGO → KARGO`, event_no: eventNo, created_at: at });
    const rows = [
      line(7, 9000, 'OUT', { created_at: '2026-09-22T09:00:00Z', event_no: 1 }),
      line(7, 272, 'OUT', { type: 'hgs', description: 'HGS to 31/09/2026', created_at: '2026-10-07T00:00:00Z', event_no: null }),
      batch(65, '02-10-2026', 3, '2026-11-09T16:32:07Z'),
      batch(35, '05-10-2026', 3, '2026-11-09T16:32:07Z'),
      line(7, 5000, 'IN', { type: 'payment', created_at: '2026-11-10T09:00:00Z' }),
      batch(40, '03-11-2026', 4, '2026-12-01T10:00:00Z'),
    ];
    const [entry] = buildWallet(rows, [booking(7)]);
    const items = walletItems(entry.lines);
    expect(items.map(item => (item.kind === 'hgs' ? `hgs:${item.group.key}` : item.line.type))).toEqual(['hgs:4', 'payment', 'hgs:3', 'hgs:none', 'rental']);
    const groups = items.flatMap(item => (item.kind === 'hgs' ? [item.group] : []));
    expect(groups.map(g => [g.key, g.lines.length, g.signed, g.passes, g.entries])).toEqual([['4', 1, -40, 1, 0], ['3', 2, -100, 2, 0], ['none', 1, -272, 0, 1]]);
    expect(groups[1]).toMatchObject({ from: '2026-10-02', to: '2026-10-05' });
    expect(entry.balance).toBe(-9000 - 272 - 100 + 5000 - 40);
  });

  it('folds anything by batch: lines without an event number share one group, event 0 is its own', () => {
    const entries = [{ t: 'hgs', e: 2 }, { t: 'rental', e: 2 }, { t: 'hgs', e: null }, { t: 'hgs', e: 0 }, { t: 'hgs', e: 2 }, { t: 'hgs', e: undefined }];
    const folded = foldHgs(entries, x => x.t === 'hgs', x => x.e);
    expect(folded.map(f => (f.kind === 'hgs' ? `${f.key}×${f.items.length}` : f.item.t))).toEqual(['2×2', 'rental', 'none×2', '0×1']);
  });

  it('leaves a booking with no HGS line as it was, and groups even a single line', () => {
    const [entry] = buildWallet([line(7, 100, 'OUT'), line(7, 100, 'IN', { type: 'payment' })], [booking(7)]);
    expect(walletItems(entry.lines).every(item => item.kind === 'line')).toBe(true);
    const [one] = buildWallet([hgs(59, null, '2026-10-02T09:00:00Z')], [booking(7)]);
    expect(walletItems(one.lines)).toMatchObject([{ kind: 'hgs', group: { from: '2026-10-02', to: '2026-10-02', passes: 0, entries: 1 } }]);
  });

  it('days read DD/MM, with the year when a range crosses one', () => {
    expect(hgsDay('2026-09-28')).toBe('28/09');
    expect(hgsDay('2026-12-30', true)).toBe('30/12/2026');
  });
});
