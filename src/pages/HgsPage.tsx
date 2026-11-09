import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button';
import HomeArt from '../components/HomeArt';
import Icon3D from '../components/Icon3D';
import MonthSwitcher from '../components/MonthSwitcher';
import PlateChip from '../components/booking/PlateChip';
import StatusArt from '../components/cars/StatusArt';
import { ComplianceTriangle } from '../components/cars/Compliance';
import { StatTile } from '../components/WalletParts';
import HgsRangePicker, { CalendarIcon } from '../components/hgs/HgsRangePicker';
import HgsStatementDialog from '../components/hgs/HgsStatementDialog';
import { usePageAccess } from '../contexts/PageAccessContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTileFilter } from '../hooks/useTileFilter';
import { useMoney } from '../hooks/useMoney';
import { RateNote } from '../components/Money';
import { formatPlate } from '../lib/custodyExpense';
import {
  HGS_FILTERS, HGS_SORTS, barcodeProblem, carParam, carParamKey, formatCount, hgsRowMatches, hgsRows, hgsTiles, idleRows, inPeriod,
  periodDays, periodKey, rangeLabel, rangedRow, readRange, readSort, sortHgsRows, transitDate, transitPlace, transitTime,
  type DayRange, type HgsCar, type HgsPeriod, type HgsRow, type HgsSort, type HgsTransit,
} from '../lib/hgs';
import { ALL_MONTHS, currentMonth, readMonth, shiftMonth } from '../lib/pendingInvoices';
import { getHgsCarTransits, getHgsCars, getHgsLastSync, getHgsTransits, importHgsPortalFile, saveHgsBarcode, type HgsCarTransit, type PortalImportResult } from '../lib/queries/hgs';
import { isPortalFile, readPortalFile } from '../lib/hgsPortal';
import { istanbulDate } from '../lib/istanbulTime';
import { useTimeFormat } from '../lib/relative-time';
import { formatDateDisplay, useDateLocale } from './AccountingPage';

/**
 * HGS (الطرق السريعة): what each car's toll tag cost, month by month. Finance only,
 * through the `hgs` page key. The banner names the active cars with no tag, whose
 * tolls are going untracked, and lets finance type the missing barcode in.
 */

interface HgsData {
  cars: HgsCar[];
  transits: HgsTransit[];
  lastSync: string | null;
}

const TOAST_MS = 3200;
/** Chips in the banner before "+N more", which shows the rest in the list. A phone fits one per line. */
const BANNER_CHIPS = { wide: 12, narrow: 5 };
const LTR = (text: string) => `⁦${text}⁩`;

const RefreshIcon: React.FC<{ spinning: boolean }> = ({ spinning }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={spinning ? 'animate-spin' : undefined}>
    <path d="M20 12a8 8 0 11-2.34-5.66M20 4v4.5h-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Chevron: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-hgs-chevron">
    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const percent = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);

// ─── Transits of one car ──────────────────────────────────────────────────────

const PdfIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H7.5A1.5 1.5 0 006 4.5v15A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5V7l-4-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M14 3v4h4M9 13h6M9 16.5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** The statement's days to start from: the period on screen, up to today; for all time, from the first transit. */
function statementStart(period: HgsPeriod, items: readonly HgsCarTransit[]): DayRange {
  const today = istanbulDate();
  const days = periodDays(period);
  if (days) return { from: days.from > today ? today : days.from, to: days.to > today ? today : days.to };
  const first = items.length ? transitDate(items[items.length - 1].transit_datetime) : today;
  return { from: first, to: today };
}

const CarTransits: React.FC<{ id: string; row: HgsRow; period: HgsPeriod; onAddBarcode: (() => void) | null; onExported: (fileName: string) => void }> = ({ id, row, period, onAddBarcode, onExported }) => {
  const { format: formatMoney } = useMoney();
  const { t } = useTranslation('hgs');
  const locale = useDateLocale();
  const [items, setItems] = useState<HgsCarTransit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = periodKey(period);
  // The period is read through its key, so a new object for the same days doesn't fetch again.
  const latest = useRef(period);
  latest.current = period;

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setFailed(false);
    getHgsCarTransits(row.carId, row.plate, latest.current)
      .then(data => { if (!cancelled) setItems(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [row.carId, row.plate, key, attempt]);

  const [exporting, setExporting] = useState(false);

  return (
    <div id={id} className="hc-hgs-panel">
      {onAddBarcode && (
        <div className="hc-hgs-panel-bar">
          <span>{t('transits.noBarcode')}</span>
          <Button variant="secondary" onClick={onAddBarcode}>{t('transits.addBarcode')}</Button>
        </div>
      )}
      {failed ? (
        <div role="alert" className="hc-hgs-panel-note">
          {t('transits.failed')}
          <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{t('transits.retry')}</Button>
        </div>
      ) : items === null ? (
        <div role="status" aria-label={t('transits.loading')} className="hc-hgs-bones">
          {[0, 1, 2].map(i => <span key={i} className="hc-bk-bone" />)}
        </div>
      ) : (
        <>
        <div className="hc-hgs-panel-tools">
          <span>{items.length === 0 ? t('transits.empty') : t('transits.count', { count: items.length, n: formatCount(items.length) })}</span>
          <button type="button" className="hc-hgs-export" aria-haspopup="dialog" onClick={() => setExporting(true)}><PdfIcon />{t('pdf.export')}</button>
        </div>
        {items.length > 0 && <ol className="hc-hgs-transits">
          {items.map(item => {
            const place = transitPlace(item);
            const road = item.otoyol?.trim();
            return (
              <li key={item.id}>
                <span className="hc-hgs-t-date">
                  {formatDateDisplay(transitDate(item.transit_datetime), locale)}
                  <small dir="ltr" className="hc-num">{transitTime(item.transit_datetime)}</small>
                </span>
                <span className="hc-hgs-t-route" title={item.description ?? undefined}><bdi dir="ltr">{place}</bdi></span>
                <span className="hc-hgs-t-who">
                  {item.road_type === 'private' || item.road_type === 'public'
                    ? <span className={`hc-pill ${item.road_type === 'private' ? 'is-blue' : 'is-old'}`}>{t(`transits.road_${item.road_type}`)}</span>
                    : null}
                  {road && road !== place && <small><bdi dir="ltr">{road}</bdi></small>}
                </span>
                <b className="hc-hgs-t-amount"><bdi dir="ltr" className="hc-money-mono">{formatMoney(item.amount)}</bdi></b>
              </li>
            );
          })}
        </ol>}
        </>
      )}
      {exporting && items && (
        <HgsStatementDialog
          carId={row.carId}
          plate={row.plate}
          model={row.model}
          initialRange={statementStart(period, items)}
          onClose={() => setExporting(false)}
          onDone={name => { setExporting(false); onExported(name); }}
        />
      )}
    </div>
  );
};

// ─── The portal file ──────────────────────────────────────────────────────────

/** What the last upload on a car came to, or why it didn't go. */
type UploadState =
  | { kind: 'busy' }
  | { kind: 'done'; result: PortalImportResult; undated: number }
  | { kind: 'error'; message: string };

const UploadIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/** One .xlsx exported from hgsmusteri.ptt.gov.tr for this car, sent to `import_hgs_portal_file`. */
const PortalUpload: React.FC<{ plate: string; state: UploadState | undefined; onState: (next: UploadState | undefined) => void }> = ({ plate, state, onState }) => {
  const { t } = useTranslation('hgs');
  const input = useRef<HTMLInputElement>(null);
  const busy = state?.kind === 'busy';

  const send = async (file: File) => {
    if (!isPortalFile(file)) { onState({ kind: 'error', message: t('upload.errors.type') }); return; }
    onState({ kind: 'busy' });
    let parsed;
    try {
      parsed = await readPortalFile(file, plate);
    } catch {
      onState({ kind: 'error', message: t('upload.errors.read') });
      return;
    }
    if (parsed.sheets.length === 0) { onState({ kind: 'error', message: t('upload.errors.notPortal') }); return; }
    if (parsed.rows.length === 0) { onState({ kind: 'error', message: t('upload.errors.empty') }); return; }
    try {
      onState({ kind: 'done', result: await importHgsPortalFile(plate, parsed.rows, file.name), undated: parsed.undated });
    } catch {
      onState({ kind: 'error', message: t('upload.errors.failed') });
    }
  };

  return (
    <>
      <button type="button" className="hc-hgs-upload" onClick={() => input.current?.click()} disabled={busy} aria-busy={busy} aria-label={`${t('upload.button')} · ${formatPlate(plate)}`} title={t('upload.button')}>
        {busy ? <span className="hc-hgs-upload-spin" aria-hidden="true" /> : <UploadIcon />}
        <span className="hc-hgs-upload-label">{busy ? t('upload.busy') : t('upload.button')}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void send(file); }}
      />
    </>
  );
};

const UploadResult: React.FC<{ state: UploadState; onDismiss: () => void }> = ({ state, onDismiss }) => {
  const { format: formatMoney } = useMoney();
  const { t } = useTranslation('hgs');
  if (state.kind === 'busy') return null;
  return (
    <div className={`hc-hgs-result ${state.kind === 'error' || !state.result.car_matched ? 'is-bad' : 'is-good'}`} role={state.kind === 'error' ? 'alert' : 'status'}>
      <div className="min-w-0">
        {state.kind === 'error' ? <p>{state.message}</p> : (
          <>
            <p>{t('upload.done', { inserted: formatCount(state.result.inserted), skipped: formatCount(state.result.skipped_duplicates), total: LTR(formatMoney(state.result.total_amount)) })}</p>
            {!state.result.car_matched && <p className="hc-hgs-result-warn">{t('upload.noCar')}</p>}
            {state.undated > 0 && <p className="hc-hgs-result-note">{t('upload.undated', { count: state.undated })}</p>}
          </>
        )}
      </div>
      <button type="button" className="hc-hgs-result-close" onClick={onDismiss} aria-label={t('upload.dismiss')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
};

// ─── One car ──────────────────────────────────────────────────────────────────

const CarCard: React.FC<{
  row: HgsRow; period: HgsPeriod; range: DayRange | null; onRange: (next: DayRange | null) => void;
  open: boolean; onToggle: () => void; onAddBarcode: (() => void) | null;
  upload: UploadState | undefined; onUpload: (next: UploadState | undefined) => void; onExported: (fileName: string) => void;
}> = ({ row, period, range, onRange, open, onToggle, onAddBarcode, upload, onUpload, onExported }) => {
  const { format: formatMoney } = useMoney();
  const { t } = useTranslation('hgs');
  const locale = useDateLocale();
  const panelId = useId();
  const share = percent(row.share);
  return (
    <li className={`hc-hgs-card surface-depth ${open ? 'is-open' : ''} ${range ? 'is-ranged' : ''}`} data-car={row.key}>
      <div className="hc-hgs-line">
      <button type="button" className="hc-hgs-row" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="hc-hgs-car">
          <StatusArt name="total" className="hc-hgs-car-art" />
          <span className="hc-hgs-car-text">
            <PlateChip plate={row.plate} />
            <span className="hc-hgs-model"><bdi dir="auto">{row.model ?? t('row.noModel')}</bdi></span>
          </span>
        </span>
        <span className="hc-hgs-barcode">{row.barcode ? <bdi dir="ltr">{row.barcode}</bdi> : t('row.noBarcode')}</span>
        <span className="hc-hgs-stat"><small>{t('row.transits')}</small><b className="hc-num">{formatCount(row.transits)}</b></span>
        <span className="hc-hgs-stat"><small>{t('row.last')}</small><b>{row.last ? formatDateDisplay(transitDate(row.last), locale) : '—'}</b></span>
        <span className="hc-hgs-amount">
          <b><bdi dir="ltr" className="hc-money-mono">{formatMoney(row.amount)}</bdi></b>
          <span className="hc-hgs-share">
            <span role="img" aria-label={t('row.share', { pct: share })} className="hc-hgs-bar"><i style={{ inlineSize: `${Math.min(row.share * 100, 100)}%` }} /></span>
            <small dir="ltr">{share}</small>
          </span>
        </span>
        <Chevron />
      </button>
      <div className="hc-hgs-side">
        <HgsRangePicker variant="row" range={range} onChange={onRange} label={t('range.dates')} title={t('range.carTitle', { plate: LTR(formatPlate(row.plate)) })} />
        <PortalUpload plate={row.plate} state={upload} onState={onUpload} />
      </div>
      </div>
      {range && (
        <div className="hc-hgs-range-chip-row">
          <span className="hc-hgs-range-chip">
            <CalendarIcon size={13} />
            <bdi dir="ltr">{rangeLabel(range)}</bdi>
            <button type="button" onClick={() => onRange(null)} aria-label={t('range.clearCar', { plate: LTR(formatPlate(row.plate)) })} title={t('range.clearRow')}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            </button>
          </span>
        </div>
      )}
      {upload && <UploadResult state={upload} onDismiss={() => onUpload(undefined)} />}
      {open && <CarTransits id={panelId} row={row} period={period} onAddBarcode={onAddBarcode} onExported={onExported} />}
    </li>
  );
};

// ─── The barcode sheet ────────────────────────────────────────────────────────

const BarcodeDialog: React.FC<{ car: HgsCar; carsRoute: string | null; onClose: () => void; onSaved: (barcode: string) => void }> = ({ car, carsRoute, onClose, onSaved }) => {
  const { t } = useTranslation('hgs');
  const titleId = useId();
  const [value, setValue] = useState(car.barcode?.trim() ?? '');
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Read while rendering, before the input takes focus, so Esc gives it back to the chip.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => opener?.focus?.(), [opener]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const clean = value.replace(/\s/g, '');
    const problem = barcodeProblem(clean);
    if (problem) { setShown(problem); return; }
    setBusy(true);
    setShown(null);
    try {
      if ((await saveHgsBarcode(car.id, clean)) === 'taken') setShown('taken');
      else onSaved(clean);
    } catch {
      setShown('failed');
    } finally {
      setBusy(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-[rgba(15,17,23,0.45)] p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} noValidate onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }} className="hc-cash-dialog hc-hgs-dialog surface-depth surface-float">
        <h2 id={titleId}>{t('fix.title')}</h2>
        <div className="hc-hgs-dialog-car"><PlateChip plate={car.plate} /><bdi dir="auto">{car.model ?? t('row.noModel')}</bdi></div>
        <label className="hc-cash-field">
          <span className="text-[13px] font-semibold text-gray-700">{t('fix.label')}</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input autoFocus dir="ltr" inputMode="numeric" autoComplete="off" maxLength={14} value={value} disabled={busy} aria-invalid={!!shown && shown !== 'failed'} onChange={e => { setValue(e.target.value); setShown(null); }} className="hc-input !mt-0 hc-hgs-barcode-input" placeholder="0000000000" />
        </label>
        {shown && <p role="alert" className="hc-cash-miss">{t(`fix.errors.${shown}`)}</p>}
        <div className="hc-hgs-dialog-actions">
          {carsRoute ? <Link to={`${carsRoute}?car=${car.id}`} className="hc-hgs-link">{t('fix.openCar')}</Link> : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>{t('fix.cancel')}</Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? t('fix.saving') : t('fix.save')}</Button>
          </div>
        </div>
      </form>
    </div>,
    document.body,
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const HgsPage: React.FC = () => {
  const { format: formatMoney } = useMoney();
  const { t } = useTranslation('hgs');
  const locale = useDateLocale();
  const { relative } = useTimeFormat();
  const { pages, canAccessPage } = usePageAccess();
  const [params, setParams] = useSearchParams();
  const month = readMonth(params.get('month'));
  const allMonths = month === ALL_MONTHS;
  const lastMonth = useRef(allMonths ? currentMonth() : month);
  if (!allMonths) lastMonth.current = month;
  const globalRange = readRange(params.get('from'), params.get('to'));
  /** The page's period: the range when one is set, else the month. */
  const period: HgsPeriod = globalRange ?? month;
  const carValue = params.get('car');
  const carRange = carValue ? readRange(params.get('cfrom'), params.get('cto')) : null;
  const rangedKey = carValue && carRange ? carParamKey(carValue) : null;
  const [filter, setFilter] = useTileFilter(HGS_FILTERS);
  const sort = readSort(params.get('sort'));
  const setSort = (next: HgsSort) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (next === 'amount') updated.delete('sort');
    else updated.set('sort', next);
    return updated;
  }, { replace: true });

  const [data, setData] = useState<HgsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [fixing, setFixing] = useState<HgsCar | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** The last portal upload on each car, by row key. */
  const [uploads, setUploads] = useState<Record<string, UploadState | undefined>>({});
  const [, setTick] = useState(0);
  const loadId = useRef(0);
  const toastTimer = useRef(0);

  const routeOf = (key: string) => (canAccessPage(key) ? pages.find(p => p.key === key)?.route ?? null : null);
  const carsRoute = routeOf('cars');

  const load = useCallback(async () => {
    const id = ++loadId.current;
    setRefreshing(true);
    try {
      const [cars, transits, lastSync] = await Promise.all([getHgsCars(), getHgsTransits(), getHgsLastSync()]);
      if (id !== loadId.current) return;
      setData({ cars, transits, lastSync });
      setFailed(false);
    } catch {
      if (id === loadId.current) setFailed(true);
    } finally {
      if (id === loadId.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { loadId.current += 1; };
  }, [load]);

  // "Last sync: 5 min ago" stays true while the page sits open.
  useEffect(() => {
    const id = window.setInterval(() => setTick(n => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const setMonth = (next: string) => setParams(current => {
    const updated = new URLSearchParams(current);
    updated.delete('from');
    updated.delete('to');
    if (next === currentMonth()) updated.delete('month');
    else updated.set('month', next);
    return updated;
  }, { replace: true });

  /** Every car's range, in place of the month. Cleared, the page goes back to this month. */
  const setGlobalRange = (next: DayRange | null) => setParams(current => {
    const updated = new URLSearchParams(current);
    updated.delete('month');
    if (next) { updated.set('from', next.from); updated.set('to', next.to); } else { updated.delete('from'); updated.delete('to'); }
    return updated;
  }, { replace: true });

  /** One car's own range; one car at a time, so a range on another car replaces it. */
  const setCarRange = (row: HgsRow, next: DayRange | null) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (next) { updated.set('car', carParam(row)); updated.set('cfrom', next.from); updated.set('cto', next.to); } else { updated.delete('car'); updated.delete('cfrom'); updated.delete('cto'); }
    return updated;
  }, { replace: true });

  const cars = useMemo(() => data?.cars ?? [], [data]);
  const transits = useMemo(() => data?.transits ?? [], [data]);
  const periodId = periodKey(period);
  const carRangeId = carRange ? periodKey(carRange) : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the period is followed through its key
  const tiles = useMemo(() => hgsTiles(cars, transits, period), [cars, transits, periodId]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseRows = useMemo(() => hgsRows(cars, transits.filter(row => inPeriod(row, period))), [cars, transits, periodId]);
  /** The banner and the "without transits" tile follow the page's period, never one car's range. */
  const idle = useMemo(() => idleRows(baseRows), [baseRows]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => (rangedKey && carRange ? baseRows.map(row => (row.key === rangedKey ? rangedRow(row, cars, transits, carRange) : row)) : baseRows), [baseRows, rangedKey, carRangeId, cars, transits]);
  const idleKeys = useMemo(() => new Set(idle.map(row => row.key)), [idle]);
  const chipCount = useMediaQuery('(min-width: 640px)') ? BANNER_CHIPS.wide : BANNER_CHIPS.narrow;
  const shown = useMemo(
    () => sortHgsRows(rows.filter(row => hgsRowMatches(row, search) && (filter === 'used' ? row.transits > 0 : filter === 'idle' ? idleKeys.has(row.key) : true)), sort),
    [rows, search, filter, sort, idleKeys],
  );

  // A banner chip opens its car in the list below and brings it into view.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const showCar = (key: string) => {
    setSearch('');
    if (filter === 'used') setFilter('all');
    setOpen(current => new Set(current).add(key));
    setFocusKey(key);
  };
  // A link that came in with one car's range opens that car, once the list is there. Only on arrival.
  const sharedKey = useRef(rangedKey);
  useEffect(() => {
    const key = sharedKey.current;
    if (!data || !key) return;
    sharedKey.current = null;
    if (rows.some(row => row.key === key)) showCar(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    if (!focusKey) return;
    const card = Array.from(document.querySelectorAll<HTMLElement>('.hc-hgs-card[data-car]')).find(el => el.dataset.car === focusKey);
    if (!card) return;
    card.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    card.querySelector<HTMLElement>('.hc-hgs-row')?.focus({ preventScroll: true });
    setFocusKey(null);
  }, [focusKey, shown]);

  const monthName = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const loading = data === null;
  const value = (text: string) => (loading ? null : text);
  const previous = monthName(shiftMonth(currentMonth(), -1));
  const deltaPct = tiles.delta === null ? null : Math.round(tiles.delta * 100);
  const delta = deltaPct === null
    ? t('tiles.noLastMonth', { month: previous })
    : deltaPct === 0
      ? t('tiles.sameAs', { month: previous })
      : t('tiles.delta', { pct: LTR(`${deltaPct > 0 ? '+' : '−'}${Math.abs(deltaPct)}%`), month: previous });

  const toggle = (key: string) => setOpen(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const showToast = (text: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  };

  const onBarcodeSaved = (car: HgsCar, barcode: string) => {
    setFixing(null);
    setData(current => (current ? { ...current, cars: current.cars.map(c => (c.id === car.id ? { ...c, barcode } : c)) } : current));
    window.clearTimeout(toastTimer.current);
    setToast(t('fix.saved', { plate: LTR(formatPlate(car.plate)) }));
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  };

  if (failed && !data) {
    return (
      <div className="hc-pi hc-hgs">
        <div role="alert" className="hc-bk-state surface-depth">
          <p>{t('failed')}</p>
          <Button onClick={() => void load()}>{t('retry')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="hc-pi hc-hgs">
      <header className="hc-pi-head">
        <div>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <div className="hc-hgs-sync">
          <span aria-live="polite">{loading ? '' : data.lastSync ? t('sync.last', { when: relative(data.lastSync) }) : t('sync.never')}</span>
          <Button variant="secondary" onClick={() => void load()} disabled={refreshing} aria-busy={refreshing}>
            <RefreshIcon spinning={refreshing} />{refreshing && !loading ? t('sync.refreshing') : t('sync.refresh')}
          </Button>
        </div>
      </header>
      {failed && data && <p role="alert" className="hc-hgs-warn">{t('refreshFailed')}</p>}

      {!loading && idle.length > 0 && (
        <section className="hc-hgs-banner" aria-labelledby="hgs-banner-title">
          <ComplianceTriangle severity="expired" size={48} className="hc-hgs-banner-art" />
          <div className="min-w-0">
            <h2 id="hgs-banner-title">
              {globalRange
                ? t(globalRange.from === globalRange.to ? 'banner.day' : 'banner.range', { count: idle.length, range: LTR(rangeLabel(globalRange)) })
                : allMonths
                ? t('banner.ever', { count: idle.length })
                : month === currentMonth()
                  ? t('banner.thisMonth', { count: idle.length })
                  : t('banner.month', { count: idle.length, month: monthName(month) })}
            </h2>
            <ul className="hc-hgs-chips">
              {idle.slice(0, chipCount).map(row => (
                <li key={row.key}>
                  <button type="button" className="hc-hgs-chip" title={t('banner.open', { plate: formatPlate(row.plate) })} onClick={() => showCar(row.key)}>
                    <PlateChip plate={row.plate} />
                    <bdi dir="auto">{row.model ?? t('row.noModel')}</bdi>
                    {!row.barcode && <span className="hc-hgs-chip-tag">{t('banner.noBarcode')}</span>}
                  </button>
                </li>
              ))}
              {idle.length > chipCount && (
                <li>
                  <button type="button" className="hc-hgs-chip hc-hgs-chip-more" onClick={() => { setSearch(''); if (filter !== 'idle') setFilter('idle'); }}>
                    {t('banner.more', { n: formatCount(idle.length - chipCount) })}
                  </button>
                </li>
              )}
            </ul>
          </div>
        </section>
      )}

      <div className={`hc-months ${globalRange ? 'is-ranged' : ''}`}>
        <MonthSwitcher
          label={allMonths ? t('month.all') : monthName(month)}
          prevLabel={t('month.prev')}
          nextLabel={t('month.next')}
          disabled={allMonths}
          onPrev={() => setMonth(shiftMonth(month, -1))}
          onNext={() => setMonth(shiftMonth(month, 1))}
        />
        <button type="button" aria-pressed={allMonths && !globalRange} className="hc-pi-all" onClick={() => setMonth(allMonths && !globalRange ? lastMonth.current : ALL_MONTHS)}>{t('month.all')}</button>
        <span className="hc-hgs-range-global">
          <HgsRangePicker variant="global" range={globalRange} onChange={setGlobalRange} label={t('range.global')} title={t('range.globalTitle')} />
          {globalRange && (
            <button type="button" className="hc-hgs-range-x" onClick={() => setGlobalRange(null)} aria-label={t('range.clearGlobal')} title={t('range.clearGlobal')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
            </button>
          )}
        </span>
      </div>

      <div className="hc-tiles hc-tiles-filter hc-bk-tiles hc-hgs-tiles">
        <StatTile tone="balance" art={<HomeArt name="wallet" className="hc-tile-art" />} label={t('tiles.spend')} sub={globalRange ? LTR(rangeLabel(globalRange)) : allMonths ? t('month.all') : monthName(month)} value={value(formatMoney(tiles.spend))} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        <StatTile tone="received" art={<Icon3D name="total" className="hc-tile-art" />} label={t('tiles.transits')} sub={t('tiles.transitsSub', { count: tiles.used })} value={value(formatCount(tiles.transits))} pressed={filter === 'used'} onPress={() => setFilter('used')} />
        <StatTile tone="paid" art={<StatusArt name="total" className="hc-tile-art" />} label={t('tiles.cars')} sub={t('tiles.carsSub', { n: formatCount(idle.length) })} value={value(formatCount(tiles.carsOnHgs))} pressed={filter === 'idle'} onPress={() => setFilter('idle')} />
        <StatTile tone="warn" art={<HomeArt name="schedule" className="hc-tile-art" />} label={t('tiles.thisMonth')} sub={delta} value={value(formatMoney(tiles.thisMonth))} />
      </div>
      <RateNote className="!mt-0" />

      <div className="hc-bk-tools">
        <input type="search" className="hc-input !mt-0" placeholder={t('tools.search')} aria-label={t('tools.search')} value={search} onChange={e => setSearch(e.target.value)} />
        <div role="group" aria-label={t('tools.sort')} className="hc-hgs-sort">
          {HGS_SORTS.map(option => (
            <button key={option} type="button" aria-pressed={sort === option} onClick={() => setSort(option)}>{t(`tools.sort_${option}`)}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <ul className="hc-hgs-list" aria-busy>
          {[0, 1, 2, 3].map(i => <li key={i} className="hc-hgs-card hc-hgs-skeleton surface-depth"><span className="hc-bk-bone" /><span className="hc-bk-bone" /></li>)}
        </ul>
      ) : shown.length === 0 ? (
        <p className="hc-bk-state surface-depth">{filter === 'used' && !search.trim() ? t('emptyUsed') : filter === 'idle' && !search.trim() ? t('emptyIdle') : t('empty')}</p>
      ) : (
        <>
          <p className="hc-bk-count">{t('count', { shown: formatCount(shown.length), total: formatCount(rows.length) })}</p>
          <ul className="hc-hgs-list">
            {shown.map(row => (
              <CarCard
                key={row.key}
                row={row}
                period={row.key === rangedKey && carRange ? carRange : period}
                range={row.key === rangedKey ? carRange : null}
                onRange={next => setCarRange(row, next)}
                open={open.has(row.key)}
                onToggle={() => toggle(row.key)}
                onAddBarcode={row.active && !row.barcode && row.carId !== null ? () => { const car = cars.find(c => c.id === row.carId); if (car) setFixing(car); } : null}
                upload={uploads[row.key]}
                onUpload={next => setUploads(current => ({ ...current, [row.key]: next }))}
                onExported={name => showToast(t('pdf.done', { name: LTR(name) }))}
              />
            ))}
          </ul>
        </>
      )}

      {fixing && <BarcodeDialog car={fixing} carsRoute={carsRoute} onClose={() => setFixing(null)} onSaved={barcode => onBarcodeSaved(fixing, barcode)} />}

      {toast && ReactDOM.createPortal(
        <div role="status" className="hc-toast-in fixed inset-x-3 bottom-6 z-[9400] mx-auto max-w-sm rounded-2xl bg-[#0f1117] px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</div>,
        document.body,
      )}
    </div>
  );
};

export default HgsPage;
