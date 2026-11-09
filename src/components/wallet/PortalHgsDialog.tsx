import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import PlateChip from '../booking/PlateChip';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { useCurrency } from '../../lib/CurrencyContext';
import { formatLira, type BookingWallet } from '../../lib/bookingWallet';
import {
  PortalHgsUnavailable,
  defaultFrom,
  manualHgsLines,
  postPortalHgs,
  previewPortalHgs,
  transitRoute,
  type PortalHgsPreview,
} from '../../lib/portalHgs';

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);

const usd = (amount: number) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** `2026-11-05T15:53` → `05.11.2026 15:53`, the portal's own way of writing it. */
const stamp = (value: string) => `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}${value.length > 10 ? ` ${value.slice(11, 16)}` : ''}`;
/** Days since a `YYYY-MM-DDTHH:mm` Istanbul stamp. */
const daysSince = (value: string) => Math.floor((Date.now() - Date.parse(`${value.slice(0, 16)}:00+03:00`)) / 86_400_000);
const STALE_DAYS = 3;

/**
 * Charges a booking its HGS from the portal data finance uploaded: a read-only preview
 * of the transits inside the booking not yet charged, then, on confirm, one wallet line
 * per pass. They fold into the wallet's single "HGS" line.
 */
export const PortalHgsDialog: React.FC<{
  entry: BookingWallet;
  onClose: () => void;
  onPosted: (count: number, total: number) => void;
}> = ({ entry, onClose, onPosted }) => {
  const { t } = useTranslation(['wallets', 'common']);
  const locale = useDateLocale();
  const { rates } = useCurrency();
  useBlockedPage();
  const { booking, lines } = entry;
  const start = booking.start_date.slice(0, 10);
  const end = booking.end_date.slice(0, 10);
  const manual = useMemo(() => manualHgsLines(lines), [lines]);
  const [from, setFrom] = useState(() => defaultFrom(lines, start, end));
  const [to, setTo] = useState(end);
  const [preview, setPreview] = useState<PortalHgsPreview | null>(null);
  const [failed, setFailed] = useState<'missing' | 'error' | null>(null);
  const [rate, setRate] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const rateTouched = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const todayRate = rates.find(r => r.currency === 'USD')?.rate_to_try ?? null;

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !posting) { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, posting]);

  useEffect(() => {
    if (!from || !to || from > to) { setPreview(null); return undefined; }
    let active = true;
    setFailed(null);
    previewPortalHgs(booking.id, from, to)
      .then(next => {
        if (!active) return;
        setPreview(next);
        if (!rateTouched.current) {
          const hint = next.rateHint ?? todayRate;
          if (hint) setRate(String(Number(hint.toFixed(2))));
        }
      })
      .catch(reason => { if (active) { setPreview(null); setFailed(reason instanceof PortalHgsUnavailable ? 'missing' : 'error'); } });
    return () => { active = false; };
  }, [booking.id, from, to, todayRate]);

  const rateValue = Number(rate.replace(',', '.'));
  const rateOk = Number.isFinite(rateValue) && rateValue >= 1 && rateValue <= 1000;
  const count = preview?.transits.length ?? 0;

  const post = async () => {
    if (!preview || !rateOk || count === 0 || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const result = await postPortalHgs(booking.id, preview.from, preview.to, rateValue);
      onPosted(result.posted, result.total);
    } catch (reason) {
      setPosting(false);
      setPostError(reason instanceof PortalHgsUnavailable ? t('portalHgs.missing') : t('portalHgs.failed', { reason: reason instanceof Error ? reason.message : String(reason) }));
    }
  };

  const stale = preview?.lastUpload ? daysSince(preview.lastUpload) >= STALE_DAYS : false;

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop hc-cw-layer2" onMouseDown={e => { if (e.target === e.currentTarget && !posting) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="hc-phgs-title" className="hc-ce hc-phgs surface-float">
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <h2 id="hc-phgs-title">{t('portalHgs.title')}</h2>
            <div className="hc-fh-car">
              {booking.plate && <PlateChip plate={booking.plate} />}
              <bdi dir="ltr" className="hc-num">{booking.booking_number ?? `#${booking.id}`}</bdi>
              <span>{formatDay(start, locale)} → {formatDay(end, locale)}</span>
            </div>
          </div>
          <button ref={closeRef} type="button" className="hc-ce-close" onClick={onClose} disabled={posting} aria-label={t('common:actions.close')}><CloseIcon /></button>
        </header>

        <div className="hc-ce-body">
          {failed === 'missing' ? (
            <p role="alert" className="hc-phgs-note is-bad">{t('portalHgs.missing')}</p>
          ) : (
            <>
              {preview && (
                <p className={`hc-phgs-note ${!preview.lastUpload || stale ? 'is-warn' : ''}`}>
                  {preview.lastUpload
                    ? t('portalHgs.lastUpload', { plate: preview.plate ?? booking.plate ?? '', uploaded: stamp(preview.lastUpload), transit: preview.lastTransit ? stamp(preview.lastTransit.slice(0, 10)) : '—' })
                    : t('portalHgs.noData', { plate: preview.plate ?? booking.plate ?? '' })}
                  {stale && <> {t('portalHgs.stale')}</>}
                </p>
              )}

              {manual.length > 0 && (
                <div className="hc-phgs-note is-warn">
                  <p>{t('portalHgs.manual', { count: manual.length })}</p>
                  <ul>{manual.map(line => <li key={line.id}><bdi dir="auto">{line.description || t('kinds.hgs')}</bdi> · <bdi dir="ltr" className="hc-num">{formatLira(line.amount)}</bdi></li>)}</ul>
                </div>
              )}

              <section className="hc-ce-section surface-depth">
                <div className="hc-phgs-period">
                  <label className="hc-ce-field">
                    <span className="hc-field-label">{t('portalHgs.from')}</span>
                    <input type="date" dir="ltr" className="hc-input" value={from} min={start} max={to || end} onChange={e => setFrom(e.target.value)} disabled={posting} />
                  </label>
                  <label className="hc-ce-field">
                    <span className="hc-field-label">{t('portalHgs.to')}</span>
                    <input type="date" dir="ltr" className="hc-input" value={to} min={from || start} max={end} onChange={e => setTo(e.target.value)} disabled={posting} />
                  </label>
                  <label className="hc-ce-field">
                    <span className="hc-field-label">{t('portalHgs.rate')}</span>
                    <input dir="ltr" inputMode="decimal" className={`hc-input ${rate && !rateOk ? 'is-invalid' : ''}`} value={rate} disabled={posting}
                      onChange={e => { rateTouched.current = true; setRate(e.target.value); }} />
                  </label>
                </div>
                <p className="mt-2 text-[12px] text-black/50">{t('portalHgs.periodHint')}</p>
              </section>

              {failed === 'error' ? (
                <p role="alert" className="hc-phgs-note is-bad">{t('portalHgs.loadError')}</p>
              ) : !preview ? (
                <div className="hc-ce-state" role="status"><span className="hc-ce-spinner" aria-hidden="true" /></div>
              ) : (
                <section className="hc-ce-section surface-depth" aria-label={t('portalHgs.previewTitle')}>
                  <header className="hc-phgs-sum">
                    <strong>{t('portalHgs.count', { count })}</strong>
                    <span><bdi dir="ltr" className="hc-num hc-money-mono">{formatLira(preview.total)}</bdi>{rateOk && <> · <bdi dir="ltr" className="hc-num hc-money-mono">{usd(preview.total / rateValue)}</bdi></>}</span>
                  </header>
                  {count === 0 ? (
                    <p className="text-[13px] text-black/55">{preview.postedCount > 0 ? t('portalHgs.allPosted', { count: preview.postedCount }) : t('portalHgs.none')}</p>
                  ) : (
                    <ul className="hc-phgs-list">
                      {preview.transits.map(transit => (
                        <li key={transit.id}>
                          <span className="hc-num shrink-0 text-black/55" dir="ltr">{stamp(transit.at)}</span>
                          <bdi dir="ltr" className="min-w-0 flex-1 truncate">{transitRoute(transit)}</bdi>
                          <bdi dir="ltr" className="hc-num hc-money-mono shrink-0 font-semibold">{formatLira(transit.amount)}</bdi>
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview.investorCount > 0 && <p className="hc-phgs-note is-warn mt-3">{t('portalHgs.investor', { count: preview.investorCount, total: formatLira(preview.investorTotal) })}</p>}
                  {preview.postedCount > 0 && count > 0 && <p className="mt-3 text-[12px] text-black/50">{t('portalHgs.alreadyPosted', { count: preview.postedCount })}</p>}
                </section>
              )}
            </>
          )}
        </div>

        <footer className="hc-ce-foot">
          {postError ? <p role="alert" className="hc-ce-save-error">{postError}</p> : <span />}
          <Button variant="secondary" onClick={onClose} disabled={posting}>{t('common:actions.cancel')}</Button>
          <Button onClick={post} disabled={!preview || count === 0 || !rateOk || posting} aria-busy={posting}>
            {posting ? t('portalHgs.posting') : t('portalHgs.confirm', { count })}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

export default PortalHgsDialog;
