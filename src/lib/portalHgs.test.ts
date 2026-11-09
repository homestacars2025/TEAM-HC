import fs from 'fs';
import path from 'path';
import { addDays, coveredUntil, defaultFrom, manualHgsLines, previewPortalHgs, readPreview, transitRoute, PortalHgsUnavailable } from './portalHgs';

let mockRpc: { data: unknown; error: { message: string; code?: string } | null } = { data: null, error: null };
jest.mock('./supabase', () => ({ supabase: { rpc: async () => mockRpc } }));

const line = (description: string | null, kind = 'hgs') => ({ kind, description } as { kind: 'hgs' | 'rental'; description: string | null });

describe('the default period starts after what hand-typed HGS lines already cover', () => {
  test('reads the shapes the wallet actually holds', () => {
    expect(coveredUntil(['HGS to 31/09/2026'], '2026-09-22')).toBe('2026-09-30');
    expect(coveredUntil(['FROM 02/10 TO 01/11'], '2026-09-22')).toBe('2026-11-01');
    expect(coveredUntil(['hgs to 05.11.2026'], '2026-09-22')).toBe('2026-11-05');
    expect(coveredUntil(['TO 3.11'], '2026-09-22')).toBe('2026-11-03');
    expect(coveredUntil(['HGS', 'Rental fee', null], '2026-09-22')).toBeNull();
  });

  test('without a year, the one at or after the booking start', () => {
    expect(coveredUntil(['to 05/01'], '2026-12-20')).toBe('2027-01-05');
  });

  test('takes the latest, and only from hand-typed HGS lines', () => {
    const lines = [line('HGS to 10/10/2026'), line('[AUTO-HGS] 20-10-2026 14:05 A → B'), line('to 30/12/2026', 'rental'), line('HGS to 20/10/2026')];
    expect(manualHgsLines(lines).map(l => l.description)).toEqual(['HGS to 10/10/2026', 'HGS to 20/10/2026']);
    expect(defaultFrom(lines, '2026-09-22', '2026-12-07')).toBe('2026-10-21');
  });

  test('the test booking: the hand-typed line covers September, so the default starts on 1 October', () => {
    expect(defaultFrom([line('HGS to 31/09/2026')], '2026-09-22', '2026-12-07')).toBe('2026-10-01');
  });

  test('always inside the booking', () => {
    expect(defaultFrom([], '2026-09-22', '2026-12-07')).toBe('2026-09-22');
    expect(defaultFrom([line('HGS to 01/08/2026')], '2026-09-22', '2026-12-07')).toBe('2026-09-22');
    expect(defaultFrom([line('HGS to 31/12/2026')], '2026-09-22', '2026-12-07')).toBe('2026-12-07');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('the preview', () => {
  test('reads the database answer', () => {
    const preview = readPreview({
      booking_id: 710, plate: '41AGZ890', status: 'confirmed', start_date: '2026-09-22', end_date: '2026-12-07', from: '2026-10-04', to: '2026-12-07',
      last_upload: '2026-11-05T15:53', last_transit: '2026-11-03T18:40', rate_hint: '49.5', count: 1, total: '59',
      transits: [{ id: 5, at: '2026-10-17 09:12', date: '2026-10-17', amount: '59', road_type: 'public', entry_location: null, exit_location: null, otoyol: 'O-7' }],
      investor_count: 0, investor_total: 0, posted_count: 0,
    });
    expect(preview).toMatchObject({ bookingId: 710, rateHint: 49.5, total: 59, from: '2026-10-04' });
    expect(transitRoute(preview.transits[0])).toBe('? → O-7');
  });

  test('says plainly when the database update is missing, rather than failing vaguely', async () => {
    mockRpc = { data: null, error: { message: 'Could not find the function public.booking_portal_hgs_preview', code: 'PGRST202' } };
    await expect(previewPortalHgs(710, null, null)).rejects.toBeInstanceOf(PortalHgsUnavailable);
  });
});

describe('the database rule', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261109_customer_portal_hgs.sql'), 'utf8');

  test('clamps the period to the booking, both in the preview and when posting', () => {
    expect(sql.match(/v_from := greatest\(coalesce\(p_from, b\.start_date\), b\.start_date\);/g)).toHaveLength(2);
    expect(sql.match(/v_to := least\(coalesce\(p_to, b\.end_date\), b\.end_date\);/g)).toHaveLength(2);
  });

  test('never charges a transit twice or one the investor already has, and locks before writing', () => {
    expect(sql).toMatch(/posted_to_customer_booking_id is null\s+and t\.posted_to_investor_at is null\s+order by t\.transit_datetime\s+for update/);
    expect(sql).toContain('update hgs_portal_transits set posted_to_customer_booking_id = b.id where id = r.id;');
  });

  test('writes HGS lines only, out, in lira, in the wallet format', () => {
    expect(sql).toContain("(b.id, b.customer_id, b.car_id::int, 'hgs',");
    expect(sql).toContain("r.amount, 'OUT', p_rate, auth.uid());");
    expect(sql).toContain("'[AUTO-HGS] ' || to_char(r.transit_datetime at time zone 'Europe/Istanbul', 'DD-MM-YYYY HH24:MI')");
    expect(sql).not.toMatch(/update\s+customer_accounting_ledger|delete\s+from\s+customer_accounting_ledger|financial_transactions/i);
  });
});
