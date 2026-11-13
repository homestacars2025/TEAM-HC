import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import ConfirmDialog from '../custody/ConfirmDialog';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { formatLira, type BookingWallet } from '../../lib/bookingWallet';
import {
  applyPortalHgs,
  getPortalFreshness,
  manualHgsLines,
  outsideBookingTransits,
  previewPortalHgs,
  suggestedFrom,
  transitsTotal,
  type PortalFreshness,
  type PortalTransit,
} from '../../lib/portalHgs';

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);

const ZONE = 'Europe/Istanbul';
/** `05.11.2026 15:53` in Istanbul, the portal's own way of writing it. */
const stamp = (value: string, withTime: boolean) => {
  const at = new Date(value);
  const date = at.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONE });
  return withTime ? `${date} ${at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE })}` : date;
};
const STALE_DAYS = 3;
/** A date being typed reads once it settles, not on every change. */
const PREVIEW_DELAY_MS = 300;

/**
 * Charges a booking its HGS from the portal data finance uploaded, in lira only: a
 * preview of the car's not-yet-charged transits from From to To, both free (only To
 * before From is refused), then, on confirm, `apply_customer_hgs` on the same dates.
 * Rows outside the booking are marked, and charging any of them asks first.
 */
export const PortalHgsDialog: React.FC<{
  entry: BookingWallet;
  onClose: () => void;
  onPosted: (count: number, total: number) => void;
}> = ({ entry, onClose, onPosted }) => {
  const { t } = useTranslation(['wallets', 'common']);
  const locale = useDateLocale();
  useBlockedPage();
  const { booking, lines } = entry;
  const start = booking.start_date.slice(0, 10);
  const end = booking.end_date.slice(0, 10);
  const manual = useMemo(() => manualHgsLines(lines), [lines]);
  const suggestion = useMemo(() => suggestedFrom(lines, start, end), [lines, start, end]);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(end);
  const [transits, setTransits] = useState<PortalTransit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [freshness, setFreshness] = useState<PortalFreshness | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [askOutside, setAskOutside] = useState(false);
  const firstRead = useRef(true);
  const backwards = from > to;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    // While the outside-the-booking question is open, Esc is its own to answer.
    if (askOutside) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !applying) { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, applying, askOutside]);

  useEffect(() => {
    if (booking.car_id == null) return undefined;
    let active = true;
    getPortalFreshness(booking.car_id).then(next => { if (active) setFreshness(next); }).catch(() => { if (active) setFreshness({ lastUpload: null, lastTransit: null }); });
    return () => { active = false; };
  }, [booking.car_id]);

  // Read on open, then again once a changed range settles. To before From reads nothing.
  useEffect(() => {
    let active = true;
    setTransits(null);
    setFailed(false);
    if (backwards) {
      setTransits([]);
      return () => { active = false; };
    }
    const delay = firstRead.current ? 0 : PREVIEW_DELAY_MS;
    firstRead.current = false;
    const timer = window.setTimeout(() => {
      previewPortalHgs(booking.id, from, to)
        .then(next => { if (active) setTransits(next); })
        .catch(() => { if (active) setFailed(true); });
    }, delay);
    return () => { active = false; window.clearTimeout(timer); };
  }, [booking.id, from, to, backwards]);

  const count = transits?.length ?? 0;
  const total = transitsTotal(transits ?? []);
  const outside = outsideBookingTransits(transits ?? []);
  const outsideTotal = transitsTotal(outside);
  const onOtherBooking = (transits ?? []).filter(transit => transit.otherBooking).length;
  const stale = freshness?.lastUpload ? Date.now() - Date.parse(freshness.lastUpload) >= STALE_DAYS * 86_400_000 : false;

  const apply = async () => {
    if (!transits || count === 0 || applying) return;
    setApplying(true);
    setAskOutside(false);
    setApplyError(null);
    try {
      const result = await applyPortalHgs(booking.id, from, to);
      onPosted(result.count, result.total);
    } catch (reason) {
      setApplying(false);
      setApplyError(t('portalHgs.failed', { reason: reason instanceof Error ? reason.message : String(reason) }));
    }
  };

  const requestApply = () => {
    if (!transits || count === 0 || applying) return;
    if (outside.length > 0) setAskOutside(true);
    else void apply();
  };

  return <>{ReactDOM.createPortal(
    <div className="hc-ce-backdrop hc-cw-layer2" onMouseDown={e => { if (e.target === e.currentTarget && !applying && !askOutside) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="hc-phgs-title" className="hc-ce hc-phgs surface-float">
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <h2 id="hc-phgs-title">
              {t('portalHgs.title')}
              {booking.plate && <> · <bdi dir="ltr" className="hc-num">{booking.plate}</bdi></>}
              {' · '}<bdi dir="ltr" className="hc-num">{booking.booking_number ?? `#${booking.id}`}</bdi>
            </h2>
            <p className="mt-0.5 text-[12.5px] text-black/50">{formatDay(start, locale)} → {formatDay(end, locale)}</p>
          </div>
          <button ref={closeRef} type="button" className="hc-ce-close" onClick={onClose} disabled={applying} aria-label={t('common:actions.close')}><CloseIcon /></button>
        </header>

        <div className="hc-ce-body">
          {freshness && (
            <p className={`hc-phgs-note ${!freshness.lastUpload || stale ? 'is-warn' : ''}`}>
              {freshness.lastUpload
                ? t('portalHgs.lastUpload', { uploaded: stamp(freshness.lastUpload, true), transit: freshness.lastTransit ? stamp(freshness.lastTransit, false) : '—' })
                : t('portalHgs.noData')}
              {stale && <> {t('portalHgs.stale')}</>}
            </p>
          )}

          {manual.length > 0 && (
            <div className="hc-phgs-note is-warn">
              <p>{t('portalHgs.manual', { count: manual.length })}</p>
              <ul>{manual.map(line => <li key={line.id}><bdi dir="auto">{line.description || t('kinds.hgs')}</bdi> · <bdi dir="ltr" className="hc-num">{formatLira(line.amount)}</bdi></li>)}</ul>
              {suggestion && from !== suggestion && (
                <button type="button" className="hc-phgs-suggest" onClick={() => setFrom(suggestion)} disabled={applying}>
                  {t('portalHgs.useSuggested', { date: formatDay(suggestion, locale) })}
                </button>
              )}
            </div>
          )}

          <section className="hc-ce-section surface-depth">
            <div className="hc-phgs-period">
              {/* Hints, not limits: any range reads, and rows outside the booking are marked. */}
              <div className="hc-ce-field">
                <label htmlFor="hc-phgs-from" className="hc-field-label">{t('portalHgs.from')}</label>
                <input id="hc-phgs-from" type="date" dir="ltr" className="hc-input" value={from} disabled={applying}
                  aria-describedby="hc-phgs-from-hint" onChange={e => setFrom(e.target.value || start)} />
                <span id="hc-phgs-from-hint" className="text-[12px] text-black/45">{t('portalHgs.fromHint', { date: formatDay(start, locale) })}</span>
              </div>
              <div className="hc-ce-field">
                <label htmlFor="hc-phgs-to" className="hc-field-label">{t('portalHgs.to')}</label>
                <input id="hc-phgs-to" type="date" dir="ltr" className="hc-input" value={to} disabled={applying}
                  aria-invalid={backwards || undefined} aria-describedby="hc-phgs-to-hint" onChange={e => setTo(e.target.value || end)} />
                <span id="hc-phgs-to-hint" className="text-[12px] text-black/45">{t('portalHgs.toHint', { date: formatDay(end, locale) })}</span>
              </div>
            </div>
            {backwards
              ? <p role="alert" className="mt-2 text-[12.5px] font-medium text-[#B42318]">{t('portalHgs.backwards')}</p>
              : <p className="mt-2 text-[12px] text-black/50">{t('portalHgs.periodHint')}</p>}
          </section>

          {failed ? (
            <p role="alert" className="hc-phgs-note is-bad">{t('portalHgs.loadError')}</p>
          ) : !transits ? (
            <div className="hc-ce-state" role="status"><span className="hc-ce-spinner" aria-hidden="true" /></div>
          ) : (
            <section className="hc-ce-section surface-depth" aria-label={t('portalHgs.previewTitle')}>
              {count === 0 ? <p className="text-[13px] text-black/55">{backwards ? t('portalHgs.backwards') : t('portalHgs.none')}</p> : <>
                <header className="hc-phgs-sum">
                  <strong>{t('portalHgs.count', { count })}</strong>
                  <span aria-hidden="true">·</span>
                  <bdi dir="ltr" className="hc-num hc-money-mono">{formatLira(total)}</bdi>
                  <span aria-hidden="true">·</span>
                  <span className={outside.length > 0 ? 'is-outside' : undefined}>{t('portalHgs.outsideCount', { count: outside.length })}</span>
                </header>
                <ul className="hc-phgs-list">
                  {transits.map(transit => (
                    <li key={transit.portalId}>
                      <span className="hc-num shrink-0 text-black/55">{formatDay(transit.date, locale)}</span>
                      <span className="min-w-0 flex-1">
                        {/* The note starts with the date, already in its own column. */}
                        <bdi dir="ltr" className="block truncate">{transit.note.replace(/^\d{2}-\d{2}-\d{4}\s+/, '')}</bdi>
                        {(transit.outsideBooking || transit.otherBooking) && (
                          <span className="hc-phgs-pills">
                            {transit.outsideBooking && <span className="hc-phgs-pill is-outside">{t('portalHgs.outside')}</span>}
                            {transit.otherBooking && <span className="hc-phgs-pill is-other">{t('portalHgs.otherBooking', { booking: '\u2068' + transit.otherBooking + '\u2069' })}</span>}
                          </span>
                        )}
                      </span>
                      <bdi dir="ltr" className="hc-num hc-money-mono shrink-0 font-semibold">{formatLira(transit.amount)}</bdi>
                    </li>
                  ))}
                </ul>
              </>}
            </section>
          )}
        </div>

        <footer className="hc-ce-foot">
          {applyError ? <p role="alert" className="hc-ce-save-error">{applyError}</p> : <span />}
          <Button variant="secondary" onClick={onClose} disabled={applying}>{t('common:actions.cancel')}</Button>
          <Button onClick={requestApply} disabled={!transits || count === 0 || applying} aria-busy={applying}>
            {applying ? t('portalHgs.posting') : count === 0 ? t('portalHgs.nothing') : t('portalHgs.confirm', { count, total: formatLira(total) })}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )}
  {askOutside && (
    <ConfirmDialog
      tone="primary"
      title={t('portalHgs.askTitle')}
      body={[
        t('portalHgs.askBody', { count: outside.length, all: count, amount: formatLira(outsideTotal) }),
        onOtherBooking > 0 ? t('portalHgs.askOther', { count: onOtherBooking }) : '',
      ].filter(Boolean).join(' ')}
      confirmLabel={t('portalHgs.confirm', { count, total: formatLira(total) })}
      cancelLabel={t('common:actions.cancel')}
      busy={applying}
      onConfirm={() => { void apply(); }}
      onCancel={() => setAskOutside(false)}
    />
  )}</>;
};

export default PortalHgsDialog;
