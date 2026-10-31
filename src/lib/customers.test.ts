import { classifyTyped, isRealIdNumber, parseCustomerError } from './queries/customers';

describe('parseCustomerError', () => {
  test('a ban, with its reason', () => {
    expect(parseCustomerError('CUSTOMER_BANNED: Ali Kaya is banned (matched on phone). Reason: Damaged a car')).toEqual({
      kind: 'banned', name: 'Ali Kaya', reason: 'Damaged a car',
    });
  });

  test('a reason of a dash, as the trigger writes when there is none', () => {
    expect(parseCustomerError('CUSTOMER_BANNED: Ali is banned (matched on customer). Reason: -')).toMatchObject({ kind: 'banned', reason: '-' });
  });

  test('a duplicate ID names the owner and their id', () => {
    expect(parseCustomerError('DUPLICATE_ID_NUMBER: this ID/passport is already registered for Ali Kaya (0f8fad5b-d9cb-469f-a165-70867728950e)')).toEqual({
      kind: 'duplicate', name: 'Ali Kaya', customerId: '0f8fad5b-d9cb-469f-a165-70867728950e',
    });
  });

  test('a duplicate in an unexpected shape is still a duplicate', () => {
    expect(parseCustomerError('DUPLICATE_ID_NUMBER: nope')).toEqual({ kind: 'duplicate', name: '', customerId: null });
  });

  test('anything else is left alone', () => {
    expect(parseCustomerError('duplicate key value violates something')).toBeNull();
    expect(parseCustomerError(null)).toBeNull();
  });
});

describe('classifyTyped', () => {
  test.each([
    ['', {}],
    ['12345678901', { idNumber: '12345678901' }],
    ['U 1234567', { idNumber: 'U1234567' }],
    ['+90 555 123 45 67', { phone: '+90 555 123 45 67' }],
    ['05551234567', { phone: '05551234567' }],
    ['5551234567', { phone: '5551234567' }],
    ['Ali', { firstName: 'Ali', lastName: '' }],
    ['Ali Veli Kaya', { firstName: 'Ali', lastName: 'Veli Kaya' }],
    ['محمد العبدالله', { firstName: 'محمد', lastName: 'العبدالله' }],
  ])('%j', (text, expected) => expect(classifyTyped(text)).toEqual(expected));
});

test('placeholder IDs are not treated as real ones, as in the database', () => {
  expect(isRealIdNumber('U1234567')).toBe(true);
  expect(isRealIdNumber('12 345-67')).toBe(true);
  expect(isRealIdNumber('12345')).toBe(false);
  expect(isRealIdNumber('000000')).toBe(false);
  expect(isRealIdNumber('')).toBe(false);
});
