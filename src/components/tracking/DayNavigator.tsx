import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { addDays, HISTORY_START } from '../../lib/tracking';

const Chevron: React.FC<{ back?: boolean }> = ({ back }) => (
  <svg className="hc-trk-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={back ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DAYS_FROM_MONDAY = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

const shiftMonth = (month: string, by: number) => {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
};

const DayCalendar: React.FC<{ value: string; today: string; onPick: (day: string) => void }> = ({ value, today, onPick }) => {
  const { t } = useTranslation('tracking');
  const locale = useDateLocale();
  const [month, setMonth] = useState(value.slice(0, 7));

  const first = `${month}-01`;
  const length = new Date(`${shiftMonth(month, 1)}-01T12:00:00Z`).getTime() - new Date(`${first}T12:00:00Z`).getTime();
  const days = Array.from({ length: Math.round(length / 86_400_000) }, (_, index) => addDays(first, index));
  // Any Monday: only the names of the week come from it.
  const weekdays = Array.from({ length: 7 }, (_, index) => new Date(`${addDays('2026-11-02', index)}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'narrow', timeZone: 'UTC' }));

  return (
    <div role="dialog" aria-label={t('day.pick')} className="hc-trk-calendar surface-depth surface-float">
      <div className="hc-trk-calendar-head">
        <button type="button" aria-label={t('day.previousMonth')} disabled={month <= HISTORY_START.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, -1))}><Chevron back /></button>
        <strong>{new Date(`${first}T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong>
        <button type="button" aria-label={t('day.nextMonth')} disabled={month >= today.slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><Chevron /></button>
      </div>
      <div className="hc-trk-calendar-grid">
        {weekdays.map((name, index) => <span key={index} aria-hidden="true">{name}</span>)}
        {days.map((day, index) => (
          <button
            key={day}
            type="button"
            style={index === 0 ? { gridColumnStart: DAYS_FROM_MONDAY(day) + 1 } : undefined}
            disabled={day > today || day < HISTORY_START}
            aria-pressed={day === value}
            aria-label={formatDay(day, locale)}
            className={day === today ? 'is-today' : undefined}
            onClick={() => onPick(day)}
          >
            {Number(day.slice(8))}
          </button>
        ))}
      </div>
    </div>
  );
};

/** ← the day → with a calendar on the day itself. Sticks under the top bar on a phone. */
const DayNavigator: React.FC<{ day: string; today: string; onChange: (day: string) => void }> = ({ day, today, onChange }) => {
  const { t } = useTranslation('tracking');
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

  const date = formatDay(day, locale);
  const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'long', timeZone: 'UTC' });

  return (
    <div className="hc-trk-daybar">
      <div ref={root} className="hc-trk-daynav surface-depth">
        <button type="button" aria-label={t('day.previous')} disabled={day < HISTORY_START} onClick={() => onChange(addDays(day, -1))}><Chevron back /></button>
        <button ref={toggle} type="button" className="hc-trk-dayname" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(current => !current)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          <span>{day === today ? t('day.today', { date }) : t('day.past', { weekday, date })}</span>
        </button>
        <button type="button" aria-label={t('day.next')} disabled={day >= today} onClick={() => onChange(addDays(day, 1))}><Chevron /></button>
        {open && <DayCalendar value={day} today={today} onPick={next => { setOpen(false); onChange(next); }} />}
      </div>
    </div>
  );
};

export default DayNavigator;
