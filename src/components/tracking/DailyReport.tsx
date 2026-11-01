import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { useTileFilter } from '../../hooks/useTileFilter';
import { getDailyKm } from '../../lib/queries/tracking';
import {
  addDays, DAY_FILTERS, dayStats, daysEnding, endOfDay, HIGH_DAY_KM, HISTORY_START, inDayFilter, matchesSearch, todayEntry,
  type DailyKmRow, type DayEntry, type TrackedCar,
} from '../../lib/tracking';
import Button from '../Button';
import PlateChip from '../booking/PlateChip';
import { ComplianceTriangle } from '../cars/Compliance';
import StatusArt from '../cars/StatusArt';
import { StatTile } from '../WalletParts';
import CarHistorySheet from './CarHistorySheet';
import DayNavigator from './DayNavigator';
import { DayChart, Sparkline } from './KmCharts';
import { SignalAge, TRACK_ICONS, useKm } from './parts';

const SPARK_DAYS = 7;

interface DailyReportProps {
  cars: TrackedCar[];
  models: Map<number, string>;
  fleetLoading: boolean;
  now: number;
  day: string;
  today: string;
  onDay: (day: string) => void;
}

const DailyReport: React.FC<DailyReportProps> = ({ cars, models, fleetLoading, now, day, today, onDay }) => {
  const { t } = useTranslation('tracking');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const km = useKm();
  const [filter, setFilter] = useTileFilter(DAY_FILTERS);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<DailyKmRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<DayEntry | null>(null);

  const isToday = day === today;

  // One query for the day and the sparklines. Today's own figures are the live ones.
  useEffect(() => {
    let cancelled = false;
    setRowsLoading(true);
    setFailed(false);
    getDailyKm(addDays(day, 1 - SPARK_DAYS), isToday ? addDays(day, -1) : day)
      .then(next => { if (!cancelled) setRows(next); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setRowsLoading(false); });
    return () => { cancelled = true; };
  }, [day, isToday, attempt]);

  const entries = useMemo<DayEntry[]>(() => {
    const all = isToday
      ? cars.map(todayEntry)
      : rows.filter(row => row.day === day).map(row => ({
        car_id: row.car_id,
        plate: row.plate_number ?? '—',
        model: models.get(row.car_id) ?? null,
        start_km: row.start_km,
        end_km: row.end_km,
        km: row.km,
        last_signal_at: row.last_signal_at,
      }));
    return all.sort((a, b) => b.km - a.km || a.plate.localeCompare(b.plate, 'tr'));
  }, [isToday, cars, rows, day, models]);

  const sparkDays = useMemo(() => daysEnding(day, SPARK_DAYS), [day]);
  const sparks = useMemo(() => {
    const series = new Map<number, Map<string, number>>();
    const add = (carId: number, date: string, value: number) => {
      if (!series.has(carId)) series.set(carId, new Map());
      series.get(carId)?.set(date, value);
    };
    rows.forEach(row => add(row.car_id, row.day, row.km));
    if (isToday) entries.forEach(entry => { if (entry.car_id !== null) add(entry.car_id, day, entry.km); });
    return series;
  }, [rows, entries, isToday, day]);

  // A past day is judged at its own end, so its "no signal" count never changes later.
  const at = isToday ? now : endOfDay(day);
  const loading = isToday ? fleetLoading : rowsLoading;
  const stats = useMemo(() => dayStats(entries, at), [entries, at]);
  const shown = useMemo(
    () => entries.filter(entry => inDayFilter(entry, filter, at) && matchesSearch(entry, search)),
    [entries, filter, at, search],
  );
  const bars = useMemo(() => shown.filter(entry => entry.km > 0), [shown]);

  const figure = (value: string) => (loading ? null : value);
  const carsSub = (count: number) => t('tiles.cars', { count });
  const noRecord = !loading && !isToday && !failed && entries.length === 0;

  return (
    <>
      <DayNavigator day={day} today={today} onChange={onDay} />

      {failed && !isToday && (
        <div role="alert" className="hc-form-error mb-4 flex flex-wrap items-center justify-between gap-2">
          {t('loadFailed')}
          <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      {noRecord ? (
        <div className="hc-trk-empty surface-depth">
          <StatusArt name="total" className="hc-trk-empty-art" />
          <h2>{day < HISTORY_START ? t('empty.title', { date: formatDay(HISTORY_START, locale) }) : t('empty.missingTitle')}</h2>
          <p>{day < HISTORY_START ? t('empty.body') : t('empty.missingBody')}</p>
          <Button variant="secondary" onClick={() => onDay(today)}>{t('day.backToToday')}</Button>
        </div>
      ) : !failed || isToday ? (
        <>
          <div className="hc-tiles hc-tiles-filter">
            <StatTile tone="balance" icon={TRACK_ICONS.distance} label={t('tiles.totalKm')} value={figure(km(stats.all.km))} sub={carsSub(stats.all.count)} pressed={filter === 'all'} onPress={() => setFilter('all')} />
            <StatTile tone="received" icon={TRACK_ICONS.moved} label={t('tiles.moved')} value={figure(km(stats.moved.count))} sub={t('tiles.kmSub', { km: km(stats.moved.km) })} pressed={filter === 'moved'} onPress={() => setFilter('moved')} />
            <StatTile tone="paid" icon={TRACK_ICONS.idle} label={t('tiles.idle')} value={figure(km(stats.idle.count))} sub={t('tiles.idleSub')} pressed={filter === 'idle'} onPress={() => setFilter('idle')} />
            <StatTile tone="warn" art={<ComplianceTriangle severity="missing" size={40} className="hc-tile-art" />} label={t('tiles.noSignal')} value={figure(km(stats.noSignal.count))} sub={t('tiles.over24h')} pressed={filter === 'noSignal'} onPress={() => setFilter('noSignal')} />
            <StatTile tone="negative" art={<ComplianceTriangle severity="expired" size={40} className="hc-tile-art" />} label={t('tiles.over500')} value={figure(km(stats.over500.count))} sub={t('tiles.kmSub', { km: km(stats.over500.km) })} pressed={filter === 'over500'} onPress={() => setFilter('over500')} />
          </div>

          <section className="hc-trk-card surface-depth" aria-label={t('chart.title')}>
            <header>
              <h2>{t('chart.title')}</h2>
              <p>{t('chart.note')}</p>
            </header>
            {loading ? <div className="hc-trk-chart-skeleton" /> : bars.length === 0 ? <p className="hc-trk-chart-empty">{t('chart.empty')}</p> : <DayChart entries={bars} onOpen={setOpened} />}
          </section>

          <div className="hc-records-tools">
            <input className="hc-input hc-records-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search')} aria-label={t('search')} />
          </div>

          {loading ? (
            <div role="status" className="hc-trk-list" aria-label={t('loading')}>
              {[0, 1, 2, 3, 4].map(row => <div key={row} className="hc-fine-skeleton" />)}
            </div>
          ) : shown.length === 0 ? (
            <p className="hc-records-empty">{search || filter !== 'all' ? t('noMatch') : t('emptyNone')}</p>
          ) : (
            <div className="hc-trk-listbox">
              <div className="hc-trk-listhead" aria-hidden="true">
                <span>{t('list.car')}</span>
                <span>{t('list.odometer')}</span>
                <span>{t('list.driven')}</span>
                <span>{t('list.week')}</span>
                <span>{t('list.signal')}</span>
              </div>
              <ul className="hc-trk-list">
                {shown.map(entry => (
                  <li key={entry.car_id ?? entry.plate}>
                    <button type="button" className="hc-trk-row surface-depth" aria-label={t('list.open', { plate: entry.plate, km: km(entry.km) })} onClick={() => setOpened(entry)}>
                      <span className="hc-trk-row-car">
                        <PlateChip plate={entry.plate} />
                        <span dir="auto">{entry.model ?? t('list.noModel')}</span>
                      </span>
                      <span className="hc-trk-row-odo">
                        <bdi>{entry.start_km === null ? '—' : km(entry.start_km)}</bdi>
                        <svg className="hc-trk-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <bdi>{entry.end_km === null ? '—' : km(entry.end_km)}</bdi>
                      </span>
                      <span className={`hc-trk-row-km ${entry.km > HIGH_DAY_KM ? 'is-high' : entry.km === 0 ? 'is-idle' : ''}`}>
                        <strong>{km(entry.km)}</strong>
                        <small>{t('km')}</small>
                      </span>
                      <span className="hc-trk-row-spark"><Sparkline days={sparkDays} km={entry.car_id === null ? undefined : sparks.get(entry.car_id)} /></span>
                      <span className="hc-trk-row-signal"><SignalAge iso={entry.last_signal_at} at={at} relative={isToday} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}

      {opened && (
        <CarHistorySheet
          entry={opened}
          live={(() => {
            const car = cars.find(item => (opened.car_id !== null ? item.car_id === opened.car_id : item.plate === opened.plate));
            return car && todayEntry(car);
          })()}
          today={today}
          onClose={() => setOpened(null)}
        />
      )}
    </>
  );
};

export default DailyReport;
