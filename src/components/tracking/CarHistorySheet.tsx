import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { getDailyKm } from '../../lib/queries/tracking';
import { downloadCsv } from '../../lib/csv';
import { addDays, daysEnding, HISTORY_START, type DailyKmRow, type DayEntry } from '../../lib/tracking';
import Button from '../Button';
import BookingSheet from '../booking/BookingSheet';
import { FormCard } from '../booking/FormParts';
import PlateChip from '../booking/PlateChip';
import { HistoryChart } from './KmCharts';
import { useKm } from './parts';

const WINDOW_DAYS = 30;

const CHART_ICON = <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
const TABLE_ICON = <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;

interface HistoryRow {
  day: string;
  start_km: number | null;
  end_km: number | null;
  km: number;
}

interface CarHistorySheetProps {
  /** The car's live row, for today. Absent when the tracker is gone from the fleet. */
  live: DayEntry | undefined;
  /** What was tapped, which names the car. */
  entry: DayEntry;
  today: string;
  onClose: () => void;
}

const CarHistorySheet: React.FC<CarHistorySheetProps> = ({ live, entry, today, onClose }) => {
  const { t } = useTranslation('tracking');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const km = useKm();
  const closeRef = useRef<(() => void) | null>(null);
  const carId = entry.car_id;
  const [saved, setSaved] = useState<DailyKmRow[]>([]);
  const [loading, setLoading] = useState(carId !== null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (carId === null) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    getDailyKm(addDays(today, 1 - WINDOW_DAYS), addDays(today, -1), carId)
      .then(rows => { if (!cancelled) setSaved(rows); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [carId, today, attempt]);

  const rows = useMemo<HistoryRow[]>(() => {
    const todayRow = live ? [{ day: today, start_km: live.start_km, end_km: live.end_km, km: live.km }] : [];
    return [...todayRow, ...[...saved].reverse()];
  }, [live, saved, today]);

  const days = useMemo(() => daysEnding(today, WINDOW_DAYS), [today]);
  const byDay = useMemo(() => new Map(rows.map(row => [row.day, row.km])), [rows]);
  const total = rows.reduce((sum, row) => sum + row.km, 0);

  const exportCsv = () => downloadCsv(`km-${entry.plate}-${today}`, [
    [t('sheet.day'), t('sheet.start'), t('sheet.end'), t('sheet.km')],
    ...rows.map(row => [row.day, row.start_km, row.end_km, row.km]),
  ]);

  return (
    <BookingSheet
      title={entry.model ?? t('sheet.title')}
      subtitle={t('sheet.subtitle', { count: WINDOW_DAYS })}
      chip={<PlateChip plate={entry.plate} />}
      dirty={false}
      busy={false}
      onClose={onClose}
      onSubmit={e => e.preventDefault()}
      closeRef={closeRef}
      footer={(
        <div className="hc-detail-actions">
          <Button variant="secondary" onClick={() => closeRef.current?.()}>{tc('actions.close')}</Button>
          <Button disabled={loading || rows.length === 0} onClick={exportCsv}>{t('sheet.export')}</Button>
        </div>
      )}
    >
      {failed && (
        <div role="alert" className="hc-form-error flex flex-wrap items-center justify-between gap-2">
          {t('sheet.loadFailed')}
          <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      {carId === null && <p className="hc-trk-note">{t('sheet.unlinked')}</p>}
      {carId !== null && !loading && !failed && saved.length === 0 && (
        <p className="hc-trk-note">{t('empty.title', { date: formatDay(HISTORY_START, locale) })}. {t('sheet.firstNight')}</p>
      )}

      <FormCard icon={CHART_ICON} title={t('sheet.chartTitle', { km: km(total) })}>
        <div className="hc-field-wide">
          {loading ? <div className="hc-trk-history-skeleton" /> : <HistoryChart days={days} km={byDay} />}
        </div>
      </FormCard>

      <FormCard icon={TABLE_ICON} title={t('sheet.tableTitle')}>
        <div className="hc-field-wide hc-trk-history-table">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('sheet.day')}</th>
                <th scope="col">{t('sheet.start')}</th>
                <th scope="col">{t('sheet.end')}</th>
                <th scope="col">{t('sheet.km')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.day}>
                  <td>{row.day === today ? t('sheet.today') : formatDay(row.day, locale)}</td>
                  <td>{row.start_km === null ? '—' : km(row.start_km)}</td>
                  <td>{row.end_km === null ? '—' : km(row.end_km)}</td>
                  <td><strong>{km(row.km)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FormCard>
    </BookingSheet>
  );
};

export default CarHistorySheet;
