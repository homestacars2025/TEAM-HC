import fs from 'fs';
import path from 'path';
import i18n from '../i18n';

const SRC = fs.readFileSync(path.join(__dirname, 'BookingsPage.tsx'), 'utf8');

/** The edit branch, sliced out so assertions cannot accidentally read the create path. */
const EDIT_BRANCH = SRC.slice(
  SRC.indexOf('// ── Edit ─'),
  SRC.indexOf('// ── Create ─'),
);

// ─── Extend ───────────────────────────────────────────────────────────────────

describe('extend booking', () => {
  test('goes through the RPC and never writes a table directly', () => {
    expect(SRC).toContain("supabase.rpc('extend_booking'");

    // The function moves end_date, forces status, and writes both ledger rows in
    // one transaction. Doing any of it here would be a second, divergent
    // implementation of a money path.
    const modal = SRC.slice(
      SRC.indexOf('const ExtendBookingModal'),
      SRC.indexOf('// ─── Replacement sheets'),
    );
    expect(modal).not.toMatch(/from\('customer_accounting_ledger'\)/);
    expect(modal).not.toMatch(/from\('car_calendar'\)/);
    expect(modal).not.toMatch(/from\('bookings'\)[\s\S]{0,80}\.update\(/);
  });

  test('sends exactly the five parameters the function declares', () => {
    for (const p of ['p_booking_id', 'p_new_end_date', 'p_rental_amount', 'p_paid_amount', 'p_created_by']) {
      expect(SRC).toContain(`${p}:`);
    }
  });

  test('a TABLE-returning function comes back as an array, and is unwrapped', () => {
    expect(SRC).toContain('Array.isArray(data) ? data[0] : data');
  });

  test('the button is hidden for a cancelled booking', () => {
    expect(SRC).toContain("onExtend && booking.status !== 'cancelled'");
  });

  test('extending is gated on a section key, so it can be restricted without a deploy', () => {
    expect(SRC).toContain("canAccess('booking_extend')");
    expect(SRC).toContain('onExtend={canExtend ? () => setExtendTarget(booking) : undefined}');
  });
});

/** Mirrors the modal's own guards. */
const extendGate = (currentEnd: string, newEnd: string, rental: string, paid: string) => {
  const rentalNum = Number(rental);
  const paidNum = paid.trim() === '' ? 0 : Number(paid);
  if (!newEnd) return 'endRequired';
  if (newEnd <= currentEnd) return 'endNotAfter';
  if (!Number.isFinite(rentalNum) || rentalNum <= 0) return 'rentalPositive';
  if (!Number.isFinite(paidNum) || paidNum < 0) return 'paidNegative';
  return null;
};

describe('extend validation', () => {
  test.each([
    ['',           '500', '0',  'endRequired'],
    ['2026-03-10', '500', '0',  'endNotAfter'],   // same day as the current end
    ['2026-03-09', '500', '0',  'endNotAfter'],   // before it
    ['2026-03-11', '0',   '0',  'rentalPositive'],
    ['2026-03-11', '-5',  '0',  'rentalPositive'],
    ['2026-03-11', '500', '-1', 'paidNegative'],
  ])('end=%s rental=%s paid=%s → %s', (end, rental, paid, expected) => {
    expect(extendGate('2026-03-10', end, rental, paid)).toBe(expected);
  });

  test('a valid extension passes, and an empty paid amount means zero', () => {
    expect(extendGate('2026-03-10', '2026-03-17', '500', '')).toBeNull();
    expect(extendGate('2026-03-10', '2026-03-17', '500', '0')).toBeNull();
  });
});

// ─── Replacement edit ─────────────────────────────────────────────────────────

describe('replacement edit', () => {
  test('the sheet query fetches the three ids editing needs', () => {
    // Without these the edit form cannot seed, and the calendar block is
    // unreachable — the sync below would be impossible.
    expect(SRC).toContain('original_car_id, replacement_car_id, calendar_block_id,');
  });

  test('the identity columns are never written on edit', () => {
    // A re-issued sheet_number would break every printed copy already handed out.
    for (const col of ['sheet_number:', 'original_booking_id:', 'customer_id:', 'original_car_id:']) {
      expect(EDIT_BRANCH).not.toContain(col);
    }
    // But the editable ones are.
    for (const col of ['replacement_car_id:', 'start_date:', 'end_date:', 'km_at_handover:', 'fuel_at_handover:', 'notes:']) {
      expect(EDIT_BRANCH).toContain(col);
    }
  });

  test('the calendar block is synced, since nothing in the database does it', () => {
    expect(EDIT_BRANCH).toContain("from('car_calendar')");
    expect(EDIT_BRANCH).toContain('.eq(\'id\', sheet.calendar_block_id)');
    // Same car and same dates as the sheet — a block left on the old car keeps
    // reserving it, and frees the new one for someone else to be given.
    expect(EDIT_BRANCH).toContain('car_id:     Number(replacementCarId),');
  });

  test('a sheet with no linked block is reported, not silently given one', () => {
    expect(EDIT_BRANCH).toContain('sheet.calendar_block_id == null');
    expect(EDIT_BRANCH).toContain("t('replacement.errors.noCalendarBlock')");
    // Never an insert: a stray block would reserve a car nobody asked for.
    expect(EDIT_BRANCH).not.toMatch(/from\('car_calendar'\)[\s\S]{0,60}\.insert\(/);
  });

  test('a failed calendar sync is surfaced, not swallowed', () => {
    expect(EDIT_BRANCH).toContain("t('replacement.errors.calendarOutOfSync')");
    expect(EDIT_BRANCH).toContain('calendarError.message');
  });
});

/** Mirrors the "does the calendar need moving?" decision. */
const needsSync = (
  stored: { replacement_car_id: number | null; start_date: string; end_date: string },
  next: { replacementCarId: string; startDate: string; endDate: string },
) =>
  String(stored.replacement_car_id ?? '') !== next.replacementCarId ||
  stored.start_date !== next.startDate ||
  stored.end_date !== next.endDate;

describe('when the calendar has to move', () => {
  const stored = { replacement_car_id: 7, start_date: '2026-03-01', end_date: '2026-03-10' };
  const same = { replacementCarId: '7', startDate: '2026-03-01', endDate: '2026-03-10' };

  test('a changed car, start or end each trigger a sync', () => {
    expect(needsSync(stored, { ...same, replacementCarId: '9' })).toBe(true);
    expect(needsSync(stored, { ...same, startDate: '2026-03-02' })).toBe(true);
    expect(needsSync(stored, { ...same, endDate: '2026-03-12' })).toBe(true);
  });

  test('editing only km, fuel or notes does not touch the calendar', () => {
    expect(needsSync(stored, same)).toBe(false);
  });

  test('the number/string mismatch across the boundary does not fake a change', () => {
    // The form holds ids as strings; the row holds them as numbers.
    expect(needsSync(stored, same)).toBe(false);
  });
});

// ─── Wording ──────────────────────────────────────────────────────────────────

test('both features are worded in both languages', async () => {
  const KEYS = [
    'bookings:extend.title', 'bookings:extend.newPeriodStarts', 'bookings:extend.newEndDate',
    'bookings:extend.rentalAmount', 'bookings:extend.paidAmount', 'bookings:extend.insuranceNote',
    'bookings:extend.errors.endNotAfter', 'bookings:extend.errors.rentalPositive',
    'bookings:replacement.editTitle', 'bookings:replacement.edit',
    'bookings:replacement.errors.calendarOutOfSync', 'bookings:replacement.errors.noCalendarBlock',
  ];
  for (const lng of ['en', 'ar']) {
    await i18n.changeLanguage(lng);
    expect(KEYS.filter(k => !i18n.exists(k))).toEqual([]);
  }
  await i18n.changeLanguage('ar');
  const arabic = /[؀-ۿ]/;
  expect(KEYS.filter(k => !arabic.test(i18n.t(k) as string))).toEqual([]);

  // The insurance line is a promise to the customer — it must actually say it.
  await i18n.changeLanguage('en');
  expect(i18n.t('bookings:extend.insuranceNote')).toContain('Insurance carries over');
  await i18n.changeLanguage('en');
});
