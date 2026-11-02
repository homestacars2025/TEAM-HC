import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../hooks/useDateLocale';
import DateRangePicker from './booking/DateRangePicker';

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

/**
 * The shared calendar is too big to sit in a filter row, so it opens from a button. It
 * hangs off the nearest positioned ancestor, which should be the whole row.
 */
const DateRangeFilter: React.FC<DateRangeFilterProps> = ({ from, to, onChange }) => {
  const { t } = useTranslation('common');
  const locale = useDateLocale();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = !from ? t('dateFilter.all') : to && to !== from ? `${formatDay(from, locale)} – ${formatDay(to, locale)}` : formatDay(from, locale);

  return (
    <div ref={root} className="hc-date-filter">
      <button ref={toggle} type="button" aria-expanded={open} aria-haspopup="dialog" className="hc-date-filter-open" onClick={() => setOpen(current => !current)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <span>{label}</span>
      </button>
      {open && (
        <div role="dialog" aria-label={t('dateFilter.dates')} className="hc-date-filter-pop surface-depth surface-float">
          <DateRangePicker
            label={t('dateFilter.dates')}
            locale={locale}
            start={from}
            end={to}
            onChange={(start, end) => {
              onChange(start, end);
              if (end) setOpen(false);
            }}
          />
          {from && <button type="button" className="hc-date-filter-clear" onClick={() => { onChange('', ''); setOpen(false); toggle.current?.focus(); }}>{t('dateFilter.clear')}</button>}
        </div>
      )}
    </div>
  );
};

export default DateRangeFilter;
