import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import type { BookingWallet } from '../../lib/bookingWallet';

const mockPreview = jest.fn();
const mockApply = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/portalHgs', () => ({
  ...jest.requireActual('../../lib/portalHgs'),
  previewPortalHgs: (...args: unknown[]) => mockPreview(...args),
  applyPortalHgs: (...args: unknown[]) => mockApply(...args),
  getPortalFreshness: async () => ({ lastUpload: '2026-11-08T12:53:05Z', lastTransit: '2026-11-03T09:00:00Z' }),
}));
// eslint-disable-next-line import/first
import { PortalHgsDialog } from './PortalHgsDialog';

const entry = {
  booking: { id: 710, car_id: 26, plate: '41AGZ890', booking_number: 'HOM-09-26-037', start_date: '2026-09-22', end_date: '2026-12-07' },
  lines: [],
} as unknown as BookingWallet;

const transit = (portalId: number, date: string, amount: number, outsideBooking = false, otherBooking: string | null = null) =>
  ({ portalId, date, amount, roadType: 'public', note: `${date.split('-').reverse().join('-')} Çamlıca → Kurtköy`, outsideBooking, otherBooking });

beforeEach(async () => {
  await act(async () => { await i18n.changeLanguage('en'); });
  mockPreview.mockReset().mockResolvedValue([transit(2, '2026-10-02', 65), transit(3, '2026-10-05', 35)]);
  mockApply.mockReset().mockResolvedValue({ count: 2, total: 100 });
});

const open = (onPosted = jest.fn()) => {
  render(<I18nextProvider i18n={i18n}><PortalHgsDialog entry={entry} onClose={jest.fn()} onPosted={onPosted} /></I18nextProvider>);
  return screen.findByRole('dialog');
};

test('From and To are free, past the booking too, and the preview follows both', async () => {
  const dialog = await open();
  await waitFor(() => expect(mockPreview).toHaveBeenCalledWith(710, '2026-09-22', '2026-12-07'));
  const from = within(dialog).getByLabelText('From');
  const to = within(dialog).getByLabelText('To');
  expect(from).not.toHaveAttribute('min');
  expect(to).not.toHaveAttribute('max');
  fireEvent.change(from, { target: { value: '2026-01-01' } });
  fireEvent.change(to, { target: { value: '2027-06-30' } });
  await waitFor(() => expect(mockPreview).toHaveBeenLastCalledWith(710, '2026-01-01', '2027-06-30'));
  expect(to).toHaveValue('2027-06-30');
});

test('lira only, and confirm applies the range as picked', async () => {
  const onPosted = jest.fn();
  const dialog = await open(onPosted);
  fireEvent.change(within(dialog).getByLabelText('From'), { target: { value: '2026-10-01' } });
  const confirm = await within(dialog).findByRole('button', { name: /^Add 2 transits \(₺100\)$/ });
  expect(within(dialog).queryByLabelText(/rate/i)).not.toBeInTheDocument();
  expect(dialog).not.toHaveTextContent(/USD|\$/);
  fireEvent.click(confirm);
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(710, '2026-10-01', '2026-12-07'));
  expect(onPosted).toHaveBeenCalledWith(2, 100);
});

test('nothing new: the button is off and says so', async () => {
  mockPreview.mockResolvedValue([]);
  const dialog = await open();
  expect(await within(dialog).findByText('No new transits to add.')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'No new transits to add' })).toBeDisabled();
});

test('rows outside the booking are marked, counted above the list, and asked about before charging', async () => {
  mockPreview.mockResolvedValue([
    transit(1, '2026-09-20', 40, true, 'HOM-09-26-011'),
    transit(2, '2026-10-02', 65),
    transit(3, '2026-12-09', 35, true),
  ]);
  const dialog = await open();
  const list = await within(dialog).findByRole('region', { name: 'Transits to add' });
  expect(list).toHaveTextContent('3 new transits·₺140·2 outside this booking');
  expect(within(list).getAllByText('Outside this booking')).toHaveLength(2);
  expect(within(list).getByText(/^On .HOM-09-26-011.'s dates$/)).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: /^Add 3 transits/ }));
  const ask = await screen.findByRole('alertdialog');
  expect(ask).toHaveTextContent('Charge transits outside this booking?');
  expect(ask).toHaveTextContent("2 of the 3 transits (₺75) are outside this booking's dates. 1 falls on another booking's dates.");
  expect(mockApply).not.toHaveBeenCalled();

  fireEvent.keyDown(within(ask).getByRole('button', { name: 'Cancel' }), { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();

  fireEvent.click(within(dialog).getByRole('button', { name: /^Add 3 transits/ }));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /^Add 3 transits/ }));
  await waitFor(() => expect(mockApply).toHaveBeenCalledWith(710, '2026-09-22', '2026-12-07'));
});

test('inside the booking it charges straight away, with no question', async () => {
  const dialog = await open();
  fireEvent.click(await within(dialog).findByRole('button', { name: /^Add 2 transits/ }));
  await waitFor(() => expect(mockApply).toHaveBeenCalled());
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

test('To before From reads nothing and says why', async () => {
  const dialog = await open();
  await within(dialog).findByRole('region', { name: 'Transits to add' });
  mockPreview.mockClear();
  fireEvent.change(within(dialog).getByLabelText('To'), { target: { value: '2026-09-01' } });
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('To is before From.');
  expect(within(dialog).getByLabelText('To')).toHaveAttribute('aria-invalid', 'true');
  await new Promise(resolve => setTimeout(resolve, 400));
  expect(mockPreview).not.toHaveBeenCalled();
  expect(within(dialog).getByRole('button', { name: 'No new transits to add' })).toBeDisabled();
});

test('typing a date reads once it settles, not on every change', async () => {
  const dialog = await open();
  await within(dialog).findByRole('region', { name: 'Transits to add' });
  mockPreview.mockClear();
  const from = within(dialog).getByLabelText('From');
  fireEvent.change(from, { target: { value: '2026-09-25' } });
  fireEvent.change(from, { target: { value: '2026-09-28' } });
  fireEvent.change(from, { target: { value: '2026-10-01' } });
  await waitFor(() => expect(mockPreview).toHaveBeenCalledWith(710, '2026-10-01', '2026-12-07'));
  expect(mockPreview).toHaveBeenCalledTimes(1);
});

test('Arabic: the pills and the summary read in Arabic', async () => {
  await act(async () => { await i18n.changeLanguage('ar'); });
  mockPreview.mockResolvedValue([transit(1, '2026-09-20', 40, true, 'HOM-09-26-011')]);
  const dialog = await open();
  const list = await within(dialog).findByRole('region');
  expect(list).toHaveTextContent('خارج تواريخ الحجز');
  expect(list).toHaveTextContent(/ضمن حجز .HOM-09-26-011./);
  expect(list).toHaveTextContent('1 خارج تواريخ الحجز');
});
