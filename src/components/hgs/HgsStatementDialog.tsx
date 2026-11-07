import React, { useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import PlateChip from '../booking/PlateChip';
import { istanbulDate } from '../../lib/istanbulTime';
import { rangeLabel, readRange, type DayRange } from '../../lib/hgs';
import {
  STATEMENT_LANGS, STATEMENT_LANG_NAMES, bookingWindow, defaultStatementLang, statementFileName, statementRows,
  type StatementBooking, type StatementLang,
} from '../../lib/hgsStatement';
import { getHgsStatementTransits, getStatementBookings } from '../../lib/queries/hgs';

/**
 * Asks what goes on an HGS statement (language, days, an optional booking, private
 * roads) and downloads it as a PDF. The PDF code only loads when it's asked for.
 */

interface HgsStatementDialogProps {
  carId: number | null;
  plate: string;
  model: string | null;
  initialRange: DayRange;
  onClose: () => void;
  onDone: (fileName: string) => void;
}

function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari reads the file after the click returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const HgsStatementDialog: React.FC<HgsStatementDialogProps> = ({ carId, plate, model, initialRange, onClose, onDone }) => {
  const { t } = useTranslation('hgs');
  const titleId = useId();
  const today = istanbulDate();
  const [lang, setLang] = useState<StatementLang>('ar');
  const [langChosen, setLangChosen] = useState(false);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [bookings, setBookings] = useState<StatementBooking[] | 'failed' | null>(null);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [includePrivate, setIncludePrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'range' | 'failed' | null>(null);
  const range = readRange(from, to);
  const rangeKey = range ? `${range.from}_${range.to}` : '';

  // Read while rendering, before anything inside takes focus, so closing gives it back.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => opener?.focus?.(), [opener]);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { form.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus(); }, []);
  // Esc closes from anywhere, not only once focus is inside.
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The car's bookings in these days, for the picker.
  useEffect(() => {
    if (carId === null || !rangeKey) { setBookings([]); return undefined; }
    let cancelled = false;
    setBookings(null);
    const [start, end] = rangeKey.split('_');
    getStatementBookings(carId, { from: start, to: end })
      .then(list => { if (!cancelled) setBookings(list); })
      .catch(() => { if (!cancelled) setBookings('failed'); });
    return () => { cancelled = true; };
  }, [carId, rangeKey]);

  const list = Array.isArray(bookings) ? bookings : [];
  const booking = list.find(item => item.id === bookingId) ?? null;
  const span = range && booking ? bookingWindow(range, booking) : range;

  // A booking that left the list with the days goes; a linked customer's language comes in unless one was picked.
  useEffect(() => {
    if (bookingId !== null && Array.isArray(bookings) && !bookings.some(item => item.id === bookingId)) setBookingId(null);
  }, [bookings, bookingId]);
  const chooseBooking = (id: number | null) => {
    setBookingId(id);
    if (!langChosen) setLang(defaultStatementLang(list.find(item => item.id === id)?.language ?? null));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!span) { setFailed('range'); return; }
    setBusy(true);
    setFailed(null);
    try {
      const [items, pdf] = await Promise.all([getHgsStatementTransits(carId, plate, span), import('./HgsStatementPdf')]);
      const blob = await pdf.renderHgsStatement({
        lang, plate, model, window: span, includePrivate, issued: istanbulDate(),
        customer: booking?.customer ?? null,
        bookingNumber: booking ? booking.bookingNumber ?? `#${booking.id}` : null,
        rows: statementRows(items, span, includePrivate),
      });
      const name = statementFileName(plate, span, lang);
      saveFile(blob, name);
      onDone(name);
    } catch {
      setFailed('failed');
      setBusy(false);
    }
  };

  const bookingLabel = (item: StatementBooking) =>
    [item.bookingNumber ?? `#${item.id}`, item.customer ?? '—', rangeLabel({ from: item.start, to: item.end })].join(' · ');

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9100] flex items-end justify-center bg-[rgba(15,17,23,0.45)] p-0 sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form ref={form} role="dialog" aria-modal="true" aria-labelledby={titleId} noValidate onSubmit={create} className="hc-cash-dialog hc-hgs-dialog hc-hgs-pdf surface-depth surface-float">
        <h2 id={titleId}>{t('pdf.title')}</h2>
        <div className="hc-hgs-dialog-car"><PlateChip plate={plate} /><bdi dir="auto">{model ?? t('row.noModel')}</bdi></div>

        <fieldset className="hc-hgs-pdf-field">
          <legend>{t('pdf.language')}</legend>
          <div className="hc-hgs-pdf-langs">
            {STATEMENT_LANGS.map(code => (
              <button key={code} type="button" lang={code} dir={code === 'ar' ? 'rtl' : 'ltr'} aria-pressed={lang === code} disabled={busy} onClick={() => { setLang(code); setLangChosen(true); }}>
                {STATEMENT_LANG_NAMES[code]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="hc-hgs-pdf-dates">
          <label>
            <span>{t('range.from')}</span>
            <input type="date" className="hc-input !mt-0" value={from} max={today} disabled={busy} onChange={e => { setFrom(e.target.value); setFailed(null); }} />
          </label>
          <label>
            <span>{t('range.to')}</span>
            <input type="date" className="hc-input !mt-0" value={to} max={today} disabled={busy} onChange={e => { setTo(e.target.value); setFailed(null); }} />
          </label>
        </div>

        {carId !== null && (
          <label className="hc-hgs-pdf-field">
            <span>{t('pdf.booking')}</span>
            <select className="hc-input !mt-0" value={bookingId ?? ''} disabled={busy || bookings === null || !range} onChange={e => chooseBooking(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{bookings === null ? t('pdf.bookingsLoading') : list.length === 0 ? t('pdf.noBookings') : t('pdf.noBooking')}</option>
              {list.map(item => <option key={item.id} value={item.id}>{bookingLabel(item)}</option>)}
            </select>
            {bookings === 'failed' && <small role="alert" className="hc-hgs-pdf-warn">{t('pdf.bookingsFailed')}</small>}
            {booking && span && <small className="hc-hgs-pdf-hint">{t('pdf.bookingDays', { range: `⁦${rangeLabel(span)}⁩` })}</small>}
          </label>
        )}

        <label className="hc-hgs-pdf-toggle">
          <input type="checkbox" checked={includePrivate} disabled={busy} onChange={e => setIncludePrivate(e.target.checked)} />
          <span>{t('pdf.private')}</span>
        </label>

        {failed && <p role="alert" className="hc-cash-miss">{t(failed === 'range' ? 'pdf.badRange' : 'pdf.failed')}</p>}

        <div className="hc-hgs-dialog-actions hc-hgs-pdf-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>{t('fix.cancel')}</Button>
          <Button type="submit" disabled={busy || !range} aria-busy={busy}>{busy ? t('pdf.busy') : t('pdf.create')}</Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

export default HgsStatementDialog;
