import fs from 'fs';
import path from 'path';
import { ageTone, asIssueStatus, asIssueType, daysOpen, issueStats, matchesIssue, photoUrls, type IssueRow } from './carIssues';
import { fineDocuments, fineStats, inSegment, matchesFine, type Fine } from './fines';
import { bookingsOnDay, type CarBooking } from './queries/carBookings';

const TODAY = '2026-11-01';

const fine = (over: Partial<Fine>): Fine => ({
  id: '1', status: 'unpaid', plate_number: '34ABC123', violation_number: 'MB-1', customer_name: null, notification_date: null,
  amount: 100, location: null, violation_date: '2026-11-01', violation_time: null, article: null, description: null,
  fine_image_url: null, fine_pdf_url: null, payment_receipt_url: null, created_at: '', car_id: 1, customer_id: 'c', violation_code: null,
  ...over,
});

const issue = (over: Partial<IssueRow>): IssueRow => ({
  id: 1, car_id: 1, plate_number: '34ABC123', model_name: 'Fiat Egea', type: 'damage', status: 'open', description: 'scratch',
  damage_photos: [], repair_photos: [], damage_photo_count: 0, repair_photo_count: 0, booking_id: null, booking_number: null,
  customer_id: null, customer_name: null, discovered_at: '2026-10-20', discovered_by: null, discovered_by_name: null,
  resolved_at: null, days_to_resolve: null, created_at: '', updated_at: '', ...over,
});

describe('fines', () => {
  const fines = [
    fine({ id: 'a', amount: 1000 }),
    fine({ id: 'b', status: 'paid', amount: 500, violation_date: '2026-10-01' }),
    fine({ id: 'c', amount: 250, customer_id: null, violation_date: null }),
    fine({ id: 'd', amount: null, status: 'paid' }),
  ];

  test('counts and totals, with no amount counted as zero', () => {
    expect(fineStats(fines, TODAY)).toEqual({
      unpaid: { count: 2, total: 1250 },
      paid: { count: 2, total: 500 },
      month: { count: 2, total: 1000 },
      unassigned: 1,
      linked: 3,
    });
  });

  test('each segment', () => {
    const ids = (segment: Parameters<typeof inSegment>[1]) => fines.filter(f => inSegment(f, segment, TODAY)).map(f => f.id).join('');
    expect(ids('all')).toBe('abcd');
    expect(ids('unpaid')).toBe('ac');
    expect(ids('paid')).toBe('bd');
    expect(ids('unassigned')).toBe('c');
    expect(ids('month')).toBe('ad');
  });

  test('search covers plate, number, customer and place, and copes with blanks', () => {
    expect(matchesFine(fine({ violation_number: null, customer_name: 'Ali Kaya' }), 'ali')).toBe(true);
    expect(matchesFine(fine({ location: 'Şişli' }), 'şiş')).toBe(true);
    expect(matchesFine(fine({}), '34abc')).toBe(true);
    expect(matchesFine(fine({}), 'nothing')).toBe(false);
  });

  test('documents come in a fixed order, skipping what is missing', () => {
    expect(fineDocuments(fine({ fine_pdf_url: 'p', payment_receipt_url: 'r' })).map(d => d.label)).toEqual(['pdf', 'receipt']);
  });
});

describe('the writes the fine triggers depend on', () => {
  const source = fs.readFileSync(path.join(__dirname, 'queries/fines.ts'), 'utf8');

  test('a new fine is always unpaid: a paid insert would charge and never credit', () => {
    expect(source).toMatch(/const status: FineStatus = 'unpaid';/);
  });

  test('the only write that sets a status is marking it paid', () => {
    expect(source.match(/status: 'paid'/g)).toHaveLength(1);
    expect(source).not.toMatch(/status: 'unpaid'[^;]*update/);
  });

  test('the form has no way to change a status', () => {
    const form = fs.readFileSync(path.join(__dirname, '../components/fines/FineForm.tsx'), 'utf8');
    expect(form).toMatch(/type="button" disabled aria-pressed=\{status === option\}/);
  });
});

describe('who had the car', () => {
  const booking = (id: number, start_date: string, end_date: string): CarBooking => ({ id, booking_number: null, customer_id: 'c', customer_name: 'A', customer_banned: false, start_date, end_date });

  test('both ends of a booking count, and a handover day can give two', () => {
    const list = [booking(1, '2026-10-01', '2026-10-05'), booking(2, '2026-10-05', '2026-10-09')];
    expect(bookingsOnDay(list, '2026-10-05').map(b => b.id)).toEqual([1, 2]);
    expect(bookingsOnDay(list, '2026-10-10')).toEqual([]);
  });
});

describe('car issues', () => {
  test('stats', () => {
    expect(issueStats([
      issue({ id: 1 }),
      issue({ id: 2, type: 'accident' }),
      issue({ id: 3, status: 'resolved', resolved_at: '2026-11-01', days_to_resolve: 4 }),
      issue({ id: 4, status: 'resolved', resolved_at: '2026-09-01', days_to_resolve: 3 }),
      issue({ id: 5, status: 'resolved', type: 'accident', resolved_at: '2026-11-01', days_to_resolve: null }),
    ], TODAY)).toEqual({ open: 2, resolvedThisMonth: 2, resolved: 3, accidents: 2, averageDays: 3.5 });
  });

  test('no resolved issues: no average, not zero', () => {
    expect(issueStats([issue({})], TODAY).averageDays).toBeNull();
  });

  test('age: amber after 3 days, red after 7', () => {
    expect(daysOpen('2026-10-20', TODAY)).toBe(12);
    expect([ageTone(3), ageTone(4), ageTone(7), ageTone(8)]).toEqual(['calm', 'amber', 'amber', 'red']);
  });

  test('a date ahead of today is not a negative age', () => {
    expect(daysOpen('2026-11-05', TODAY)).toBe(0);
  });

  test('photos arrive in any shape jsonb can give', () => {
    expect(photoUrls(['a', 1, 'b'])).toEqual(['a', 'b']);
    expect(photoUrls('["a"]')).toEqual(['a']);
    expect(photoUrls(null)).toEqual([]);
    expect(photoUrls('not json')).toEqual([]);
  });

  test('unknown values land somewhere safe', () => {
    expect(asIssueType('flood')).toBe('other');
    expect(asIssueStatus('weird')).toBe('open');
  });

  test('search', () => {
    expect(matchesIssue(issue({ customer_name: 'Ali' }), 'ali')).toBe(true);
    expect(matchesIssue(issue({}), '34abc')).toBe(true);
    expect(matchesIssue(issue({}), 'zzz')).toBe(false);
  });
});
