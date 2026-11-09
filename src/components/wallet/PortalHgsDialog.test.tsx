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

const transit = (portalId: number, date: string, amount: number) => ({ portalId, date, amount, roadType: 'public', note: `${date.split('-').reverse().join('-')} Çamlıca → Kurtköy` });

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
