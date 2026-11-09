import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { formatLira, type BookingWallet } from '../../lib/bookingWallet';
import {
  applyPortalHgs,
  getPortalFreshness,
  manualHgsLines,
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

/**
 * Charges a booking its HGS from the portal data finance uploaded, in lira only: a
 * preview of the booking's not-yet-charged transits from the chosen day, then, on
 * confirm, `apply_customer_hgs`. The lines fold into the wallet's single HGS line.
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
  const [transits, setTransits] = useState<PortalTransit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [freshness, setFreshness] = useState<PortalFreshness | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !applying) { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, applying]);

  useEffect(() => {
    if (booking.car_id == null) return undefined;
    let active = true;
    getPortalFreshness(booking.car_id).then(next => { if (active) setFreshness(next); }).catch(() => { if (active) setFreshness({ lastUpload: null, lastTransit: null }); });
    return () => { active = false; };
  }, [booking.car_id]);

  // Read again on open and whenever From changes; an out-of-range day is held back.
  useEffect(() => {
    if (!from || from < start || from > end) return undefined;
    let active = true;
    setTransits(null);
    setFailed(false);
    previewPortalHgs(booking.id, from === start ? null : from)
      .then(next => { if (active) setTransits(next); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [booking.id, from, start, end]);

  const count = transits?.length ?? 0;
  const total = transitsTotal(transits ?? []);
  const stale = freshness?.lastUpload ? Date.now() - Date.parse(freshness.lastUpload) >= STALE_DAYS * 86_400_000 : false;

  const apply = async () => {
    if (!transits || count === 0 || applying) return;
    setApplying(true);
    setApplyError(null);
    try {
      const result = await applyPortalHgs(booking.id, from === start ? null : from);
      onPosted(result.count, result.total);
    } catch (reason) {
      setApplying(false);
      setApplyError(t('portalHgs.failed', { reason: reason instanceof Error ? reason.message : String(reason) }));
    }
  };

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop hc-cw-layer2" onMouseDown={e => { if (e.target === e.currentTarget && !applying) onClose(); }}>
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
              <label className="hc-ce-field">
                <span className="hc-field-label">{t('portalHgs.from')}</span>
                <input type="date" dir="ltr" className="hc-input" value={from} min={start} max={end} disabled={applying}
                  onChange={e => setFrom(e.target.value || start)} />
              </label>
              <div className="hc-ce-field">
                <span className="hc-field-label">{t('portalHgs.to')}</span>
                <div className="hc-ce-locked" aria-readonly="true">{formatDay(end, locale)}</div>
              </div>
            </div>
            <p className="mt-2 text-[12px] text-black/50">{t('portalHgs.periodHint')}</p>
          </section>

          {failed ? (
            <p role="alert" className="hc-phgs-note is-bad">{t('portalHgs.loadError')}</p>
          ) : !transits ? (
            <div className="hc-ce-state" role="status"><span className="hc-ce-spinner" aria-hidden="true" /></div>
          ) : (
            <section className="hc-ce-section surface-depth" aria-label={t('portalHgs.previewTitle')}>
              <header className="hc-phgs-sum">
                <strong>{t('portalHgs.count', { count })}</strong>
                <bdi dir="ltr" className="hc-num hc-money-mono">{formatLira(total)}</bdi>
              </header>
              {count === 0 ? <p className="text-[13px] text-black/55">{t('portalHgs.none')}</p> : (
                <ul className="hc-phgs-list">
                  {transits.map(transit => (
                    <li key={transit.portalId}>
                      <span className="hc-num shrink-0 text-black/55">{formatDay(transit.date, locale)}</span>
                      {/* The note starts with the date, already in its own column. */}
                      <bdi dir="ltr" className="min-w-0 flex-1 truncate">{transit.note.replace(/^\d{2}-\d{2}-\d{4}\s+/, '')}</bdi>
                      <bdi dir="ltr" className="hc-num hc-money-mono shrink-0 font-semibold">{formatLira(transit.amount)}</bdi>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <footer className="hc-ce-foot">
          {applyError ? <p role="alert" className="hc-ce-save-error">{applyError}</p> : <span />}
          <Button variant="secondary" onClick={onClose} disabled={applying}>{t('common:actions.cancel')}</Button>
          <Button onClick={apply} disabled={!transits || count === 0 || applying} aria-busy={applying}>
            {applying ? t('portalHgs.posting') : count === 0 ? t('portalHgs.nothing') : t('portalHgs.confirm', { count, total: formatLira(total) })}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

export default PortalHgsDialog;
