import fs from 'fs';
import path from 'path';
import { hgsDetail } from './bookingWallet';
import { addDays, applyPortalHgs, coveredUntil, manualHgsLines, previewPortalHgs, outsideBookingTransits, readTransits, suggestedFrom, transitsTotal } from './portalHgs';

const mockCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let mockData: unknown = [];
jest.mock('./supabase', () => ({
  supabase: { rpc: async (fn: string, args: Record<string, unknown>) => { mockCalls.push({ fn, args }); return { data: mockData, error: null }; } },
}));

const line = (description: string | null, kind = 'hgs') => ({ kind, description } as { kind: 'hgs' | 'rental'; description: string | null });

beforeEach(() => { mockCalls.length = 0; });

describe('the database functions, and only them', () => {
  test('send the free range as given, null for an empty end', async () => {
    mockData = [
      { portal_id: 6235, tdate: '2026-10-17', amount: '59', road_type: 'public', note: '17-10-2026 ? → 15 TEMMUZ ŞEHİTLER KÖPRÜSÜ', outside_booking: false, other_booking: null },
      { portal_id: 6236, tdate: '2026-12-20', amount: '35', road_type: 'public', note: '20-12-2026 Çamlıca → Kurtköy', outside_booking: true, other_booking: 'HOM-12-26-004' },
    ];
    const rows = await previewPortalHgs(710, null, null);
    expect(mockCalls).toEqual([{ fn: 'preview_customer_hgs', args: { p_booking_id: 710, p_from_date: null, p_to_date: null } }]);
    expect(rows).toEqual([
      { portalId: 6235, date: '2026-10-17', amount: 59, roadType: 'public', note: '17-10-2026 ? → 15 TEMMUZ ŞEHİTLER KÖPRÜSÜ', outsideBooking: false, otherBooking: null },
      { portalId: 6236, date: '2026-12-20', amount: 35, roadType: 'public', note: '20-12-2026 Çamlıca → Kurtköy', outsideBooking: true, otherBooking: 'HOM-12-26-004' },
    ]);
    expect(outsideBookingTransits(rows).map(row => row.portalId)).toEqual([6236]);

    mockData = [{ inserted_count: 25, inserted_total: '1903.0' }];
    expect(await applyPortalHgs(710, '2026-10-01', '2027-01-15')).toEqual({ count: 25, total: 1903 });
    expect(mockCalls[1]).toEqual({ fn: 'apply_customer_hgs', args: { p_booking_id: 710, p_from_date: '2026-10-01', p_to_date: '2027-01-15' } });
  });

  test('lira only: nothing here sends or stores an exchange rate, or writes a line itself', () => {
    const source = ['lib/portalHgs.ts', 'components/wallet/PortalHgsDialog.tsx'].map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
    expect(source).not.toMatch(/exchange_rate|p_rate|rate_to_try|useCurrency|usd\(|toFixed\(2\)\)/i);
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  test('totals in lira, to the kuruş', () => {
    expect(transitsTotal(readTransits([{ amount: 10.5 }, { amount: '41' }, { amount: 0.1 }, { amount: 0.2 }]))).toBe(51.8);
  });
});

describe('the suggested start, after what hand-typed lines cover', () => {
  test('reads the shapes the wallet actually holds', () => {
    expect(coveredUntil(['HGS to 31/09/2026'], '2026-09-22')).toBe('2026-09-30');
    expect(coveredUntil(['FROM 02/10 TO 01/11'], '2026-09-22')).toBe('2026-11-01');
    expect(coveredUntil(['hgs to 05.11.2026'], '2026-09-22')).toBe('2026-11-05');
    expect(coveredUntil(['TO 3.11'], '2026-09-22')).toBe('2026-11-03');
    expect(coveredUntil(['to 05/01'], '2026-12-20')).toBe('2027-01-05');
  });

  test('the test booking: the line covers September, so it suggests 1 October', () => {
    expect(suggestedFrom([line('HGS to 31/09/2026')], '2026-09-22', '2026-12-07')).toBe('2026-10-01');
  });

  test('suggests nothing when there is nothing to go on, or the day is outside the booking', () => {
    expect(suggestedFrom([], '2026-09-22', '2026-12-07')).toBeNull();
    expect(suggestedFrom([line('HGS to 01/08/2026')], '2026-09-22', '2026-12-07')).toBeNull();
    expect(suggestedFrom([line('HGS to 31/12/2026')], '2026-09-22', '2026-12-07')).toBeNull();
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  test('lines the portal or the toll feed wrote are passes, not typed by hand', () => {
    const lines = [line('HGS to 31/09/2026'), line('17-10-2026 ? → 15 TEMMUZ ŞEHİTLER KÖPRÜSÜ'), line('[AUTO-HGS] 20-10-2026 14:05 A → B'), line('05-11-2026 hgs')];
    expect(manualHgsLines(lines).map(l => l.description)).toEqual(['HGS to 31/09/2026', '05-11-2026 hgs']);
  });
});

describe('the wallet reads a portal line as one pass', () => {
  test('its date, and its route', () => {
    expect(hgsDetail({ description: '02-10-2026 ODAYERİ → IŞIKLAR', created_at: '2026-11-09T10:00:00Z' }))
      .toEqual({ date: '2026-10-02', time: null, route: 'ODAYERİ → IŞIKLAR', toll: null, pass: true });
    expect(hgsDetail({ description: '17-10-2026 ? → 15 TEMMUZ ŞEHİTLER KÖPRÜSÜ', created_at: null }).route).toBe('15 TEMMUZ ŞEHİTLER KÖPRÜSÜ');
    expect(hgsDetail({ description: '05-11-2026 hgs', created_at: '2026-11-05T09:00:00Z' }).pass).toBe(false);
  });
});
