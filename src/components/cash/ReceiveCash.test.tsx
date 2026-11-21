import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import type { CashBooking } from '../../lib/receiveCash';

const mockGetBooking = jest.fn();
const mockCustomerBookings = jest.fn();
const mockByPlate = jest.fn();
const mockReceive = jest.fn();
const mockHeld = jest.fn();
const mockPrint = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/queries/receiveCash', () => ({
  getCashBooking: (...a: unknown[]) => mockGetBooking(...a),
  getCustomerCashBookings: (...a: unknown[]) => mockCustomerBookings(...a),
  findCashBookingsByPlate: (...a: unknown[]) => mockByPlate(...a),
  receiveCash: (...a: unknown[]) => mockReceive(...a),
  getHeldEnvelopes: (...a: unknown[]) => mockHeld(...a),
}));
jest.mock('../../lib/queries/customers', () => ({ findCustomers: jest.fn().mockResolvedValue([]) }));
jest.mock('../../lib/printDocument', () => ({ printHtml: (...a: unknown[]) => mockPrint(...a) }));
// eslint-disable-next-line import/first
import { ReceiveCashProvider, useReceiveCash, type ReceiveCashPrefill } from './ReceiveCashContext';
// eslint-disable-next-line import/first
import HeldEnvelopesCard from './HeldEnvelopesCard';

const BOOKING: CashBooking = {
  id: 710, bookingNumber: 'HOM-11-26-007', status: 'confirmed', startDate: '2026-11-18', endDate: '2026-11-25', plate: '34ABC101', model: 'Renault Clio',
  customerId: 'c1', customerName: 'Ali Veli', createdAt: null,
};
const RECEIPT = {
  ledgerId: 'l1', amountTry: 43215,
  envelope: { ref: 'ENV-2611-0042', purpose: 'Rental', plate: '34ABC101', customer: 'Ali Veli', bookingNumber: 'HOM-11-26-007', date: '2026-11-21 14:05', amount: 1250, currency: 'USD', holder: 'Lina Haddad', status: 'with_employee' },
};

const Opener: React.FC<{ prefill?: ReceiveCashPrefill }> = ({ prefill }) => {
  const { open } = useReceiveCash();
  return <button type="button" onClick={() => open(prefill)}>open</button>;
};
const renderSheet = (prefill?: ReceiveCashPrefill) => {
  render(<I18nextProvider i18n={i18n}><ReceiveCashProvider><Opener prefill={prefill} /></ReceiveCashProvider></I18nextProvider>);
  fireEvent.click(screen.getByText('open'));
};

beforeEach(async () => {
  await i18n.changeLanguage('en');
  [mockGetBooking, mockCustomerBookings, mockByPlate, mockReceive, mockHeld, mockPrint].forEach(mock => mock.mockReset());
  mockGetBooking.mockResolvedValue(BOOKING);
  mockPrint.mockResolvedValue(undefined);
});

test('from a booking: purpose, amount in dollars, confirm, then the envelope code', async () => {
  renderSheet({ bookingId: 710 });
  expect(await screen.findByRole('heading', { name: 'What is it for?' })).toBeInTheDocument();
  expect(mockGetBooking).toHaveBeenCalledWith(710);

  fireEvent.click(screen.getByRole('radio', { name: /Rental/ }));
  const amount = await screen.findByLabelText('Amount received');
  fireEvent.change(amount, { target: { value: '1250' } });
  fireEvent.click(screen.getByRole('radio', { name: 'US dollar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

  expect(await screen.findByRole('heading', { name: 'Check and confirm' })).toBeInTheDocument();
  expect(screen.getByText('$1,250')).toBeInTheDocument();
  mockReceive.mockResolvedValue(RECEIPT);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm receipt' }));

  expect(await screen.findByRole('heading', { name: 'Cash received' })).toBeInTheDocument();
  expect(mockReceive).toHaveBeenCalledWith({ bookingId: 710, purpose: 'rental', amount: 1250, currency: 'USD', note: null });
  expect(screen.getByText('ENV-2611-0042')).toBeInTheDocument();
  expect(screen.getByText('With you')).toBeInTheDocument();
  expect(screen.getByText('Write the code on the envelope and hand it to finance.')).toBeInTheDocument();
  const share = screen.getByRole('link', { name: /Share via WhatsApp/ });
  expect(decodeURIComponent(share.getAttribute('href') ?? '')).toContain('Envelope code: ENV-2611-0042');

  fireEvent.click(screen.getByRole('button', { name: /Print envelope label/ }));
  expect(mockPrint).toHaveBeenCalledTimes(1);
  expect(mockPrint.mock.calls[0][0]).toContain('ENV-2611-0042');
});

test('a refusal from the server shows as a friendly toast, and nothing moves on', async () => {
  renderSheet({ bookingId: 710 });
  fireEvent.click(await screen.findByRole('radio', { name: /Deposit/ }));
  fireEvent.change(await screen.findByLabelText('Amount received'), { target: { value: '500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  mockReceive.mockRejectedValue({ message: 'This booking is cancelled' });
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm receipt' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This booking is cancelled. Pick another.');
  expect(screen.getByRole('heading', { name: 'Check and confirm' })).toBeInTheDocument();
});

test('"Other" needs a note before it can go on', async () => {
  renderSheet({ bookingId: 710 });
  fireEvent.click(await screen.findByRole('radio', { name: /Other/ }));
  fireEvent.change(await screen.findByLabelText('Amount received'), { target: { value: '20' } });
  const next = screen.getByRole('button', { name: 'Continue' });
  expect(next).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Note (required for Other)'), { target: { value: 'Child seat' } });
  expect(next).toBeEnabled();
});

test('from a customer: the only active booking is chosen for them, cancelled ones never show', async () => {
  mockCustomerBookings.mockResolvedValue([
    { ...BOOKING, id: 1, bookingNumber: 'HOM-OLD', status: 'completed', startDate: '2026-08-01' },
    BOOKING,
    { ...BOOKING, id: 2, bookingNumber: 'HOM-CXL', status: 'cancelled', startDate: '2026-11-20' },
  ]);
  renderSheet({ customer: { id: 'c1', name: 'Ali Veli' } });
  const group = await screen.findByRole('radiogroup', { name: 'Which booking?' });
  const cards = within(group).getAllByRole('radio');
  expect(cards.map(card => card.textContent)).toEqual([expect.stringContaining('HOM-11-26-007'), expect.stringContaining('HOM-OLD')]);
  expect(cards[0]).toHaveAttribute('aria-checked', 'true');
  expect(screen.queryByText('HOM-CXL')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(mockCustomerBookings).toHaveBeenCalledWith('c1');
});

test('Arabic: the labels and the button read in Arabic', async () => {
  await act(async () => { await i18n.changeLanguage('ar'); });
  renderSheet({ bookingId: 710 });
  expect(await screen.findByRole('heading', { name: 'مقابل ماذا؟' })).toBeInTheDocument();
  ['إيجار', 'تأمين', 'تمديد', 'HGS', 'مخالفة', 'ضرر', 'بنزين', 'توصيل', 'أخرى'].forEach(label => expect(screen.getByRole('radio', { name: label })).toBeInTheDocument());
});

describe('My envelopes', () => {
  test('count, totals per currency, and amber past a day', async () => {
    const now = Date.now();
    mockHeld.mockResolvedValue([
      { id: 1, ref: 'ENV-OLD', amount: 100, currency: 'TRY', createdAt: new Date(now - 30 * 3600e3).toISOString(), bookingNumber: null, plate: null, customer: 'Ali Veli', note: null },
      { id: 2, ref: 'ENV-NEW', amount: 50, currency: 'USD', createdAt: new Date(now - 3 * 3600e3).toISOString(), bookingNumber: null, plate: null, customer: 'Mona', note: null },
    ]);
    render(<I18nextProvider i18n={i18n}><HeldEnvelopesCard everyone={false} custodyRoute={null} /></I18nextProvider>);
    expect(await screen.findByText('2 envelopes')).toBeInTheDocument();
    expect(screen.getByText('₺100 · $50')).toBeInTheDocument();
    const [oldOne, newOne] = screen.getAllByRole('listitem');
    expect(oldOne).toHaveTextContent('ENV-OLD');
    expect(oldOne).toHaveClass('is-late');
    expect(newOne).toHaveTextContent('ENV-NEW');
    expect(newOne).not.toHaveClass('is-late');
    expect(screen.getByText('3 hours ago')).toBeInTheDocument();
    expect(screen.getByText('1 envelope held for over a day — hand it to finance.')).toBeInTheDocument();
  });

  test('in Arabic, the time held reads "منذ"', async () => {
    await act(async () => { await i18n.changeLanguage('ar'); });
    mockHeld.mockResolvedValue([{ id: 2, ref: 'ENV-NEW', amount: 50, currency: 'USD', createdAt: new Date(Date.now() - 3 * 3600e3).toISOString(), bookingNumber: null, plate: null, customer: 'Mona', note: null }]);
    render(<I18nextProvider i18n={i18n}><HeldEnvelopesCard everyone={false} custodyRoute={null} /></I18nextProvider>);
    expect(await screen.findByText('منذ 3 ساعات')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ظروفي' })).toBeInTheDocument();
    expect(await screen.findByText('ظرف واحد')).toBeInTheDocument();
  });
});
