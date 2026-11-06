import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import Icon3D from '../Icon3D';
import HomeArt from '../HomeArt';
import PlateChip from '../booking/PlateChip';
import StatusArt from '../cars/StatusArt';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { formatTRY } from '../../lib/CurrencyContext';
import {
  HISTORY_FILTERS, carStatusTone, historySummary, inHistoryFilter, parseStamp, rentalDays,
  type FleetCar, type HistoryEvent, type HistoryFilter,
} from '../../lib/fleetCalendar';
import { getCarHistory } from '../../lib/queries/fleetCalendar';

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);

const plainImg = (src: string) => <img src={src} alt="" width={34} height={34} decoding="async" className="hc-fh-art" />;

/** A 3D render for each kind of event, from the sets the app already ships. */
function EventArt({ event }: { event: HistoryEvent }) {
  switch (event.kind) {
    case 'booking': {
      const name = event.status === 'confirmed' ? 'confirmed' : event.status === 'pending' ? 'pending' : event.status === 'completed' ? 'completed' : 'total';
      return <Icon3D name={name} size={34} className="hc-fh-art" />;
    }
    case 'extension': return <HomeArt name="schedule" className="hc-fh-art" />;
    case 'operation': return <HomeArt name="operations" className="hc-fh-art" />;
    case 'maintenance': case 'selling': case 'replacement': return <StatusArt name={event.kind} className="hc-fh-art" />;
    case 'issue': return plainImg('/illustrations/alerts/triangle-amber.webp');
    case 'fine': return plainImg('/illustrations/alerts/fine.webp');
    case 'car_change': return plainImg('/icons/3d/cars/key.png');
    default: return null;
  }
}

const dateOnly = (at: string | null | undefined) => (at ? at.slice(0, 10) : null);
const hasTime = (at: string | null | undefined) => !!at && /\d{2}:\d{2}/.test(at.slice(10));

/** `2 Nov 2026 · 14:05` in Istanbul for a timestamp, the day alone for a date. */
function useWhen() {
  const locale = useDateLocale();
  return (at: string | null | undefined) => {
    if (!at) return '—';
    if (!hasTime(at)) return formatDay(dateOnly(at), locale);
    const time = parseStamp(at);
    if (!time) return formatDay(dateOnly(at), locale);
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(time);
    const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(time);
    return `${formatDay(day, locale)} · ${clock}`;
  };
}

const amountOf = (value: HistoryEvent['amount']) => (value == null || value === '' ? null : Number(value));

const EventRow: React.FC<{ event: HistoryEvent; canSeeMoney: boolean; bookingsRoute: string | null }> = ({ event, canSeeMoney, bookingsRoute }) => {
  const { t } = useTranslation(['calendar', 'operations', 'carIssues']);
  const locale = useDateLocale();
  const when = useWhen();
  const amount = amountOf(event.amount);
  const showAmount = canSeeMoney && amount != null && amount > 0 && (event.kind === 'fine' || event.kind === 'extension');
  const range = event.end && dateOnly(event.end) !== dateOnly(event.at)
    ? `${formatDay(dateOnly(event.at), locale)} → ${formatDay(dateOnly(event.end), locale)}`
    : when(event.at);

  let title: string = t(`calendar:history.kinds.${event.kind}`);
  const lines: React.ReactNode[] = [];
  let pill: { text: string; tone: string } | null = null;
  let bookingId: number | null = null;

  switch (event.kind) {
    case 'booking': {
      title = event.title || title;
      bookingId = typeof event.ref_id === 'number' ? event.ref_id : null;
      if (event.customer) lines.push(<bdi key="c" dir="auto">{event.customer}</bdi>);
      const start = dateOnly(event.at);
      const end = dateOnly(event.end);
      lines.push(<span key="d">{range}{start && end ? ` · ${t('calendar:bar.days', { count: rentalDays(start, end) })}` : ''}</span>);
      if (event.status) pill = { text: t(`calendar:history.bookingStatus.${event.status}`, { defaultValue: event.status }), tone: event.status === 'confirmed' ? 'booked' : event.status === 'pending' ? 'pending' : 'completed' };
      break;
    }
    case 'extension':
      if (event.title) lines.push(<bdi key="t" dir="ltr">{event.title}</bdi>);
      lines.push(<span key="d">{event.end ? range : `${when(event.at)} · ${t('calendar:history.ongoing')}`}</span>);
      bookingId = typeof event.ref_id === 'number' ? event.ref_id : null;
      break;
    case 'operation': {
      title = t(`operations:types.${event.title ?? 'OTHER'}`, { defaultValue: (event.title ?? '').replace(/_/g, ' ') || title });
      const facts = [
        typeof event.km === 'number' && event.km > 0 ? t('calendar:history.km', { km: event.km.toLocaleString('tr-TR') }) : null,
        typeof event.fuel === 'number' ? t('calendar:history.fuel', { pct: event.fuel }) : null,
        event.by ? t('calendar:history.by', { name: event.by }) : null,
      ].filter(Boolean).join(' · ');
      lines.push(<span key="w">{when(event.at)}</span>);
      if (facts) lines.push(<span key="f">{facts}</span>);
      if (event.note?.trim()) lines.push(<bdi key="n" dir="auto" className="hc-fh-note">{event.note.trim()}</bdi>);
      break;
    }
    case 'maintenance': case 'selling': case 'replacement':
      lines.push(<span key="d">{range}</span>);
      if (event.title && event.title !== event.kind) lines.push(<bdi key="n" dir="auto" className="hc-fh-note">{event.title}</bdi>);
      break;
    case 'issue':
      title = event.title ? t(`carIssues:types.${event.title}`, { defaultValue: event.title }) : title;
      lines.push(<span key="d">{when(event.at)}</span>);
      if (event.note?.trim()) lines.push(<bdi key="n" dir="auto" className="hc-fh-note">{event.note.trim()}</bdi>);
      if (event.status) pill = { text: t(`calendar:history.issueStatus.${event.status}`, { defaultValue: event.status }), tone: event.status === 'resolved' ? 'completed' : 'pending' };
      break;
    case 'fine':
      title = event.title || title;
      lines.push(<span key="d">{when(event.at)}</span>);
      if (event.customer) lines.push(<bdi key="c" dir="auto">{event.customer}</bdi>);
      if (event.status) pill = { text: t(`calendar:history.fineStatus.${event.status}`, { defaultValue: event.status }), tone: event.status === 'paid' ? 'completed' : 'pending' };
      break;
    case 'car_change':
      if (event.title) lines.push(<bdi key="t" dir="ltr">{event.title}</bdi>);
      lines.push(<span key="p" dir="ltr">{t('calendar:history.carChange', { from: event.from_car ?? '—', to: event.to_car ?? '—' })}</span>);
      lines.push(<span key="d">{when(event.at)}</span>);
      bookingId = typeof event.ref_id === 'number' ? event.ref_id : null;
      break;
  }

  return (
    <li className={`hc-fh-item is-${event.kind}`}>
      <span className="hc-fh-icon" aria-hidden="true"><EventArt event={event} /></span>
      <div className="hc-fh-body">
        <div className="hc-fh-top">
          <strong className="hc-fh-title"><bdi dir="auto">{title}</bdi></strong>
          {pill && <span className={`hc-fc-chip hc-st-${pill.tone}`}>{pill.text}</span>}
          {showAmount && <b className="hc-fh-amount hc-num"><bdi dir="ltr">{formatTRY(amount as number)}</bdi></b>}
        </div>
        {event.kind !== 'booking' && event.kind !== 'operation' && title !== t(`calendar:history.kinds.${event.kind}`) && <small className="hc-fh-kind">{t(`calendar:history.kinds.${event.kind}`)}</small>}
        <div className="hc-fh-lines">{lines}</div>
        {bookingId != null && bookingsRoute && event.kind === 'booking' && (
          <Link to={`${bookingsRoute}?edit=${bookingId}`} className="hc-fh-link">{t('calendar:history.openBooking')}</Link>
        )}
      </div>
    </li>
  );
};

/** Everything that happened to one car, from `car_history`, newest first. */
const CarHistoryDrawer: React.FC<{
  car: FleetCar;
  canSeeMoney: boolean;
  bookingsRoute: string | null;
  onClose: () => void;
}> = ({ car, canSeeMoney, bookingsRoute, onClose }) => {
  const { t } = useTranslation(['calendar', 'common']);
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const closeRef = useRef<HTMLButtonElement>(null);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    let active = true;
    setEvents(null);
    setFailed(false);
    getCarHistory(car.id).then(rows => { if (active) setEvents(rows); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [car.id, attempt]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); opener?.focus?.(); };
  }, [onClose, opener]);

  const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric' }).format(new Date()));
  const summary = useMemo(() => (events ? historySummary(events, year) : null), [events, year]);
  const shown = useMemo(() => (events ?? []).filter(event => inHistoryFilter(event, filter)), [events, filter]);
  const tone = carStatusTone(car.status);

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop hc-fh-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="hc-fh-title" className="hc-ce hc-fh">
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <h2 id="hc-fh-title">{t('calendar:history.title')}</h2>
            <div className="hc-fh-car">
              <PlateChip plate={car.plate} />
              <bdi dir="auto">{car.model}</bdi>
              <span className={`hc-fc-chip hc-st-${tone}`}>{t(`calendar:tiles.${car.status}`)}</span>
            </div>
          </div>
          <button ref={closeRef} type="button" className="hc-ce-close" onClick={onClose} aria-label={t('common:actions.close')}><CloseIcon /></button>
        </header>

        <div className="hc-fh-scroll">
          <dl className="hc-fh-summary">
            <div><dt>{t('calendar:history.summary.bookings')}</dt><dd className="hc-num">{summary ? summary.bookings.toLocaleString('tr-TR') : '—'}</dd></div>
            <div><dt>{t('calendar:history.summary.days', { year })}</dt><dd className="hc-num">{summary ? summary.daysThisYear.toLocaleString('tr-TR') : '—'}</dd></div>
            <div><dt>{t('calendar:history.summary.km')}</dt><dd className="hc-num">{summary?.km != null ? summary.km.toLocaleString('tr-TR') : '—'}</dd></div>
          </dl>

          <div role="group" aria-label={t('calendar:history.title')} className="hc-fh-filters">
            {HISTORY_FILTERS.map(option => (
              <button key={option} type="button" aria-pressed={filter === option} onClick={() => setFilter(option)}>
                {t(`calendar:history.filters.${option}`)}
              </button>
            ))}
          </div>

          {failed ? (
            <div role="alert" className="hc-fh-state">
              <p>{t('calendar:history.failed')}</p>
              <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{t('calendar:history.retry')}</Button>
            </div>
          ) : events === null ? (
            <div role="status" aria-label={t('calendar:history.loading')} className="hc-fh-bones">
              {[0, 1, 2, 3].map(i => <span key={i} className="hc-bk-bone" />)}
            </div>
          ) : shown.length === 0 ? (
            <p className="hc-fh-state">{t('calendar:history.empty')}</p>
          ) : (
            <ol className="hc-fh-timeline">
              {shown.map((event, index) => <EventRow key={`${event.kind}:${event.ref_id ?? ''}:${event.at}:${index}`} event={event} canSeeMoney={canSeeMoney} bookingsRoute={bookingsRoute} />)}
            </ol>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CarHistoryDrawer;
