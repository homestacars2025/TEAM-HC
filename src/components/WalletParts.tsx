import React from 'react';
import { isPdfUrl } from '../pages/AccountingPage';

/** What My wallet and My custody have in common, so the two pages stay one design. */

export type Period = 'month' | 'all';

export const selectClass =
  'h-11 min-w-0 cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-sm text-[#0f1117] outline-none focus:border-[var(--accent)] sm:h-10';

export type TileTone = 'balance' | 'received' | 'spent' | 'paid' | 'negative';

const TILE_ICONS: Record<TileTone, React.ReactNode> = {
  balance: <><rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M16 12.5h2M3 10h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>,
  received: <path d="M12 4v13M6.5 11.5L12 17l5.5-5.5M5 20h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  spent: <path d="M12 20V7M6.5 12.5L12 7l5.5 5.5M5 4h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  paid: <path d="M12 20V7M6.5 12.5L12 7l5.5 5.5M5 4h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  negative: <path d="M12 7.5v6M12 17h.01M10.3 3.9L2.6 17.2A2 2 0 004.3 20h15.4a2 2 0 001.7-2.8L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
};

interface StatTileProps {
  tone: TileTone;
  label: string;
  /** `null` while loading. */
  value: string | null;
  sub: string;
}

/** The first tile in `.hc-tiles` becomes the wide one on a phone. */
export const StatTile: React.FC<StatTileProps> = ({ tone, label, value, sub }) => (
  <div className={`hc-tile hc-tile-${tone} surface-depth`}>
    <div className="hc-tile-head">
      <span aria-hidden="true" className="hc-tile-icon">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">{TILE_ICONS[tone]}</svg>
      </span>
      <div className="hc-tile-label">{label}</div>
    </div>
    <div className="hc-tile-bottom">
      <div className="hc-tile-value" style={{ '--chars': (value ?? '—').length } as React.CSSProperties}>
        <bdi dir="ltr">{value ?? '—'}</bdi>
      </div>
      <div className="hc-tile-sub">{sub}</div>
    </div>
  </div>
);

export const PeriodToggle: React.FC<{
  value: Period;
  onChange: (next: Period) => void;
  monthLabel: string;
  allLabel: string;
}> = ({ value, onChange, monthLabel, allLabel }) => (
  <div role="group" className="inline-flex rounded-xl border border-[var(--border-subtle)] p-1">
    {([['month', monthLabel], ['all', allLabel]] as [Period, string][]).map(([option, label]) => (
      <button
        key={option}
        type="button"
        aria-pressed={value === option}
        onClick={() => onChange(option)}
        className={`min-h-9 cursor-pointer rounded-lg px-4 text-[13px] font-semibold transition-colors ${value === option ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-gray-500 hover:text-gray-700'}`}
      >
        {label}
      </button>
    ))}
  </div>
);

export const ReceiptThumb: React.FC<{ url: string | null; label: string; onOpen: (url: string) => void }> = ({ url, label, onOpen }) => {
  if (!url) return <span className="text-gray-300">—</span>;

  const frame = 'flex size-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] no-underline sm:size-10';

  // A PDF has no image to enlarge, so it opens in the browser's own viewer.
  if (isPdfUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={label} aria-label={label} className={`${frame} text-[10px] font-bold text-gray-500`}>{'PDF'}</a>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(url)} title={label} aria-label={label} className={frame}>
      <img src={url} alt="" loading="lazy" className="size-full object-cover" />
    </button>
  );
};
