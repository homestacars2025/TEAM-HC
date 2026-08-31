import * as React from 'react';
import { ExternalLink, Mail, Megaphone, Pencil, Plus, Search, SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '../../../../components/ui/select';
import { formatCountry, localisedCountryName } from '../../../../lib/countries';
import { TONE_CLASSES, TONE_DOTS, toneFor } from '../../../../lib/media/badge-color';
import {
  FINAL_DECISIONS, INFLUENCER_TYPES, MESSAGING_STATUSES, type MediaInfluencer,
} from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';
import { MediaEmptyState } from '../../_components/media-empty-state';
import { updateInfluencerStatus } from '../../_actions';
import { InfluencerFormSheet } from './influencer-form-sheet';
import { StatusSelect } from './status-select';

const ANY = '_any';

const TH = 'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-black/40';
const DASH = <span className="text-[12.5px] text-black/25">—</span>;

export function InfluencersClient({ influencers: initial }: { influencers: MediaInfluencer[] }) {
  const { t } = useTranslation('media');
  const { t: tc, i18n } = useTranslation('common');
  const lang = i18n.resolvedLanguage ?? 'en';
  /**
   * `formatCountry` yields the English "🇹🇷 Turkey". The flag is kept and only
   * the name is swapped, so an Arabic reader still scans the same column of
   * flags — and a free-text country an older row stored passes through as typed.
   */
  const countryName = React.useCallback(
    (code: string | null | undefined) => {
      const english = formatCountry(code);
      if (!code || !english.includes(' ')) return english;
      const [flag, ...rest] = english.split(' ');
      return `${flag} ${localisedCountryName(lang, code, rest.join(' '))}`;
    },
    [lang],
  );
  const [rows, setRows] = React.useState(initial);
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<string>(ANY);
  const [countryFilter, setCountryFilter] = React.useState<string>(ANY);
  const [statusFilter, setStatusFilter] = React.useState<string>(ANY);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MediaInfluencer | null>(null);

  // Server state reconciled during render, not in an effect.
  const [seed, setSeed] = React.useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setRows(initial);
  }

  /** Derived from the data, so the filter only ever offers real choices. */
  const countryOptions = React.useMemo(() => {
    const codes = new Set(rows.map((r) => r.country).filter((c): c is string => Boolean(c)));
    return Array.from(codes).sort((a, b) => countryName(a).localeCompare(countryName(b), lang));
  }, [rows, countryName, lang]);

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== ANY && r.type !== typeFilter) return false;
      if (countryFilter !== ANY && r.country !== countryFilter) return false;
      if (statusFilter !== ANY && r.messaging_status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.email_contact ?? '').toLowerCase().includes(q) ||
        (r.url ?? '').toLowerCase().includes(q) ||
        (r.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, countryFilter, statusFilter]);

  const isFiltered =
    search.trim() !== '' || typeFilter !== ANY || countryFilter !== ANY || statusFilter !== ANY;

  const clearFilters = () => {
    setSearch(''); setTypeFilter(ANY); setCountryFilter(ANY); setStatusFilter(ANY);
  };

  const openCreate = () => { setEditing(null); setSheetOpen(true); };

  /** Optimism lives inside StatusSelect; this only reports a refusal. */
  const saveStatus = React.useCallback(
    async (id: string, field: 'messaging_status' | 'final_decision', next: string | null) => {
      const result = await updateInfluencerStatus(id, field, next);
      if (!result.ok) {
        toast.error(result.error ?? t('errors.updateStatus'));
        return false;
      }
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: next } : r)));
      return true;
    },
    [t],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={14}
              strokeWidth={1.75}
              aria-hidden
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-black/30"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('influencers.searchPlaceholder')}
              aria-label={t('influencers.searchAria')}
              className="h-9 ps-8 text-[13px]"
            />
          </div>

          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={INFLUENCER_TYPES.map((ty) => ({ value: ty.value, label: t(`influencerType.${ty.value}`) }))}
            allLabel={t('influencers.allTypes')}
            ariaLabel={t('influencers.filterTypeAria')}
          />
          <FilterSelect
            value={countryFilter}
            onChange={setCountryFilter}
            options={countryOptions.map((c) => ({ value: c, label: countryName(c) }))}
            allLabel={t('influencers.allCountries')}
            ariaLabel={t('influencers.filterCountryAria')}
          />
          <FilterSelect
            value={statusFilter}
            onChange={setStatusFilter}
            options={MESSAGING_STATUSES.map((m) => ({ value: m.value, label: t(`messagingStatus.${m.value}`) }))}
            allLabel={t('influencers.allStatuses')}
            ariaLabel={t('influencers.filterStatusAria')}
          />

          {isFiltered && (
            <Button variant="ghost" size="sm" className="text-black/50" onClick={clearFilters}>
              {tc('actions.clear')}
            </Button>
          )}
        </div>

        <Button size="lg" onClick={openCreate} className="shrink-0">
          <Plus size={15} strokeWidth={2} data-icon="inline-start" />
          {t('influencers.newInfluencer')}
        </Button>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        isFiltered ? (
          <MediaEmptyState
            icon={SearchX}
            title={t('influencers.empty.filteredTitle')}
            description={t('influencers.empty.filteredBody')}
            action={<Button variant="outline" size="lg" onClick={clearFilters}>{tc('actions.clearFilters')}</Button>}
          />
        ) : (
          <MediaEmptyState
            icon={Megaphone}
            title={t('influencers.empty.noneTitle')}
            description={t('influencers.empty.noneBody')}
            action={
              <Button size="lg" onClick={openCreate}>
                <Plus size={15} strokeWidth={2} data-icon="inline-start" />
                {t('influencers.empty.addFirst')}
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-start">
              <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
                <tr className="border-b border-black/[0.07]">
                  <th scope="col" className={TH}>{t('influencers.columns.influencer')}</th>
                  <th scope="col" className={TH}>{t('influencers.columns.followers')}</th>
                  <th scope="col" className={TH}>{tc('fields.type')}</th>
                  <th scope="col" className={TH}>{tc('fields.country')}</th>
                  <th scope="col" className={TH}>{t('influencers.columns.contact')}</th>
                  <th scope="col" className={TH}>{t('influencers.columns.messaging')}</th>
                  <th scope="col" className={TH}>{t('influencers.columns.decision')}</th>
                  <th scope="col" className={TH}>{tc('fields.notes')}</th>
                  <th scope="col" className={TH} />
                </tr>
              </thead>

              <tbody>
                {visible.map((row) => {
                  const typeTone = toneFor(INFLUENCER_TYPES, row.type);
                  // Up to two initials, falling back to "?" — never an image.
                  const initials =
                    row.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
                  const countryLabel = countryName(row.country);

                  return (
                    <tr
                      key={row.id}
                      className="group/row border-b border-black/[0.04] align-middle transition-colors duration-150 last:border-b-0 hover:bg-black/[0.015]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold',
                              TONE_CLASSES[typeTone],
                            )}
                          >
                            {initials}
                          </span>
                          <div className="flex min-w-0 flex-col">
                            <span dir="auto" className="truncate text-[13px] font-semibold tracking-[-0.008em] text-black/85">
                              {row.name}
                            </span>
                            {row.url && (
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex w-fit max-w-[220px] items-center gap-1 truncate text-[11.5px] text-black/40 transition-colors duration-150 hover:text-[#6ea4e7]"
                              >
                                <span dir="ltr" className="truncate">{row.url.replace(/^https?:\/\//, '')}</span>
                                <ExternalLink size={10} strokeWidth={2} className="shrink-0" />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-[13px] font-medium tabular-nums text-black/70">
                        {/* "124K", "1.2M" — a Latin token, never reordered by the page. */}
                        <span dir="ltr">{row.followers_count || '—'}</span>
                      </td>

                      <td className="px-4 py-3">
                        {row.type ? (
                          <span
                            className={cn(
                              'inline-flex h-[22px] w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium',
                              TONE_CLASSES[typeTone],
                            )}
                          >
                            <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONE_DOTS[typeTone])} />
                            {t(`influencerType.${row.type}`, { defaultValue: row.type })}
                          </span>
                        ) : DASH}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-black/60">
                        {countryLabel || DASH}
                      </td>

                      <td className="px-4 py-3">
                        {row.email_contact ? (
                          <a
                            href={
                              row.email_contact.includes('@')
                                ? `mailto:${row.email_contact}`
                                : `tel:${row.email_contact.replace(/\s/g, '')}`
                            }
                            className="inline-flex max-w-[180px] items-center gap-1.5 truncate text-[12.5px] text-black/60 transition-colors hover:text-[#6ea4e7]"
                          >
                            <Mail size={12} strokeWidth={1.75} className="shrink-0 text-black/30" />
                            {/* An e-mail or a phone number: both break if mirrored. */}
                            <span dir="ltr" className="truncate">{row.email_contact}</span>
                          </a>
                        ) : DASH}
                      </td>

                      <td className="px-4 py-3">
                        <StatusSelect
                          value={row.messaging_status}
                          options={MESSAGING_STATUSES}
                          placeholder={t('influencers.notSet')}
                          ariaLabel={t('influencers.messagingAria', { name: row.name })}
                          labelKey="messagingStatus"
                          onSelect={(next) => saveStatus(row.id, 'messaging_status', next)}
                        />
                      </td>

                      <td className="px-4 py-3">
                        <StatusSelect
                          value={row.final_decision}
                          options={FINAL_DECISIONS}
                          placeholder={t('influencers.notSet')}
                          ariaLabel={t('influencers.decisionAria', { name: row.name })}
                          labelKey="finalDecision"
                          onSelect={(next) => saveStatus(row.id, 'final_decision', next)}
                        />
                      </td>

                      <td className="min-w-[200px] max-w-[280px] px-4 py-3">
                        {row.notes ? (
                          <p dir="auto" className="line-clamp-2 text-[12.5px] leading-relaxed text-black/50">{row.notes}</p>
                        ) : DASH}
                      </td>

                      <td className="px-3 py-3">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('influencers.editAria', { name: row.name })}
                          onClick={() => { setEditing(row); setSheetOpen(true); }}
                          className="opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/row:opacity-100"
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InfluencerFormSheet
        open={sheetOpen}
        onClose={() => { setSheetOpen(false); setEditing(null); }}
        influencer={editing}
      />
    </div>
  );
}

// ─── Filter select ────────────────────────────────────────────────────────────

function FilterSelect({
  value, onChange, options, allLabel, ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
  ariaLabel: string;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={(v: string | null) => onChange(v ?? ANY)}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className="h-9 max-w-[168px] rounded-lg text-[12.5px]">
        <span className={cn('truncate', value === ANY ? 'text-black/45' : 'text-foreground')}>
          {selected?.label ?? allLabel}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY} className="text-black/45">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
