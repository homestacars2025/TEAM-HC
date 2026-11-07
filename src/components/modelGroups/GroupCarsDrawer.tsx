import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import PlateChip from '../booking/PlateChip';
import StatusArt from '../cars/StatusArt';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import { carStatusTone, utilTone, type Utilization } from '../../lib/fleetCalendar';
import { displayName, fetchGroupCars, type GroupCar, type ModelGroupRow, type ModelGroupStats } from '../../lib/modelGroups';
import { GroupImage, GroupUtilizationRing } from './ModelGroupCard';

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);

/** A car's month as the calendar shows it: a small ring and the %. */
const CarUtil: React.FC<{ value: Utilization | undefined }> = ({ value }) => {
  const { t } = useTranslation('calendar');
  if (!value) return <span className="hc-fc-util is-none" title={t('util.none')}>—</span>;
  const tip = t('util.tooltip', { rented: value.rented, days: value.days });
  return (
    <span className={`hc-fc-util hc-ut-${utilTone(value.rate)}`} title={tip} role="img" aria-label={t('util.label', { pct: `${value.rate}%`, tip })}>
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" pathLength={100} className="hc-fc-util-track" />
        <circle cx="10" cy="10" r="8" pathLength={100} className="hc-fc-util-arc" strokeDasharray={`${value.rate} 100`} />
      </svg>
      <b className="hc-num">{value.rate}%</b>
    </span>
  );
};

const CarList: React.FC<{ title: string; cars: GroupCar[]; month: string; muted?: boolean }> = ({ title, cars, month, muted }) => {
  const { t } = useTranslation(['modelGroups', 'calendar']);
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[12.5px] font-medium text-black/50">{title}</h3>
      <ul className="surface-depth overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-white">
        {cars.map((car, index) => (
          <li key={car.id} className={`flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 ${index > 0 ? 'border-t border-black/[0.05]' : ''} ${muted ? 'opacity-60' : ''}`}>
            <PlateChip plate={car.plate} />
            {car.isActive
              ? <span className={`hc-fc-chip hc-st-${carStatusTone(car.status)}`}>{t(`calendar:tiles.${car.status}`)}</span>
              : <span className="text-[12px] text-black/45">{t('modelGroups:cars.notInService')}</span>}
            <span className="ms-auto flex items-center gap-2">
              <span className="hidden text-[11.5px] text-black/40 sm:inline">{month}</span>
              <CarUtil value={car.utilization} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** The group's cars: plate, today's status and the month's utilization. Read only, and no investor. */
export const GroupCarsDrawer: React.FC<{
  group: ModelGroupRow;
  stats: ModelGroupStats | undefined;
  month: string;
  monthLabel: string;
  /** The month alone, for the small labels beside each figure. */
  monthName: string;
  onClose: () => void;
}> = ({ group, stats, month, monthLabel, monthName, onClose }) => {
  const { t } = useTranslation(['modelGroups', 'common']);
  useBlockedPage();
  const [cars, setCars] = useState<GroupCar[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const name = displayName(group);

  useEffect(() => {
    let active = true;
    setCars(null);
    setFailed(false);
    fetchGroupCars(group.id, month)
      .then((rows) => { if (active) setCars(rows); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [group.id, month, attempt]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeCars = cars?.filter((car) => car.isActive) ?? [];
  const inactiveCars = cars?.filter((car) => !car.isActive) ?? [];

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t('cars.title', { name })} className="hc-ce hc-fh surface-float">
        <header className="hc-ce-head">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <GroupImage src={group.image_url} alt="" compact className="!aspect-[4/3] w-20 shrink-0 !rounded-[10px]" />
            <div className="min-w-0">
              <h2 dir="auto" className="truncate">{name}</h2>
              <p className="mt-0.5 text-[13px] text-black/50">
                {stats ? t('cars.onRoad', { rented: stats.rented_now, active: stats.cars_active }) : t('cars.subtitle')}
              </p>
            </div>
            <div className="ms-auto flex flex-col items-center gap-0.5" title={monthLabel}>
              <GroupUtilizationRing rate={stats?.utilization ?? null} size={44} />
              <span className="text-[11px] text-black/40">{monthName}</span>
            </div>
          </div>
          <button ref={closeRef} type="button" className="hc-ce-close" onClick={onClose} aria-label={t('common:actions.close')}><CloseIcon /></button>
        </header>

        <div className="hc-fh-scroll">
          {failed ? (
            <div className="hc-ce-state" role="alert">
              <p>{t('cars.loadError')}</p>
              <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>{t('common:actions.tryAgain')}</Button>
            </div>
          ) : cars === null ? (
            <div className="hc-ce-state" role="status"><span className="hc-ce-spinner" aria-hidden="true" />{t('cars.loading')}</div>
          ) : cars.length === 0 ? (
            <div className="hc-ce-state text-center">
              <StatusArt name="parking" className="h-auto w-[120px]" />
              <p className="text-[14px] font-medium text-foreground">{t('cars.none')}</p>
              <p className="max-w-[300px] text-[13px] text-black/50">{t('cars.noneBody')}</p>
            </div>
          ) : (
            <>
              <CarList title={t('cars.active', { count: activeCars.length })} cars={activeCars} month={monthName} />
              {inactiveCars.length > 0 && <CarList title={t('cars.inactive', { count: inactiveCars.length })} cars={inactiveCars} month={monthName} muted />}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
