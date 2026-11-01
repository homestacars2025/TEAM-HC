import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import Button from '../components/Button';
import { ComplianceTriangle } from '../components/cars/Compliance';
import DailyReport from '../components/tracking/DailyReport';
import LiveFleet from '../components/tracking/LiveFleet';
import { useDateLocale } from '../hooks/useDateLocale';
import { useFleet } from '../hooks/useFleet';
import { istanbulDate } from '../lib/istanbulTime';
import { formatSignalTime, isValidDay, trackingOutage } from '../lib/tracking';

type Tab = 'day' | 'live';

const CarTrackingPage: React.FC = () => {
  const { t } = useTranslation('tracking');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const { cars, models, loading, failed, now, retry, patchCar } = useFleet();
  const [params, setParams] = useSearchParams();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = istanbulDate(new Date(now));
  const tab: Tab = params.get('tab') === 'live' ? 'live' : 'day';
  const requested = params.get('day');
  const day = isValidDay(requested) && requested < today ? requested : today;

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // The two sections filter on different things, so a filter never crosses over.
  const openTab = (next: Tab) => setParams(current => {
    const updated = new URLSearchParams(current);
    updated.delete('filter');
    if (next === 'live') updated.set('tab', 'live');
    else updated.delete('tab');
    return updated;
  }, { replace: true });

  const openDay = useCallback((next: string) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (next >= today) updated.delete('day');
    else updated.set('day', next);
    return updated;
  }, { replace: true }), [setParams, today]);

  const outage = useMemo(() => (loading ? null : trackingOutage(cars, now)), [loading, cars, now]);

  return (
    <div className="hc-records-page">
      <header className="hc-records-head">
        <div className="min-w-0">
          <p className="hc-eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
      </header>

      {outage && (
        <div role="status" className="hc-compliance-banner surface-depth is-red">
          <ComplianceTriangle severity="expired" size={44} />
          <p className="hc-compliance-banner-title min-w-0 flex-1">
            {outage.lastSignal
              ? t('banner.stopped', { time: formatSignalTime(outage.lastSignal, locale) })
              : t('banner.stoppedNever')}
          </p>
        </div>
      )}

      {failed && (
        <div role="alert" className="hc-form-error mb-4 flex flex-wrap items-center justify-between gap-2">
          {t('loadFailed')}
          <Button variant="secondary" onClick={retry}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      <div role="group" aria-label={t('title')} className="hc-seg hc-trk-tabs">
        {(['day', 'live'] as Tab[]).map(option => (
          <button key={option} type="button" aria-pressed={tab === option} onClick={() => openTab(option)}>{t(`tabs.${option}`)}</button>
        ))}
      </div>

      {tab === 'day' ? (
        <DailyReport cars={cars} models={models} fleetLoading={loading} now={now} day={day} today={today} onDay={openDay} />
      ) : (
        <LiveFleet cars={cars} loading={loading} now={now} onPatch={patchCar} onError={showToast} />
      )}

      {toast && ReactDOM.createPortal(<div role="status" className="hc-page-toast is-error">{toast}</div>, document.body)}
    </div>
  );
};

export default CarTrackingPage;
