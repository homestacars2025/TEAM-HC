import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { addDay, monthGrid, nextRange, rentalDays } from '../../lib/bookingDates';
import { istanbulDate } from '../../lib/istanbulTime';

interface DateRangePickerProps {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  locale: string;
  /** A range whose start is a given, like an extension: only the end can be picked. */
  fixedStart?: boolean;
  /** Days before this can't be chosen. */
  min?: string;
  /** This day and everything after can't be chosen. */
  blockedFrom?: string | null;
  label: string;
}

const iso = (year: number, month: number, day = 1) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);

const DateRangePicker: React.FC<DateRangePickerProps> = ({ start, end, onChange, locale, fixedStart = false, min, blockedFrom, label }) => {
  const { t } = useTranslation('bookings');
  const twoMonths = useMediaQuery('(min-width: 640px)');
  const gridRef = useRef<HTMLDivElement>(null);
  const initial = (end || start || istanbulDate()).split('-').map(Number);
  const [view, setView] = useState({ year: initial[0], month: initial[1] - 1 });
  const [hover, setHover] = useState('');
  const [focusDay, setFocusDay] = useState(end || start || istanbulDate());

  const months = useMemo(() => {
    const list = [view];
    if (twoMonths) list.push(view.month === 11 ? { year: view.year + 1, month: 0 } : { year: view.year, month: view.month + 1 });
    return list;
  }, [view, twoMonths]);

  const weekdays = useMemo(() => Array.from({ length: 7 }, (_, index) =>
    new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(locale, { weekday: locale.startsWith('ar') ? 'narrow' : 'short', timeZone: 'UTC' })), [locale]);

  const shift = (by: number) => setView(v => {
    const date = new Date(Date.UTC(v.year, v.month + by, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
  });

  // A month paged to by hand may not hold the remembered day, and the grid still needs one stop.
  const shown = months.some(m => focusDay.startsWith(iso(m.year, m.month).slice(0, 7)));
  const rovingDay = shown ? focusDay : iso(view.year, view.month);

  const blocked = (day: string) => (!!min && day < min) || (!!blockedFrom && day >= blockedFrom);

  const choose = (day: string) => {
    if (blocked(day)) return;
    if (fixedStart) onChange(start, day);
    else {
      const next = nextRange(start, end, day);
      onChange(next.start, next.end);
    }
    setFocusDay(day);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
    const steps: Record<string, number> = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowUp: -7, ArrowDown: 7 };
    if (!(e.key in steps)) return;
    e.preventDefault();
    const next = addDay(rovingDay, steps[e.key]);
    setFocusDay(next);
    const [year, month] = next.split('-').map(Number);
    if (!months.some(m => m.year === year && m.month === month - 1)) setView({ year, month: month - 1 });
    window.requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${next}"]`)?.focus());
  };

  const previewEnd = !end && start && hover > start ? hover : end;
  const days = start && end ? rentalDays(start, end) : 0;
  const describe = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <div className="hc-range" role="group" aria-label={label}>
      <div className="hc-range-months" ref={gridRef} onKeyDown={onKeyDown}>
        {months.map((month, monthIndex) => (
          <div key={`${month.year}-${month.month}`} className="min-w-0">
            <div className="hc-range-head">
              {monthIndex === 0 ? (
                <button type="button" onClick={() => shift(-1)} aria-label={t('range.previous')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ) : <span />}
              <div aria-live="polite" className="text-[13.5px] font-semibold text-[#0f1117]">
                {new Date(`${iso(month.year, month.month)}T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })}
              </div>
              {monthIndex === months.length - 1 ? (
                <button type="button" onClick={() => shift(1)} aria-label={t('range.next')}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              ) : <span />}
            </div>
            <div className="hc-range-grid" role="grid" aria-label={label}>
              {weekdays.map((day, index) => <div key={index} role="columnheader" className="hc-range-dow">{day}</div>)}
              {monthGrid(month.year, month.month).map(cell => {
                if (!cell.inMonth) return <span key={cell.iso} aria-hidden="true" />;
                const off = blocked(cell.iso);
                const taken = !!blockedFrom && cell.iso >= blockedFrom;
                const isEnd = cell.iso === start || cell.iso === end;
                const within = !!start && !!previewEnd && cell.iso > start && cell.iso < previewEnd;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    data-day={cell.iso}
                    aria-selected={isEnd}
                    aria-disabled={off}
                    tabIndex={cell.iso === rovingDay ? 0 : -1}
                    aria-label={new Date(`${cell.iso}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: 'full', timeZone: 'UTC' })}
                    onClick={() => choose(cell.iso)}
                    onMouseEnter={() => setHover(cell.iso)}
                    className={`hc-range-day ${isEnd ? 'is-end' : ''} ${within ? 'is-within' : ''} ${off ? 'is-off' : ''} ${taken ? 'is-taken' : ''} ${cell.iso === istanbulDate() ? 'is-today' : ''}`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div aria-live="polite" className="hc-range-foot">
        {days > 0 ? (
          <>
            <span className="hc-range-count">{t('range.days', { count: days })}</span>
            <span>{t('range.span', { start: describe(start), end: describe(end) })}</span>
          </>
        ) : <span>{t(start ? 'range.pickEnd' : 'range.pickStart')}</span>}
      </div>
    </div>
  );
};

export default DateRangePicker;
