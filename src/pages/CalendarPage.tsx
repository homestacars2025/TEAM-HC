import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button';
import MonthSwitcher from '../components/MonthSwitcher';
import PlateChip from '../components/booking/PlateChip';
import StatusArt from '../components/cars/StatusArt';
import Icon3D from '../components/Icon3D';
import { StatTile, type TileTone } from '../components/WalletParts';
import CarHistoryDrawer from '../components/calendar/CarHistoryDrawer';
import { usePageAccess } from '../contexts/PageAccessContext';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { formatDay, useDateLocale } from '../hooks/useDateLocale';
import { useTileFilter } from '../hooks/useTileFilter';
import { istanbulDate } from '../lib/istanbulTime';
import { currentMonth, readMonth, shiftMonth } from '../lib/pendingInvoices';
import {
  BLOCK_TYPES, CAR_STATUSES, LEGEND, UTIL_SORTS, barSpan, carStatusTone, daysBetween, flaggedBookings, fleetUtilization, isWeekend, laneBars,
  monthBounds, readUtilSort, rentalDays, rowMatches, sortByUtilization, statusCounts, utilTone,
  type BlockType, type CarStatus, type Conflict, type FleetBar, type FleetCar, type Utilization, type UtilSort,
} from '../lib/fleetCalendar';
import { addBlock, deleteBlock, getCalendarConflicts, getCarUtilization, getFleetMonth, updateBlock, type FleetMonth } from '../lib/queries/fleetCalendar';

/**
 * Fleet Calendar: one row per active car, one bar per booking or block, the month's
 * problems on top. A car's name opens its whole history. Free days can still be picked
 * to add a booking or a block, and a block can be edited or deleted from its bar.
 */

const TOAST_MS = 3200;

const TILE_ART: Record<CarStatus | 'all', React.ReactNode> = {
  all: <StatusArt name="total" className="hc-tile-art" />,
  working: <StatusArt name="working" className="hc-tile-art" />,
  pending: <Icon3D name="pending" className="hc-tile-art" />,
  parking: <StatusArt name="parking" className="hc-tile-art" />,
  maintenance: <StatusArt name="maintenance" className="hc-tile-art" />,
  selling: <StatusArt name="selling" className="hc-tile-art" />,
  replacement: <StatusArt name="replacement" className="hc-tile-art" />,
};

const pad = (n: number) => String(n).padStart(2, '0');

type Anchor = { x: number; y: number; bottom: number };
type Popover = { bar: FleetBar; car: FleetCar; anchor: Anchor; pinned: boolean };
type Selection = { carId: number; start: string; end: string | null; anchor: Anchor | null };

const anchorOf = (el: Element): Anchor => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top, bottom: r.bottom };
};

/** A small floating card beside its anchor, kept inside the window. */
const Floating: React.FC<{ anchor: Anchor; width: number; className?: string; label: string; onMouseEnter?: () => void; onMouseLeave?: () => void; children: React.ReactNode }> = ({ anchor, width, className, label, onMouseEnter, onMouseLeave, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 200;
    const w = Math.min(width, window.innerWidth - 24);
    const left = Math.min(Math.max(anchor.x - w / 2, 12), window.innerWidth - w - 12);
    const below = anchor.bottom + 8;
    const top = below + height > window.innerHeight - 12 ? Math.max(anchor.y - height - 8, 12) : below;
    setPos({ left, top });
  }, [anchor, width]);
  return ReactDOM.createPortal(
    <div ref={ref} role="dialog" aria-label={label} className={`hc-fc-float surface-depth surface-float ${className ?? ''}`}
      style={{ width: Math.min(width, window.innerWidth - 24), left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseDown={e => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
};

// ─── Utilization ──────────────────────────────────────────────────────────────

/** A small ring and the month's %: `undefined` while loading, `null` when the car has no figure. */
const UtilMeter: React.FC<{ value: Utilization | null | undefined }> = ({ value }) => {
  const { t } = useTranslation('calendar');
  if (value === undefined) return <span className="hc-fc-util is-wait" aria-hidden="true" />;
  if (value === null) return <span className="hc-fc-util is-none" title={t('util.none')}>—</span>;
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

// ─── The bar's card ───────────────────────────────────────────────────────────

const BarCard: React.FC<{
  popover: Popover;
  flagged: boolean;
  bookingsRoute: string | null;
  onHistory: () => void;
  onClose: () => void;
  onHoverKeep: () => void;
  onHoverLeave: () => void;
  onChanged: (message: string) => void;
  onFailed: (message: string) => void;
}> = ({ popover, flagged, bookingsRoute, onHistory, onClose, onHoverKeep, onHoverLeave, onChanged, onFailed }) => {
  const { t } = useTranslation(['calendar', 'common']);
  const locale = useDateLocale();
  const navigate = useNavigate();
  const { bar } = popover;
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [type, setType] = useState<BlockType>(bar.blockType ?? 'maintenance');
  const [start, setStart] = useState(bar.start);
  const [end, setEnd] = useState(bar.end);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (bar.blockId == null) return;
    if (end <= start) { setProblem(t('popup.dateOrder')); return; }
    setBusy(true);
    try { await updateBlock(bar.blockId, type, start, end); onChanged(t('popup.updated')); } catch { onFailed(t('popup.saveFailed')); setBusy(false); }
  };
  const remove = async () => {
    if (bar.blockId == null) return;
    setBusy(true);
    try { await deleteBlock(bar.blockId); onChanged(t('popup.deleted')); } catch { onFailed(t('popup.deleteFailed')); setBusy(false); }
  };

  const statusLabel = t(`legend.${bar.status}`);
  return (
    <Floating anchor={popover.anchor} width={300} label={bar.customer ?? statusLabel} className={`hc-st-${bar.status}`} onMouseEnter={onHoverKeep} onMouseLeave={onHoverLeave}>
      <div className="hc-fc-card-head">
        <span className={`hc-fc-chip hc-st-${bar.status}`}><i aria-hidden="true" />{mode === 'edit' ? t('popup.editBlock') : statusLabel}</span>
        {flagged && <span className="hc-fc-chip is-alert">{t('bar.conflict')}</span>}
        <button type="button" className="hc-fc-x" onClick={onClose} aria-label={t('bar.close')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>
      {bar.customer && <p className="hc-fc-card-who"><bdi dir="auto">{bar.customer}</bdi></p>}
      <div className="hc-fc-card-car"><PlateChip plate={popover.car.plate} /><bdi dir="auto">{popover.car.model}</bdi></div>

      {mode === 'edit' ? (
        <div className="hc-fc-card-form">
          <label><span>{t('popup.blockType')}</span>
            <select className="hc-input" value={type} onChange={e => setType(e.target.value as BlockType)} disabled={busy}>
              {BLOCK_TYPES.map(value => <option key={value} value={value}>{t(`common:carStatus.${value}`)}</option>)}
            </select>
          </label>
          <label><span>{t('popup.startDate')}</span><input type="date" className="hc-input" value={start} onChange={e => { setStart(e.target.value); setProblem(null); }} disabled={busy} /></label>
          <label><span>{t('popup.endDate')}</span><input type="date" className="hc-input" value={end} onChange={e => { setEnd(e.target.value); setProblem(null); }} disabled={busy} /></label>
          {problem && <p role="alert" className="hc-fc-card-problem">{problem}</p>}
          <div className="hc-fc-card-actions">
            <Button variant="secondary" onClick={() => setMode('view')} disabled={busy}>{t('popup.cancel')}</Button>
            <Button onClick={() => void save()} disabled={busy} aria-busy={busy}>{busy ? t('popup.saving') : t('popup.save')}</Button>
          </div>
        </div>
      ) : (
        <>
          <dl className="hc-fc-card-facts">
            {bar.bookingNumber && <div><dt>{t('bar.booking')}</dt><dd><bdi dir="ltr" className="hc-num">{bar.bookingNumber}</bdi></dd></div>}
            <div><dt>{t('bar.from')}</dt><dd>{formatDay(bar.start, locale)}</dd></div>
            <div><dt>{t('bar.to')}</dt><dd>{formatDay(bar.end, locale)}</dd></div>
            <div><dt>{t('bar.length')}</dt><dd>{t('bar.days', { count: rentalDays(bar.start, bar.end) })}</dd></div>
            {bar.note && <div className="is-wide"><dd><bdi dir="auto">{bar.note}</bdi></dd></div>}
          </dl>
          {mode === 'delete' ? (
            <div className="hc-fc-card-confirm">
              <p>{t('popup.confirmDelete')}</p>
              <div className="hc-fc-card-actions">
                <Button variant="secondary" onClick={() => setMode('view')} disabled={busy}>{t('popup.cancel')}</Button>
                <Button variant="destructive" onClick={() => void remove()} disabled={busy} aria-busy={busy}>{busy ? t('popup.deleting') : t('popup.delete')}</Button>
              </div>
            </div>
          ) : (
            <div className="hc-fc-card-actions">
              {bar.bookingId != null && bookingsRoute && (
                <Button onClick={() => navigate(`${bookingsRoute}?edit=${bar.bookingId}`)}>{t('bar.openBooking')}</Button>
              )}
              {bar.blockId != null && <Button variant="secondary" onClick={() => setMode('edit')}>{t('popup.edit')}</Button>}
              {bar.blockId != null && <Button variant="secondary" className="hc-fc-danger" onClick={() => setMode('delete')}>{t('popup.delete')}</Button>}
              <Button variant="secondary" onClick={onHistory}>{t('bar.carHistory')}</Button>
            </div>
          )}
        </>
      )}
    </Floating>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const CalendarPage: React.FC = () => {
  const { t } = useTranslation(['calendar', 'common']);
  const locale = useDateLocale();
  const navigate = useNavigate();
  const { pages, canAccessPage } = usePageAccess();
  const { profile } = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const read = readMonth(params.get('month'));
  const month = read === 'all' ? currentMonth() : read;
  const [filter, setFilter] = useTileFilter(CAR_STATUSES);
  const [search, setSearch] = useState('');
  const sort = readUtilSort(params.get('sort'));
  const setSort = (next: UtilSort) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (next === 'model') updated.delete('sort');
    else updated.set('sort', next);
    return updated;
  }, { replace: true });

  const [data, setData] = useState<FleetMonth | null>(null);
  const [failed, setFailed] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [utilization, setUtilization] = useState<Map<number, Utilization> | null>(null);
  const [popover, setPopover] = useState<Popover | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [historyCar, setHistoryCar] = useState<FleetCar | null>(null);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [inserting, setInserting] = useState(false);
  const [reload, setReload] = useState(0);
  const loadId = useRef(0);
  const board = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef(0);
  const toastTimer = useRef(0);

  const routeOf = (key: string) => (canAccessPage(key) ? pages.find(p => p.key === key)?.route ?? null : null);
  const bookingsRoute = routeOf('bookings');
  const canSeeMoney = profile?.role === 'admin' || canAccessPage('accounting');

  const { first, days } = monthBounds(month);
  const today = istanbulDate();
  const todayIndex = today.slice(0, 7) === month ? daysBetween(first, today) : -1;
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`), [month, days]);

  // ── Data ──
  useEffect(() => {
    const id = ++loadId.current;
    setFailed(false);
    setPopover(null);
    setSelection(null);
    getFleetMonth(month).then(next => { if (id === loadId.current) setData(next); }).catch(() => { if (id === loadId.current) setFailed(true); });
    return () => { loadId.current += 1; };
  }, [month, reload]);

  // Live: the month's conflicts (for the red outline) and utilization, asked again after
  // a change here and whenever the tab comes back. A failure only leaves them out.
  const loadLive = useCallback(() => {
    let active = true;
    getCalendarConflicts(month).then(rows => { if (active) setConflicts(rows); }).catch(() => undefined);
    getCarUtilization(month).then(rows => { if (active) setUtilization(new Map(rows.map(row => [row.carId, row]))); }).catch(() => undefined);
    return () => { active = false; };
  }, [month]);
  useEffect(() => { setConflicts(null); setUtilization(null); return loadLive(); }, [loadLive, reload]);
  useEffect(() => {
    let cancel = () => {};
    const onFocus = () => { cancel(); cancel = loadLive(); };
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('focus', onFocus); cancel(); };
  }, [loadLive]);

  useEffect(() => () => { window.clearTimeout(hoverTimer.current); window.clearTimeout(toastTimer.current); }, []);

  const say = (text: string, bad = false) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, bad });
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  };

  // ── Rows ──
  const cars = useMemo(() => data?.cars ?? [], [data]);
  const barsByCar = useMemo(() => {
    const map = new Map<number, FleetBar[]>();
    for (const bar of data?.bars ?? []) map.set(bar.carId, [...(map.get(bar.carId) ?? []), bar]);
    return map;
  }, [data]);
  const counts = useMemo(() => statusCounts(cars), [cars]);
  const rows = useMemo(
    () => sortByUtilization(cars.filter(car => (filter === 'all' || car.status === filter) && rowMatches(car, barsByCar.get(car.id) ?? [], search)), sort, utilization),
    [cars, filter, search, barsByCar, sort, utilization],
  );
  const fleetRate = useMemo(() => (utilization ? fleetUtilization(Array.from(utilization.values())) : null), [utilization]);
  const flagged = useMemo(() => flaggedBookings(conflicts ?? [], data?.bars ?? []), [conflicts, data]);

  const setMonth = (next: string) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (next === currentMonth()) updated.delete('month');
    else updated.set('month', next);
    return updated;
  }, { replace: true });

  // ── Popover: hover on a pointer that hovers, a tap everywhere ──
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  const openBar = (bar: FleetBar, car: FleetCar, el: Element, pinned: boolean) => {
    window.clearTimeout(hoverTimer.current);
    setSelection(null);
    setPopover({ bar, car, anchor: anchorOf(el), pinned });
  };
  const hoverBar = (bar: FleetBar, car: FleetCar, el: Element) => {
    if (!canHover || popover?.pinned) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => openBar(bar, car, el, false), 260);
  };
  const leaveBar = () => {
    window.clearTimeout(hoverTimer.current);
    if (popover && !popover.pinned) hoverTimer.current = window.setTimeout(() => setPopover(current => (current?.pinned ? current : null)), 220);
  };

  useEffect(() => {
    if (!popover && !selection?.anchor) return;
    const onDown = () => { setPopover(null); setSelection(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !historyCar) { setPopover(null); setSelection(null); } };
    const onScroll = () => setPopover(current => (current?.pinned ? current : null));
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    board.current?.addEventListener('scroll', onScroll, { passive: true });
    const el = board.current;
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); el?.removeEventListener('scroll', onScroll); };
  }, [popover, selection, historyCar]);

  // ── Picking free days ──
  const pickDay = (car: FleetCar, date: string, el: Element) => {
    setPopover(null);
    setSelection(current => {
      if (!current || current.carId !== car.id || current.end !== null || date <= current.start) return { carId: car.id, start: date, end: null, anchor: null };
      return { ...current, end: date, anchor: anchorOf(el) };
    });
  };

  const insert = async (blockType: BlockType) => {
    if (!selection?.end || inserting) return;
    setInserting(true);
    try {
      await addBlock(selection.carId, selection.start, selection.end, blockType);
      say(t('menu.added', { block: t(`common:carStatus.${blockType}`) }));
      setSelection(null);
      setReload(n => n + 1);
    } catch {
      say(t('menu.addFailed'), true);
    } finally {
      setInserting(false);
    }
  };

  const monthLabel = new Date(`${month}-01T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const weekday = (date: string) => {
    const name = new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
    return /^[A-Za-z]/.test(name) ? name.slice(0, 2) : name;
  };
  const loading = data === null && !failed;
  const pct = (n: number) => (cars.length ? `${Math.round((n / cars.length) * 100)}%` : '0%');
  const selectedCar = selection ? cars.find(c => c.id === selection.carId) ?? null : null;

  return (
    <div className="hc-pi hc-fc">
      <header className="hc-pi-head">
        <div>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
      </header>

      <div className="hc-tiles hc-tiles-filter hc-bk-tiles hc-fc-tiles">
        <StatTile tone="st-all" art={TILE_ART.all} label={t('tiles.all')} sub={t('tiles.allSub')} value={loading ? null : counts.all.toLocaleString('tr-TR')} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        {CAR_STATUSES.map(status => (
          <StatTile key={status} tone={`st-${carStatusTone(status)}` as TileTone} art={TILE_ART[status]} label={t(`tiles.${status}`)} sub={t('tiles.share', { pct: pct(counts[status] ?? 0) })}
            value={loading ? null : (counts[status] ?? 0).toLocaleString('tr-TR')} pressed={filter === status} onPress={() => setFilter(status)} />
        ))}
      </div>

      <ul className="hc-fc-legend" aria-label={t('legend.label')}>
        {LEGEND.map(status => <li key={status} className={`hc-fc-chip hc-st-${status}`}><i aria-hidden="true" />{t(`legend.${status}`)}</li>)}
      </ul>

      <div className="hc-fc-tools">
        <div className="hc-months">
          <MonthSwitcher label={monthLabel} prevLabel={t('month.prev')} nextLabel={t('month.next')} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
          {month !== currentMonth() && <button type="button" className="hc-pi-all" onClick={() => setMonth(currentMonth())}>{t('today')}</button>}
          {fleetRate != null && <span className={`hc-fc-util-chip hc-ut-${utilTone(fleetRate)}`} title={t('util.fleetHint')}>{t('util.fleet', { pct: `\u2066${fleetRate}%\u2069` })}</span>}
        </div>
        <input type="search" className="hc-input !mt-0" placeholder={t('search')} aria-label={t('search')} value={search} onChange={e => setSearch(e.target.value)} />
        <div role="group" aria-label={t('sort.label')} className="hc-hgs-sort hc-fc-sort">
          {UTIL_SORTS.map(option => <button key={option} type="button" aria-pressed={sort === option} onClick={() => setSort(option)}>{t(`sort.${option}`)}</button>)}
        </div>
      </div>

      <p className="hc-fc-hint" aria-live="polite">
        {selection && !selection.end && selectedCar
          ? <>{t('pickEndDate', { date: formatDay(selection.start, locale) })} <button type="button" className="hc-fc-linkbtn" onClick={() => setSelection(null)}>{t('clearSelection')}</button></>
          : t('hint')}
      </p>

      {failed ? (
        <div role="alert" className="hc-bk-state surface-depth">
          <p>{t('loadError')}</p>
          <Button onClick={() => setReload(n => n + 1)}>{t('retry')}</Button>
        </div>
      ) : (
        <div ref={board} className="hc-fc-board surface-depth" aria-busy={loading}>
          <div className="hc-fc-grid" style={{ '--days': days } as React.CSSProperties}>
            <div className="hc-fc-head">
              <div className="hc-fc-corner">{loading ? '' : t('carCount', { count: rows.length })}</div>
              <div className="hc-fc-days">
                {dates.map((date, i) => (
                  <div key={date} className={`hc-fc-day${isWeekend(date) ? ' is-weekend' : ''}${i === todayIndex ? ' is-today' : ''}`}>
                    <small>{weekday(date)}</small>
                    <b className="hc-num">{i + 1}</b>
                  </div>
                ))}
              </div>
            </div>

            {loading ? (
              [0, 1, 2, 3, 4, 5].map(i => <div key={i} className="hc-fc-row is-bone"><div className="hc-fc-car"><span className="hc-bk-bone" /></div><div className="hc-fc-track" /></div>)
            ) : rows.length === 0 ? (
              <div className="hc-fc-empty"><p>{t('noVehicles')}</p><small>{t('noVehiclesHint')}</small></div>
            ) : rows.map(car => {
              const laned = laneBars(barsByCar.get(car.id) ?? []);
              const lanes = Math.max(1, ...laned.map(entry => entry.lane + 1));
              const tone = carStatusTone(car.status);
              const picking = selection?.carId === car.id ? selection : null;
              return (
                <div key={car.id} className="hc-fc-row" data-car={car.id} style={{ '--lanes': lanes } as React.CSSProperties}>
                  <button type="button" className="hc-fc-car" onClick={() => setHistoryCar(car)} title={t('history.open', { plate: car.plate })}>
                    <PlateChip plate={car.plate} />
                    <span className="hc-fc-car-model"><bdi dir="auto">{car.model}</bdi></span>
                    <span className="hc-fc-car-foot">
                      <span className={`hc-fc-chip hc-st-${tone}`}><i aria-hidden="true" />{t(`tiles.${car.status}`)}</span>
                      <UtilMeter value={utilization ? utilization.get(car.id) ?? null : undefined} />
                    </span>
                  </button>
                  <div className="hc-fc-track">
                    {dates.map((date, i) => {
                      const inRange = picking && (picking.end ? date >= picking.start && date <= picking.end : date === picking.start);
                      return (
                        <div key={date} className={`hc-fc-cell${isWeekend(date) ? ' is-weekend' : ''}${i === todayIndex ? ' is-today' : ''}${inRange ? ' is-picked' : ''}`}
                          onMouseDown={e => e.stopPropagation()} onClick={e => pickDay(car, date, e.currentTarget)} />
                      );
                    })}
                    {todayIndex >= 0 && <span className="hc-fc-now" aria-hidden="true" style={{ '--at': todayIndex + 0.5 } as React.CSSProperties} />}
                    {laned.map(({ bar, lane }) => {
                      const span = barSpan(bar, month);
                      if (!span) return null;
                      const isFlagged = bar.bookingId != null && flagged.has(bar.bookingId);
                      const label = bar.customer ?? (bar.note || t(`legend.${bar.status}`));
                      return (
                        <button
                          key={bar.key}
                          type="button"
                          data-bar={bar.key}
                          className={`hc-fc-bar hc-st-${bar.status}${isFlagged ? ' is-flagged' : ''}${span.clippedStart ? ' is-cut-start' : ''}${span.clippedEnd ? ' is-cut-end' : ''}${popover?.bar.key === bar.key ? ' is-active' : ''}`}
                          style={{ '--from': span.from, '--to': span.to, '--lane': lane } as React.CSSProperties}
                          aria-label={t('bar.label', { status: t(`legend.${bar.status}`), who: bar.customer ?? bar.bookingNumber ?? label, from: formatDay(bar.start, locale), to: formatDay(bar.end, locale) })}
                          aria-haspopup="dialog"
                          onMouseDown={e => e.stopPropagation()}
                          onClick={e => openBar(bar, car, e.currentTarget, true)}
                          onMouseEnter={e => hoverBar(bar, car, e.currentTarget)}
                          onMouseLeave={leaveBar}
                        >
                          <span><bdi dir="auto">{label}</bdi></span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {popover && (
        <BarCard
          key={popover.bar.key}
          popover={popover}
          flagged={popover.bar.bookingId != null && flagged.has(popover.bar.bookingId)}
          bookingsRoute={bookingsRoute}
          onClose={() => setPopover(null)}
          onHoverKeep={() => window.clearTimeout(hoverTimer.current)}
          onHoverLeave={leaveBar}
          onHistory={() => { const car = popover.car; setPopover(null); setHistoryCar(car); }}
          onChanged={message => { setPopover(null); say(message); setReload(n => n + 1); }}
          onFailed={message => say(message, true)}
        />
      )}

      {selection?.end && selection.anchor && selectedCar && (
        <Floating anchor={selection.anchor} width={260} label={t('menu.title', { from: formatDay(selection.start, locale), to: formatDay(selection.end, locale) })} className="hc-fc-menu">
          <p className="hc-fc-menu-title">
            <PlateChip plate={selectedCar.plate} />
            <span>{t('menu.title', { from: formatDay(selection.start, locale), to: formatDay(selection.end, locale) })}</span>
          </p>
          {bookingsRoute && (
            <button type="button" className="hc-fc-menu-item hc-st-booked" onClick={() => navigate(`${bookingsRoute}?new=1&car_id=${selection.carId}&start_date=${selection.start}&end_date=${selection.end}`)}>
              <i aria-hidden="true" />{t('menu.addBooking')}
            </button>
          )}
          {BLOCK_TYPES.map(type => (
            <button key={type} type="button" className={`hc-fc-menu-item hc-st-${type}`} disabled={inserting} onClick={() => void insert(type)}>
              <i aria-hidden="true" />{t(`common:carStatus.${type}`)}
            </button>
          ))}
        </Floating>
      )}

      {historyCar && <CarHistoryDrawer car={historyCar} canSeeMoney={canSeeMoney} bookingsRoute={bookingsRoute} onClose={() => setHistoryCar(null)} />}

      {toast && ReactDOM.createPortal(
        <div role="status" className={`hc-toast-in fixed inset-x-3 bottom-6 z-[9400] mx-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-semibold text-white shadow-lg ${toast.bad ? 'bg-[#b42318]' : 'bg-[#0f1117]'}`}>{toast.text}</div>,
        document.body,
      )}
    </div>
  );
};

export default CalendarPage;
