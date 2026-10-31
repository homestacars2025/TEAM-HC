import React from 'react';
import { isPdfUrl } from '../pages/AccountingPage';

/** What My wallet and My custody have in common, so the two pages stay one design. */

export type Period = 'month' | 'all';

export const selectClass =
  'h-11 min-w-0 cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-sm text-[#0f1117] outline-none focus:border-[var(--accent)] sm:h-10';

export const SummaryCard: React.FC<{ label: string; value: React.ReactNode; hint?: string; valueClass?: string }> = ({ label, value, hint, valueClass }) => (
  <div className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
    <div className="text-[13px] font-medium text-gray-600">{label}</div>
    <div className={`mt-2 truncate text-[26px] font-semibold leading-tight sm:text-[28px] ${valueClass ?? 'text-[#0f1117]'}`}>{value}</div>
    {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
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
