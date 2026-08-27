import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Lightbulb } from 'lucide-react';
import { TooltipProvider } from '../../components/ui/tooltip';
import { PageHeader } from '../../components/layout/page-header';
import { MediaNav } from './_components/media-nav';
import { MediaEmptyState } from './_components/media-empty-state';
import { ApprovedBadge, GoalBadge, PostedBadge, ToneBadge } from './_components/media-badges';
import { StatusSelect } from './influencers/_components/status-select';
import { MESSAGING_STATUSES } from '../../lib/types/media';
import { chipStyle, tintedStyle, toneFor } from '../../lib/media/badge-color';
import { formatCountry } from '../../lib/countries';

const wrap = (ui: React.ReactNode) => (
  <MemoryRouter initialEntries={['/dashboard/media/ideas']}>
    <TooltipProvider delay={0}>{ui}</TooltipProvider>
  </MemoryRouter>
);

test('page header renders eyebrow, title, subtitle', () => {
  render(wrap(<PageHeader eyebrow="Content Ideas" title="Ideas" subtitle="The backlog." />));
  expect(screen.getByText('Content Ideas')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Ideas' })).toBeInTheDocument();
});

test('media nav marks the current section', () => {
  render(wrap(<MediaNav />));
  expect(screen.getByRole('link', { name: /Ideas/ })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: /Calendar/ })).not.toHaveAttribute('aria-current');
});

test('empty state renders icon, title and action', () => {
  render(wrap(<MediaEmptyState icon={Lightbulb} title="No ideas yet" description="Backlog." action={<button>Add</button>} />));
  expect(screen.getByText('No ideas yet')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
});

test('admin flags render as non-interactive state, not controls', () => {
  render(wrap(<><PostedBadge posted={false} /><ApprovedBadge approved /></>));
  expect(screen.getByText('Not posted')).toBeInTheDocument();
  expect(screen.getByText('Approved')).toBeInTheDocument();
  // The whole point: never a button the server would reject.
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

test('goal badge falls back to the raw key when the lookup row is gone', () => {
  render(wrap(<GoalBadge goal={undefined} fallback="marketing_push" />));
  expect(screen.getByText('marketing_push')).toBeInTheDocument();
});

test('tone badge renders', () => {
  render(wrap(<ToneBadge label="UGC" tone="amber" />));
  expect(screen.getByText('UGC')).toBeInTheDocument();
});

test('status pill renders its value and is interactive', () => {
  render(wrap(
    <StatusSelect
      value="Contacted"
      options={MESSAGING_STATUSES}
      placeholder="Not set"
      ariaLabel="Messaging status for Ada"
      onSelect={async () => true}
    />,
  ));
  expect(screen.getByRole('button', { name: 'Messaging status for Ada' })).toBeInTheDocument();
  expect(screen.getByText('Contacted')).toBeInTheDocument();
});

test('colour derivation matches the documented mix ratios', () => {
  expect(tintedStyle('#3b82f6')).toEqual({
    backgroundColor: 'color-mix(in oklab, #3b82f6 13%, transparent)',
    color: 'color-mix(in oklab, #3b82f6 78%, #0a0a0a)',
    borderColor: 'color-mix(in oklab, #3b82f6 22%, transparent)',
  });
  expect(chipStyle('#3b82f6').borderInlineStartColor).toBe('#3b82f6');
  // A null colour still yields a legible badge rather than an invisible one.
  expect(tintedStyle(null).backgroundColor).toBe('rgb(0 0 0 / 0.05)');
  expect(chipStyle('   ').borderInlineStartColor).toBe('rgb(0 0 0 / 0.25)');
  expect(toneFor(MESSAGING_STATUSES, 'nonsense')).toBe('slate');
  expect(toneFor(MESSAGING_STATUSES, null)).toBe('slate');
});

test('country formatting resolves a code and passes free text through', () => {
  expect(formatCountry('TR')).toMatch(/^🇹🇷 /);
  expect(formatCountry('Istanbul')).toBe('Istanbul');
  expect(formatCountry(null)).toBe('');
});
