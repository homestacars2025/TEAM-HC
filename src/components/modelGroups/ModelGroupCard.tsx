import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import StatusArt from '../cars/StatusArt';
import { utilTone } from '../../lib/fleetCalendar';
import {
  bestTier,
  discounted,
  displayName,
  listPriceTry,
  rateTone,
  type ModelGroupRow,
  type ModelGroupStats,
  type PricingTier,
} from '../../lib/modelGroups';
import { SpecIcon3D, type SpecIconName } from './SpecIcon3D';

export const CATEGORY_TONES: Record<string, { ink: string; dot: string }> = {
  Economy: { ink: '#166534', dot: '#22C55E' },
  Middle: { ink: '#1E4E8C', dot: '#4BA6EA' },
  Luxury: { ink: '#4C1D95', dot: '#8B5CF6' },
  SUV: { ink: '#92400E', dot: '#F59E0B' },
  Van: { ink: '#155E75', dot: '#06B6D4' },
  Electric: { ink: '#065F46', dot: '#10B981' },
};

export const categoryTone = (category: string | null) => CATEGORY_TONES[category ?? ''] ?? { ink: '#374151', dot: '#9CA3AF' };

/** Whole lira, as prices are quoted. */
export const lira = (amount: number) => `₺${Math.round(amount).toLocaleString('tr-TR')}`;
export const usd = (amount: number) => `$${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const number = (amount: number) => amount.toLocaleString('tr-TR');
/** Names typed with a stray double space still count as the same name. */
const squash = (text: string) => text.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');

/** A stored English value in the reader's language, or as stored when it isn't one we know. */
export function useSpecLabel() {
  const { t } = useTranslation('modelGroups');
  return (kind: 'category' | 'transmission' | 'fuel', value: string) => t(`${kind}.${value}`, { defaultValue: value });
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/**
 * The group's photo, or the 3D fleet on a soft studio backdrop when there's none or it
 * won't load. The photos are tall with the car a little below the middle, so the photo
 * fills the 16:9 frame and is cropped to the car.
 */
export const GroupImage: React.FC<{ src: string | null; alt: string; className?: string; compact?: boolean; children?: React.ReactNode }> = ({ src, alt, className, compact = false, children }) => {
  const { t } = useTranslation('modelGroups');
  const [failed, setFailed] = useState<string | null>(null);
  const usable = src && src !== failed;
  return (
    <div className={`relative aspect-video overflow-hidden rounded-[14px] bg-[linear-gradient(160deg,#F7F9FC_0%,#EAF0F7_100%)] ${className ?? ''}`}>
      {usable ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(src)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.03]"
          style={{ objectPosition: '50% 70%' }}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <div aria-hidden="true" className="absolute inset-x-[22%] bottom-[16%] h-[9%] rounded-[50%] bg-[#0F172A]/[0.06] blur-md" />
          <StatusArt name="total" className={`relative h-auto opacity-90 ${compact ? 'w-[70%]' : 'w-[46%] max-w-[180px]'}`} />
          {!compact && <span className="relative text-[12px] font-medium text-black/40">{t('card.noPhoto')}</span>}
        </div>
      )}
      {children}
    </div>
  );
};

export const SpecChip: React.FC<{ icon: SpecIconName; label: string }> = ({ icon, label }) => (
  <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white pe-2.5 ps-1.5 text-[12.5px] font-medium text-black/70">
    <SpecIcon3D name={icon} size={20} />
    {label}
  </span>
);

export function useSpecChips() {
  const { t } = useTranslation('modelGroups');
  const label = useSpecLabel();
  return (group: ModelGroupRow): Array<{ icon: SpecIconName; label: string }> => [
    group.transmission ? { icon: 'transmission' as const, label: label('transmission', group.transmission) } : null,
    group.fuel ? { icon: 'fuel' as const, label: label('fuel', group.fuel) } : null,
    group.seats !== null ? { icon: 'seats' as const, label: t('spec.seats', { count: group.seats }) } : null,
    group.luggage !== null ? { icon: 'luggage' as const, label: t('spec.bags', { count: group.luggage }) } : null,
  ].filter((chip): chip is { icon: SpecIconName; label: string } => chip !== null);
}

const STROKE = 5;

/** The month's utilization as a ring, in the calendar's colours: green from 80%, amber from 50%, red below. */
export const GroupUtilizationRing: React.FC<{ rate: number | null; size?: number }> = ({ rate, size = 52 }) => {
  const { t } = useTranslation('modelGroups');
  if (rate === null) {
    return <span role="img" aria-label={t('card.noUtilization')} className="grid shrink-0 place-items-center rounded-full border-[5px] border-black/[0.06] text-[12px] font-semibold text-black/30" style={{ width: size, height: size }}>—</span>;
  }
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.min(100, Math.max(0, rate));
  return (
    <span role="img" aria-label={t('card.utilization', { pct: `${rate}%` })} className={`hc-ut-${utilTone(rate)} relative grid shrink-0 place-items-center`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--st-to)" strokeWidth={STROKE} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--st-chip)" strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - shown / 100)} />
      </svg>
      <span dir="ltr" className="hc-num relative text-[12.5px] font-semibold tabular-nums" style={{ color: 'var(--st-ink)' }}>{rate}%</span>
    </span>
  );
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[11.5px] text-black/45">{label}</dt>
    <dd className="mt-0.5 truncate text-[13px] font-medium tabular-nums text-foreground">{children}</dd>
  </div>
);

const Pencil: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Card ─────────────────────────────────────────────────────────────────────

export const ModelGroupCard: React.FC<{
  group: ModelGroupRow;
  stats: ModelGroupStats | undefined;
  /** False while the month's figures load. */
  statsReady: boolean;
  tiers: PricingTier[];
  usdRate: number | null;
  monthLabel: string;
  /** Accounting's figure: hidden for staff without the Accounting page. */
  showRealRate: boolean;
  /** Null when this person can't edit, so there's no Edit button. */
  onEdit: (() => void) | null;
  onViewCars: () => void;
}> = ({ group, stats, statsReady, tiers, usdRate, monthLabel, showRealRate, onEdit, onViewCars }) => {
  const { t } = useTranslation('modelGroups');
  const specLabel = useSpecLabel();
  const chipsOf = useSpecChips();
  const name = displayName(group);
  const tone = categoryTone(group.category);
  const listTry = listPriceTry(group.price, usdRate);
  const tier = bestTier(tiers);
  const chips = chipsOf(group);
  const kmLimit = [
    group.daily_km !== null ? t('card.kmDay', { km: number(group.daily_km) }) : null,
    group.monthly_km !== null ? t('card.kmMonth', { km: number(group.monthly_km) }) : null,
  ].filter((part): part is string => part !== null);
  const real = stats?.avg_daily_rate ?? null;
  const realTone = rateTone(real, listTry);

  return (
    <article aria-label={name} className="surface-depth group/card flex min-w-0 flex-col rounded-[20px] border border-[var(--border-subtle)] bg-white p-3 transition-shadow duration-200 hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)]">
      <GroupImage src={group.image_url} alt={name}>
        {group.category && (
          <span className="absolute start-2.5 top-2.5 inline-flex h-7 items-center gap-1.5 rounded-full bg-white/90 px-2.5 text-[12px] font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.08)] backdrop-blur" style={{ color: tone.ink }}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: tone.dot }} />
            {specLabel('category', group.category)}
          </span>
        )}
      </GroupImage>

      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 dir="auto" className="truncate text-[16px] font-semibold tracking-[-0.015em] text-foreground sm:text-[17px]">{name}</h2>
            {squash(group.name) !== squash(name) && <p dir="auto" className="truncate text-[12.5px] text-black/45">{group.name}</p>}
          </div>
          <div className="shrink-0 text-end">
            <div className="text-[16px] font-semibold tracking-[-0.01em] text-foreground sm:text-[17px]">
              <bdi className="hc-num tabular-nums">{listTry !== null ? lira(listTry) : group.price !== null ? usd(group.price) : '—'}</bdi>
              <span className="text-[12px] font-normal text-black/45">{t('card.perDay')}</span>
            </div>
            {group.price !== null && listTry !== null && <div className="text-[11.5px] text-black/40">{t('card.list', { price: `⁦${usd(group.price)}⁩` })}</div>}
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => <SpecChip key={chip.icon} icon={chip.icon} label={chip.label} />)}
          </div>
        )}

        <dl className="mt-3.5 grid grid-cols-3 gap-3 border-t border-black/[0.06] pt-3">
          <Fact label={t('card.deposit')}><bdi className="hc-num">{group.deposit !== null ? lira(group.deposit) : '—'}</bdi></Fact>
          <Fact label={t('card.minAge')}>{group.min_age !== null ? <bdi className="hc-num">{t('card.minAgeValue', { age: group.min_age })}</bdi> : '—'}</Fact>
          <Fact label={t('card.kmLimit')}>{kmLimit.length ? kmLimit.map((part) => <span key={part} className="block truncate">{part}</span>) : t('card.unlimited')}</Fact>
        </dl>
        {tier && listTry !== null && (
          <p className="mt-2 text-[12px] text-black/50">
            {t('card.tier', { price: `⁦${lira(discounted(listTry, tier.discount_percent))}⁩`, days: tier.min_days })}
            <span className="text-black/35"> · <bdi>{t('card.tierOff', { pct: tier.discount_percent })}</bdi></span>
          </p>
        )}

        <section aria-label={t('card.performance', { month: monthLabel })} className="mt-3.5 flex items-center gap-3 rounded-[14px] bg-[#F6F8FB] p-3">
          {statsReady ? <GroupUtilizationRing rate={stats?.utilization ?? null} /> : <span className="h-[52px] w-[52px] shrink-0 animate-pulse rounded-full bg-black/[0.06]" />}
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5">
            <div className="col-span-2 flex items-center gap-1.5 text-[13px] text-foreground">
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${stats && stats.rented_now > 0 ? 'bg-[#22C55E]' : 'bg-black/20'}`} />
              <span className="truncate">
                <bdi dir="ltr" className="hc-num font-semibold tabular-nums">{stats ? `${stats.rented_now} / ${stats.cars_active}` : '— / —'}</bdi> {t('card.onRoad')}
              </span>
            </div>
            <div className={`min-w-0 ${showRealRate ? '' : 'col-span-2'}`}>
              <div className="text-[11.5px] text-black/45">{t('card.bookings')}</div>
              <div className="hc-num text-[13px] font-semibold tabular-nums text-foreground">{statsReady ? number(stats?.bookings_month ?? 0) : '…'}</div>
            </div>
            {showRealRate && (
              <div className="min-w-0">
                <div className="text-[11.5px] text-black/45">{t('card.realRate')}</div>
                <div
                  className={`hc-num truncate text-[13px] font-semibold tabular-nums ${realTone === 'above' ? 'text-[#15803D]' : realTone === 'below' ? 'text-[#B45309]' : 'text-foreground'}`}
                  title={realTone === 'none' ? undefined : realTone === 'above' ? t('card.rateAbove') : t('card.rateBelow')}
                >
                  <bdi>{!statsReady ? '…' : real !== null ? lira(real) : '—'}</bdi>
                  {statsReady && realTone !== 'none' && <span className="sr-only"> ({realTone === 'above' ? t('card.rateAbove') : t('card.rateBelow')})</span>}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className={`mt-3 grid gap-2 ${onEdit ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {onEdit && (
            <Button variant="secondary" className="hc-mg-action" onClick={onEdit}>
              <Pencil /> {t('card.edit')}
            </Button>
          )}
          <Button variant="secondary" className="hc-mg-action" onClick={onViewCars} aria-label={`${t('card.viewCars')} · ${name}`}>
            {t('card.viewCars')}{stats ? <span className="hc-num tabular-nums text-black/45"> · {stats.cars_total}</span> : null}
          </Button>
        </div>
      </div>
    </article>
  );
};

export const ModelGroupCardSkeleton: React.FC = () => (
  <div aria-hidden="true" className="flex flex-col rounded-[20px] border border-[var(--border-subtle)] bg-white p-3">
    <div className="aspect-video animate-pulse rounded-[14px] bg-black/[0.05]" />
    <div className="space-y-3 px-1.5 pb-1 pt-4">
      <div className="h-4 w-2/3 animate-pulse rounded bg-black/[0.06]" />
      <div className="flex gap-1.5">{[64, 56, 60, 56].map((width, index) => <div key={index} className="h-8 animate-pulse rounded-full bg-black/[0.05]" style={{ width }} />)}</div>
      <div className="h-[76px] animate-pulse rounded-[14px] bg-black/[0.04]" />
    </div>
  </div>
);
