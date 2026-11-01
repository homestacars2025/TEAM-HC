import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { formatPlate } from '../../lib/custodyExpense';
import { HIGH_DAY_KM, type DayEntry } from '../../lib/tracking';
import { useKm } from './parts';

/** The busiest cars of a day, highest first. A bar opens that car's history. */
export const DayChart: React.FC<{ entries: DayEntry[]; onOpen: (entry: DayEntry) => void }> = ({ entries, onOpen }) => {
  const { t } = useTranslation('tracking');
  const km = useKm();
  const max = Math.max(...entries.map(entry => entry.km), 1);
  const limit = max > HIGH_DAY_KM ? HIGH_DAY_KM / max : null;

  return (
    <div className="hc-trk-chart" tabIndex={0} role="group" aria-label={t('chart.title')}>
      <ol style={{ '--bars': entries.length } as React.CSSProperties}>
        {limit !== null && <li aria-hidden="true" className="hc-trk-limit" style={{ '--share': limit } as React.CSSProperties}><span>{t('chart.limit')}</span></li>}
        {entries.map(entry => (
          <li key={entry.car_id ?? entry.plate}>
            <button type="button" onClick={() => onOpen(entry)} aria-label={t('list.open', { plate: entry.plate, km: km(entry.km) })} className={entry.km > HIGH_DAY_KM ? 'is-high' : undefined}>
              <span className="hc-trk-bar-value">{km(entry.km)}</span>
              <span className="hc-trk-bar" style={{ '--share': entry.km / max } as React.CSSProperties} />
              <span className="hc-trk-bar-plate" dir="ltr">{formatPlate(entry.plate)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
};

/** Thirty days of one car. Each bar is also a row of the table below it. */
export const HistoryChart: React.FC<{ days: string[]; km: Map<string, number> }> = ({ days, km }) => {
  const { t } = useTranslation('tracking');
  const locale = useDateLocale();
  const format = useKm();
  const max = Math.max(...Array.from(km.values()), 1);

  return (
    <div className="hc-trk-history" role="img" aria-label={t('sheet.chart', { count: days.length })}>
      <div className="hc-trk-history-bars">
        {days.map(day => {
          const value = km.get(day);
          const title = `${formatDay(day, locale)}: ${value === undefined ? '—' : `${format(value)} ${t('km')}`}`;
          return (
            <span key={day} title={title}>
              <i className={value === undefined ? 'is-missing' : value > HIGH_DAY_KM ? 'is-high' : undefined} style={{ '--share': (value ?? 0) / max } as React.CSSProperties} />
            </span>
          );
        })}
      </div>
      <div className="hc-trk-history-axis" aria-hidden="true">
        <span>{formatDay(days[0], locale)}</span>
        <span>{formatDay(days[days.length - 1], locale)}</span>
      </div>
    </div>
  );
};

/** Seven days at a glance, the last being the day on screen. */
export const Sparkline: React.FC<{ days: string[]; km: Map<string, number> | undefined }> = ({ days, km }) => {
  const max = Math.max(...Array.from(km?.values() ?? []), 1);
  return (
    <span className="hc-trk-spark" aria-hidden="true">
      {days.map(day => {
        const value = km?.get(day);
        return <i key={day} className={value === undefined ? 'is-missing' : value > HIGH_DAY_KM ? 'is-high' : undefined} style={{ '--share': (value ?? 0) / max } as React.CSSProperties} />;
      })}
    </span>
  );
};
