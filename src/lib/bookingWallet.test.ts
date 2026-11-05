import { readFileSync } from 'fs';
import { join } from 'path';
import {
  balanceTone, bookingNotes, buildWallet, canMove, defaultTarget, formatLira, humanType, leftoverBalance, lineKind,
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
