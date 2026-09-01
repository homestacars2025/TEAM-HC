import fs from 'fs';
import path from 'path';
import i18n from '../i18n';

/**
 * Delivery and pickup must carry a real `customer_id`.
 *
 * KABIS builds its row from the customer record — name, national id,
 * nationality, licence — so an operation without the link produces a report
 * with every one of those fields empty, and the WhatsApp message that follows
 * reads "Customer: -". 54 of 57 empty operations were created by staff from
 * this dashboard, typing the name into `note` instead of picking from the list.
 *
 * `note` is not a substitute for the link, so the link is now required. The
 * rule is deliberately narrow: only the two types KABIS reports on.
 */

const DP_TYPES = ['DELIVERY', 'PICKUP'];
const OTHER_TYPES = ['CAR_WASH', 'MAINTENANCE', 'OIL_CHANGE', 'OTHER'];

/** Mirrors the three derived values the form gates on. */
const gate = (type: string, customerId: string, opts: { saving?: boolean; photosComplete?: boolean; isEdit?: boolean } = {}) => {
  const { saving = false, photosComplete = true, isEdit = false } = opts;
  const needsCustomer = DP_TYPES.includes(type);
  const customerMissing = needsCustomer && customerId.trim() === '';
  const isStructured = !isEdit && DP_TYPES.includes(type);
  return {
    customerMissing,
    saveBlocked: saving || customerMissing || (isStructured && !photosComplete),
  };
};

describe.each(DP_TYPES)('%s', (type) => {
  test('cannot be saved without a linked customer', () => {
    const { customerMissing, saveBlocked } = gate(type, '');
    expect(customerMissing).toBe(true);
    expect(saveBlocked).toBe(true);
  });

  test('saves once a customer is picked', () => {
    const { customerMissing, saveBlocked } = gate(type, 'c-uuid-1');
    expect(customerMissing).toBe(false);
    expect(saveBlocked).toBe(false);
  });

  test('whitespace is not a customer', () => {
    expect(gate(type, '   ').customerMissing).toBe(true);
  });

  test('editing an older row is held to the same rule, since the booking backfills it', () => {
    expect(gate(type, '', { isEdit: true }).saveBlocked).toBe(true);
    expect(gate(type, 'c-uuid-1', { isEdit: true }).saveBlocked).toBe(false);
  });
});

describe.each(OTHER_TYPES)('%s', (type) => {
  test('needs no customer at all', () => {
    const { customerMissing, saveBlocked } = gate(type, '');
    expect(customerMissing).toBe(false);
    expect(saveBlocked).toBe(false);
  });
});

test('the photo rule still applies on top, and does not replace the customer rule', () => {
  // Missing both: blocked. The customer message is the one shown, because it is
  // the cheaper of the two to fix.
  expect(gate('DELIVERY', '', { photosComplete: false }).saveBlocked).toBe(true);
  expect(gate('DELIVERY', 'c-uuid-1', { photosComplete: false }).saveBlocked).toBe(true);
  expect(gate('DELIVERY', 'c-uuid-1', { photosComplete: true }).saveBlocked).toBe(false);
});

test('the refusal is worded in both languages', async () => {
  await i18n.changeLanguage('en');
  expect(i18n.t('operations:errors.customerRequired'))
    .toBe('Please select a linked customer for delivery/pickup operations.');
  await i18n.changeLanguage('ar');
  expect(i18n.t('operations:errors.customerRequired')).toMatch(/[؀-ۿ]/);
  await i18n.changeLanguage('en');
});

/**
 * The gate above is a mirror — the real one is three derived constants inside a
 * 2,800-line component, which cannot be imported on its own. So the mirror is
 * pinned to the source: if either expression is reworded, this fails and the
 * test has to be looked at rather than quietly going on passing against logic
 * that no longer exists.
 */
test('the mirror still matches the form it stands in for', () => {
  const src = fs.readFileSync(path.join(__dirname, 'OperationsPage.tsx'), 'utf8');

  expect(src).toContain("const needsCustomer  = (DP_TYPES as string[]).includes(form.type);");
  expect(src).toContain("const hasCustomer    = form.customer_id.trim() !== '';");
  expect(src).toContain("const customerMissing = needsCustomer && !hasCustomer;");
  expect(src).toContain("const saveBlocked = saving || customerMissing || (isStructured && !photosComplete);");

  // The two lists the rule divides the world into.
  expect(src).toContain("const DP_TYPES:    OperationType[] = ['DELIVERY', 'PICKUP'];");
  expect(src).toContain("const OTHER_TYPES: OperationType[] = ['CAR_WASH', 'MAINTENANCE', 'OIL_CHANGE', 'OTHER'];");

  // The button is gated on the summary, and submit refuses independently — a
  // disabled button alone would be bypassable by pressing Enter in a field.
  expect(src).toContain("disabled={saveBlocked}");
  expect(src).toContain("if (customerMissing)  { setFormError(t('errors.customerRequired')); return; }");

  // And the note stays a note: it is never read as a customer.
  expect(src).toContain("note:               form.note || null,");
});
