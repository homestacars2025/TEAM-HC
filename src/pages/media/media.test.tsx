import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
// Imported for the side effect: these components read the shared instance.
import i18n from '../../i18n';
import { Lightbulb } from 'lucide-react';
import { TooltipProvider } from '../../components/ui/tooltip';
import { PageHeader } from '../../components/layout/page-header';
import { MediaNav } from './_components/media-nav';
import { MediaEmptyState } from './_components/media-empty-state';
import { ApprovedBadge, GoalBadge, PostedBadge, ToneBadge } from './_components/media-badges';
import { ReferenceChip, ReferenceIconLink } from './_components/reference-link';
import { ColorModeToggle } from './_components/color-mode-toggle';
import { StatusSelect } from './influencers/_components/status-select';
import {
  FINAL_DECISIONS, IDEA_CATEGORIES, INFLUENCER_TYPES, MESSAGING_STATUSES,
} from '../../lib/types/media';
import { chipStyle, tintedStyle, toneFor } from '../../lib/media/badge-color';
import { normalizeReferenceUrl, referenceLabel } from '../../lib/media/reference-url';
import { accentFor, isColorMode, DEFAULT_COLOR_MODE } from '../../lib/media/color-mode';
import { dateLocaleFor, makeMediaDates } from '../../lib/media/media-dates';
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
      labelKey="messagingStatus"
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

test('reference chip opens the link in a new tab, safely', () => {
  render(wrap(<ReferenceChip url="https://instagram.com/reel/abc" />));
  const link = screen.getByRole('link');
  expect(link).toHaveAttribute('href', 'https://instagram.com/reel/abc');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getByText('Reference')).toBeInTheDocument();
});

test('an unset reference renders nothing at all — never a disabled control', () => {
  const { container } = render(wrap(<><ReferenceChip url={null} /><ReferenceIconLink url="   " /></>));
  expect(container).toBeEmptyDOMElement();
});

test('a schemeless reference is still a usable link', () => {
  render(wrap(<ReferenceChip url="instagram.com/p/xyz" />));
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://instagram.com/p/xyz');
});

test('reference URLs normalise to one canonical form', () => {
  expect(normalizeReferenceUrl('  https://a.com/x  ')).toBe('https://a.com/x');
  expect(normalizeReferenceUrl('a.com/x')).toBe('https://a.com/x');
  expect(normalizeReferenceUrl('http://a.com')).toBe('http://a.com');
  // Blank in every guise means "unset", so an emptied field clears the column.
  expect(normalizeReferenceUrl('')).toBeNull();
  expect(normalizeReferenceUrl('   ')).toBeNull();
  expect(normalizeReferenceUrl(null)).toBeNull();
});

test('reference label drops the scheme and www, and survives junk', () => {
  expect(referenceLabel('https://www.instagram.com/reel/abc')).toBe('instagram.com/reel/abc');
  expect(referenceLabel('https://instagram.com/')).toBe('instagram.com');
  expect(referenceLabel('not a url')).toBe('not a url');
});

const GOAL = { key: 'growth', label: 'Growth', color: '#3b82f6', is_active: true, sort_order: 1 };
const FORMAT = { key: 'reel', label: 'Reel', color: '#a855f7', is_active: true, sort_order: 1 };

test('goal is the default colouring, preserving the original behaviour', () => {
  expect(DEFAULT_COLOR_MODE).toBe('goal');
  expect(accentFor('goal', GOAL, FORMAT)).toBe(GOAL);
});

test('format mode colours from the format row instead', () => {
  expect(accentFor('format', GOAL, FORMAT)).toBe(FORMAT);
});

test('a record unclassified in the active dimension gets no accent, not a wrong one', () => {
  // It must never silently fall back to the other taxonomy — that would show a
  // colour the legend does not explain.
  expect(accentFor('format', GOAL, undefined)).toBeUndefined();
  expect(accentFor('goal', undefined, FORMAT)).toBeUndefined();
});

test('a junk stored preference falls back to the default rather than breaking', () => {
  expect(isColorMode('goal')).toBe(true);
  expect(isColorMode('format')).toBe(true);
  expect(isColorMode('rainbow')).toBe(false);
  expect(isColorMode(null)).toBe(false);
});

test('the colour toggle exposes its state and reports a change', () => {
  const onChange = jest.fn();
  render(wrap(<ColorModeToggle value="goal" onChange={onChange} layoutId="t" />));

  const goal = screen.getByRole('button', { name: 'Goal' });
  const format = screen.getByRole('button', { name: 'Format' });
  expect(goal).toHaveAttribute('aria-pressed', 'true');
  expect(format).toHaveAttribute('aria-pressed', 'false');

  format.click();
  expect(onChange).toHaveBeenCalledWith('format');
});

// ─── Arabic ───────────────────────────────────────────────────────────────────

/**
 * The Media section is behind a per-user grant, so a screenshot cannot reach it
 * without signing in as the one account that has it. These assertions stand in
 * for that: the surfaces are mounted directly and read in Arabic.
 */
describe('in Arabic', () => {
  beforeAll(async () => { await i18n.changeLanguage('ar'); });
  afterAll(async () => { await i18n.changeLanguage('en'); });

  test('the sub-nav names the three pages, matching the sidebar', () => {
    render(wrap(<MediaNav />));
    for (const label of ['الأفكار', 'التقويم', 'المؤثرون']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const leaked of ['Ideas', 'Calendar', 'Influencers']) {
      expect(screen.queryByText(leaked)).toBeNull();
    }
    // The same word the sidebar uses — the two must never diverge.
    expect(i18n.t('media:nav.ideas')).toBe(i18n.t('sidebar:nav.ideas'));
    expect(i18n.t('media:nav.influencers')).toBe(i18n.t('sidebar:nav.influencers'));
  });

  test('the admin flags read as state in Arabic', () => {
    render(wrap(<><PostedBadge posted={false} /><ApprovedBadge approved /></>));
    expect(screen.getByText('غير منشور')).toBeInTheDocument();
    expect(screen.getByText('معتمد')).toBeInTheDocument();
  });

  test('the colour toggle is translated but still reports the English mode', () => {
    const onChange = jest.fn();
    render(wrap(<ColorModeToggle value="goal" onChange={onChange} layoutId="t-ar" />));
    const format = screen.getByRole('button', { name: 'الصيغة' });
    expect(screen.getByRole('button', { name: 'الهدف' })).toHaveAttribute('aria-pressed', 'true');
    format.click();
    // The stored preference is a key, not a label — Arabic must not change it.
    expect(onChange).toHaveBeenCalledWith('format');
  });

  test('a status pill shows Arabic while the value it saves stays English', async () => {
    const onSelect = jest.fn(async () => true);
    render(wrap(
      <StatusSelect
        value="Not Contacted"
        options={MESSAGING_STATUSES}
        placeholder="غير محدد"
        ariaLabel="حالة المراسلة"
        labelKey="messagingStatus"
        onSelect={onSelect}
      />,
    ));
    expect(screen.getByText('لم يتم التواصل')).toBeInTheDocument();
    expect(screen.queryByText('Not Contacted')).toBeNull();
  });

  test('a stored value with no translation falls back to itself, never to a key', () => {
    // A category an admin typed by hand, and a status renamed upstream.
    expect(i18n.t('media:category.Sunset', { defaultValue: 'Sunset' })).toBe('Sunset');
    expect(i18n.t('media:influencerType.Nano', { defaultValue: 'Nano' })).toBe('Nano');
  });

  test('every stored enum value has an Arabic display name', () => {
    const arabic = /[؀-ۿ]/;
    // UGC is an industry acronym and stays Latin, like KABIS elsewhere.
    const latinByDesign = new Set(['media:category.UGC', 'media:influencerType.UGC']);
    const keys = [
      ...IDEA_CATEGORIES.map((c) => `media:category.${c}`),
      ...INFLUENCER_TYPES.map((o) => `media:influencerType.${o.value}`),
      ...MESSAGING_STATUSES.map((o) => `media:messagingStatus.${o.value}`),
      ...FINAL_DECISIONS.map((o) => `media:finalDecision.${o.value}`),
    ];
    expect(keys.filter((k) => !i18n.exists(k))).toEqual([]);
    expect(keys.filter((k) => !latinByDesign.has(k) && !arabic.test(i18n.t(k) as string))).toEqual([]);
  });

  test('Arabic dates are Gregorian with Western digits, as everywhere else', () => {
    const d = makeMediaDates(dateLocaleFor('ar'));
    const march = new Date(Date.UTC(2026, 2, 4));
    expect(d.monthYear(march)).toContain('2026');
    expect(d.full(march)).toMatch(/[؀-ۿ]/);
    // Never Arabic-Indic digits (٢٠٢٦), and never a Hijri year.
    expect(d.full(march)).not.toMatch(/[٠-٩]/);
    expect(d.full(march)).toContain('2026');
    expect(d.weekdaysShort).toHaveLength(7);
    expect(d.weekdaysNarrow.every((w) => w.length > 0)).toBe(true);
  });

  test('the post counter uses the Arabic plural the count actually calls for', () => {
    expect(i18n.t('media:calendar.postCount', { count: 1 })).toBe('منشور واحد');
    expect(i18n.t('media:calendar.postCount', { count: 2 })).toBe('منشوران');
    expect(i18n.t('media:calendar.postCount', { count: 3 })).toBe('3 منشورات');
    // 50 is the "many" category — the one that silently fell back to English
    // in the bookings calendar before `plurals.test.ts` existed.
    expect(i18n.t('media:calendar.postCount', { count: 50 })).toBe('50 منشوراً');
  });
});
