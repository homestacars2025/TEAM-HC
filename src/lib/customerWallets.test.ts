import { matchesCustomer, plateKey, summarizeCustomers, type BookingLabelRow } from './customerWallets';
import type { LedgerRow } from './customerLedger';

const person = { first_name: 'Ahmet', last_name: 'Yılmaz', is_banned: false, ban_reason: null, phone: '+90 555 111 22 33' };
const line = (booking_id: number, amount: number, direction: 'IN' | 'OUT', customer_id = 'c1'): LedgerRow => ({
  id: `${booking_id}-${amount}`, booking_id, customer_id, car_id: 1, type: 'rental', description: null, amount, direction,
  exchange_rate_at_entry: null, created_at: null, customers: person, cars: null,
});
const booking = (id: number, start: string, plate: string | null, o: Partial<BookingLabelRow> = {}): BookingLabelRow => ({
  id, customer_id: 'c1', start_date: start, status: 'completed', is_currently_active: false, cars: plate ? { plate_number: plate } : null, ...o,
});

describe('customer list', () => {
  const bookings = [
    booking(1, '2026-01-01', '34 KDT 101'), booking(2, '2026-03-01', '06ABC12'), booking(3, '2026-05-01', '34KDT101'),
    booking(4, '2026-06-01', '35XYZ9', { status: 'cancelled' }), booking(5, '2026-07-01', '34NEW1', { is_currently_active: true }),
    booking(6, '2026-08-01', '16BUR7'), booking(7, '2026-08-02', null),
  ];
  const [entry] = summarizeCustomers([line(1, 100, 'OUT'), line(2, 40, 'IN')], bookings, '?');

  it('counts every booking the wallet lists, empty ones too, cancelled ones only with lines', () => {
    expect(entry.bookings).toBe(6);
    expect(summarizeCustomers([line(4, 10, 'OUT')], bookings, '?')[0].bookings).toBe(7);
  });

  it('lists every car, newest first, once each, never from a cancelled booking', () => {
    expect(entry.plates).toEqual(['16BUR7', '34NEW1', '34KDT101', '06ABC12']);
    expect(entry.onRent).toBe(true);
    expect(entry.balance).toBe(-60);
  });

  it('finds them by name, phone or any plate, however the plate is written', () => {
    expect(plateKey('34 kdt-101.')).toBe('34KDT101');
    expect(['ahmet', 'YILMAZ'.toLocaleLowerCase('tr-TR'), '34KDT', '34 kdt 1', '06-abc', '5551112233', '111 22'].every(q => matchesCustomer(entry, q))).toBe(true);
    expect(matchesCustomer(entry, '35XYZ')).toBe(false);
    expect(matchesCustomer(entry, '55')).toBe(false);
    expect(matchesCustomer(entry, '')).toBe(true);
  });
});
