import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTileFilter } from '../../hooks/useTileFilter';
import { saveNextOilChange } from '../../lib/queries/tracking';
import { inLiveFilter, LIVE_FILTERS, liveStats, matchesSearch, oilStatus, sortCars, type LiveSort, type TrackedCar } from '../../lib/tracking';
import PlateChip from '../booking/PlateChip';
import { ComplianceTriangle } from '../cars/Compliance';
import { StatTile } from '../WalletParts';
import { SignalAge, TRACK_ICONS, useKm } from './parts';

const Pencil = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const OilField: React.FC<{ car: TrackedCar; onSaved: (value: number | null) => void; onError: (message: string) => void }> = ({ car, onSaved, onError }) => {
  const { t } = useTranslation('tracking');
  const km = useKm();
  const [value, setValue] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const editing = value !== null;

  useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

  const save = async () => {
    if (value === null || saving) return;
    const text = value.trim();
    const next = text === '' ? null : Number(text);
    if (next !== null && (!Number.isInteger(next) || next < 0)) { onError(t('oil.invalid')); return; }
    if (next === car.next_oil_change) { setValue(null); return; }
    setSaving(true);
    try {
      await saveNextOilChange(car.id, next);
      onSaved(next);
      setValue(null);
    } catch {
      onError(t('oil.failed'));
    }
    setSaving(false);
  };

  if (!editing) {
    return (
      <button type="button" className="hc-trk-oil-read" aria-label={t('oil.edit', { plate: car.plate })} onClick={() => setValue(car.next_oil_change === null ? '' : String(car.next_oil_change))}>
        <span>{car.next_oil_change === null ? '—' : `${km(car.next_oil_change)} ${t('km')}`}</span>
        <Pencil />
      </button>
    );
  }

  return (
    <span className="hc-trk-oil-edit">
      <input
        ref={input}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        dir="ltr"
        value={value}
        aria-label={t('table.nextOil')}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') setValue(null);
        }}
      />
      <button type="button" disabled={saving} aria-label={t('oil.save')} className="is-save" onClick={() => void save()}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <button type="button" disabled={saving} aria-label={t('oil.cancel')} onClick={() => setValue(null)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
      </button>
    </span>
  );
};

const OilBar: React.FC<{ car: TrackedCar }> = ({ car }) => {
  const { t } = useTranslation('tracking');
  const km = useKm();
  const status = oilStatus(car);
  if (!status) return <span className="hc-trk-muted">—</span>;
  const { remaining, tone, fill } = status;
  return (
    <span className={`hc-trk-oil is-${tone}`}>
      <span className="hc-trk-oil-text">
        {tone !== 'green' && <ComplianceTriangle severity={tone === 'red' ? 'expired' : 'missing'} size={20} />}
        <span>{remaining <= 0 ? t('oil.overdue', { km: km(Math.abs(remaining)) }) : t('oil.left', { km: km(remaining) })}</span>
      </span>
      <span className="hc-trk-oil-track"><i style={{ width: `${Math.round(fill * 100)}%` }} /></span>
    </span>
  );
};

const LiveFleet: React.FC<{
  cars: TrackedCar[];
  loading: boolean;
  now: number;
  onPatch: (id: number, patch: Partial<TrackedCar>) => void;
  onError: (message: string) => void;
}> = ({ cars, loading, now, onPatch, onError }) => {
  const { t } = useTranslation('tracking');
  const km = useKm();
  const [filter, setFilter] = useTileFilter(LIVE_FILTERS);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ column: LiveSort; direction: 'asc' | 'desc' } | null>(null);

  const stats = useMemo(() => liveStats(cars, now), [cars, now]);
  const shown = useMemo(() => {
    const rows = cars.filter(car => inLiveFilter(car, filter, now) && matchesSearch(car, search));
    return sort ? sortCars(rows, sort.column, sort.direction) : rows;
  }, [cars, filter, now, search, sort]);

  const pressSort = (column: LiveSort) => setSort(current => {
    if (current?.column !== column) return { column, direction: 'asc' };
    return current.direction === 'asc' ? { column, direction: 'desc' } : null;
  });

  const columns: { column: LiveSort | null; label: string }[] = [
    { column: 'plate', label: t('table.plate') },
    { column: 'model', label: t('table.model') },
    { column: 'current_km', label: t('table.currentKm') },
    { column: 'today_km', label: t('table.todayKm') },
    { column: null, label: t('table.ignition') },
    { column: 'speed', label: t('table.speed') },
    { column: 'next_oil_change', label: t('table.nextOil') },
    { column: 'remaining', label: t('table.remaining') },
    { column: 'last_signal_at', label: t('table.signal') },
  ];
  const label = (index: number) => columns[index].label;
  const figure = (value: number) => (loading ? null : km(value));

  return (
    <>
      <div className="hc-tiles hc-tiles-filter hc-tiles-six">
        <StatTile tone="total" label={t('tiles.all')} value={figure(stats.all)} sub={t('tiles.allSub')} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        <StatTile tone="balance" icon={TRACK_ICONS.moving} label={t('tiles.moving')} value={figure(stats.moving)} sub={t('tiles.rightNow')} pressed={filter === 'moving'} onPress={() => setFilter('moving')} />
        <StatTile tone="received" icon={TRACK_ICONS.ignition} label={t('tiles.ignition')} value={figure(stats.ignition)} sub={t('tiles.rightNow')} pressed={filter === 'ignition'} onPress={() => setFilter('ignition')} />
        <StatTile tone="warn" art={<ComplianceTriangle severity="missing" size={40} className="hc-tile-art" />} label={t('tiles.oilDue')} value={figure(stats.oilDue)} sub={t('tiles.oilDueSub')} pressed={filter === 'oilDue'} onPress={() => setFilter('oilDue')} />
        <StatTile tone="negative" art={<ComplianceTriangle severity="expired" size={40} className="hc-tile-art" />} label={t('tiles.oilOverdue')} value={figure(stats.oilOverdue)} sub={t('tiles.oilOverdueSub')} pressed={filter === 'oilOverdue'} onPress={() => setFilter('oilOverdue')} />
        <StatTile tone="warn" art={<ComplianceTriangle severity="missing" size={40} className="hc-tile-art" />} label={t('tiles.noSignal')} value={figure(stats.noSignal)} sub={t('tiles.over24h')} pressed={filter === 'noSignal'} onPress={() => setFilter('noSignal')} />
      </div>

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
        <div className="hc-trk-live">
          <table>
            <thead>
              <tr>
                {columns.map(({ column, label: heading }) => {
                  const active = column !== null && sort?.column === column;
                  return (
                    <th key={heading} scope="col" aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {column === null ? heading : (
                        <button type="button" className={active ? 'is-active' : undefined} onClick={() => pressSort(column)}>
                          {heading}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d={active && sort?.direction === 'desc' ? 'M12 5v14M5 12l7 7 7-7' : 'M12 19V5M5 12l7-7 7 7'} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map(car => (
                <tr key={car.id} className="surface-depth">
                  <td className="hc-trk-cell-plate"><PlateChip plate={car.plate} /></td>
                  <td className="hc-trk-cell-model" dir="auto">{car.model ?? t('list.noModel')}</td>
                  <td data-label={label(2)}>{car.current_km === null ? '—' : `${km(car.current_km)} ${t('km')}`}</td>
                  <td data-label={label(3)} className={car.today_km > 0 ? 'hc-trk-cell-today' : 'hc-trk-muted'}>{car.today_km > 0 ? '+' : ''}{km(car.today_km)} {t('km')}</td>
                  <td className="hc-trk-cell-ignition">
                    <span className={`hc-trk-ignition ${car.ignition ? 'is-on' : ''}`}>{car.ignition ? t('ignition.on') : t('ignition.off')}</span>
                  </td>
                  <td data-label={label(5)}>{car.speed} {t('kmh')}</td>
                  <td data-label={label(6)} className="hc-trk-cell-oil">
                    <OilField car={car} onSaved={value => onPatch(car.id, { next_oil_change: value })} onError={onError} />
                  </td>
                  <td data-label={label(7)} className="hc-trk-cell-left"><OilBar car={car} /></td>
                  <td data-label={label(8)} className="hc-trk-cell-signal"><SignalAge iso={car.last_signal_at} at={now} relative /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default LiveFleet;
