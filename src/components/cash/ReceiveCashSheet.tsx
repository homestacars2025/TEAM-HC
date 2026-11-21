import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { printHtml } from '../../lib/printDocument';
import {
  CASH_CURRENCIES, CASH_PURPOSES, CURRENCY_SIGN, cashBookings, cleanAmountInput, envelopeLabelHtml, envelopeShareText, formatCashAmount,
  needsNote, parseAmount, plateTerm, preselectBooking, receiveCashErrorKey, whatsappUrl,
  type CashBooking, type CashCurrency, type CashPurpose, type CashReceipt, type EnvelopeLines,
} from '../../lib/receiveCash';
import { findCashBookingsByPlate, getCashBooking, getCustomerCashBookings, receiveCash } from '../../lib/queries/receiveCash';
import PlateChip from '../booking/PlateChip';
import Button from '../Button';
import { CopyMark } from '../CopyButton';
import CustomerAvatar from '../CustomerAvatar';
import CustomerSearch from '../customers/CustomerSearch';
import type { ReceiveCashPrefill } from './ReceiveCashContext';

type Step = 'loading' | 'customer' | 'booking' | 'purpose' | 'amount' | 'confirm' | 'done';
const STEPS: Step[] = ['customer', 'booking', 'purpose', 'amount', 'confirm'];
const BACK: Partial<Record<Step, Step>> = { booking: 'customer', purpose: 'booking', amount: 'purpose', confirm: 'amount' };
const TOAST_MS = 4200;
const PLATE_DEBOUNCE_MS = 250;
const FIELD_KEYS: Array<keyof EnvelopeLines> = ['customer', 'booking', 'plate', 'amount', 'purpose', 'date', 'holder'];

interface Customer { id: string; name: string }
interface Toast { tone: 'error' | 'ok'; text: string }

// ── Icons ─────────────────────────────────────────────────────────────────────

const svg = (children: React.ReactNode, size = 22) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export const CashIcon: React.FC<{ size?: number }> = ({ size = 18 }) => svg(<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01M18 14.5v.01" /></>, size);

const PURPOSE_ICON: Record<CashPurpose, React.ReactNode> = {
  rental: svg(<><path d="M5 16l1.5-5A2 2 0 018.4 9.5h7.2a2 2 0 011.9 1.5L19 16" /><rect x="3.5" y="16" width="17" height="3.5" rx="1.2" /><path d="M7 19.5v1.5M17 19.5v1.5" /></>),
  deposit: svg(<><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>),
  extension: svg(<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></>),
  hgs: svg(<><path d="M4 21V10M4 10h16l-2-3H6z" /><path d="M8 10l2-3M12 10l2-3M16 10l2-3" /><path d="M20 21v-6" /></>),
  fine: svg(<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></>),
  damage: svg(<><path d="M14.7 6.3a4 4 0 00-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 005.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z" /></>),
  fuel: svg(<><path d="M5 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3.5 21h13" /><path d="M8 7h4M15 9l3 2.5V18a1.5 1.5 0 003 0v-7l-3-3" /></>),
  delivery: svg(<><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>),
  other: svg(<><circle cx="6" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18" cy="12" r="1.3" /></>),
};

const BackIcon = () => svg(<path className="hc-flip-path" d="M15 5l-7 7 7 7" />, 20);
const CloseIcon = () => svg(<path d="M6 6l12 12M18 6L6 18" />, 20);
const PrintIcon = () => svg(<><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><rect x="6" y="14" width="12" height="7" rx="1" /></>, 18);
const WhatsAppIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.2c0-.1-.2-.2-.5-.3z" /></svg>
);

// ── Pieces ────────────────────────────────────────────────────────────────────

const BookingStatusPill: React.FC<{ status: CashBooking['status'] }> = ({ status }) => {
  const { t } = useTranslation('bookings');
  return <span className={`hc-rc-status is-${status}`}>{t(`status.${status}`)}</span>;
};

const BookingCardButton: React.FC<{ booking: CashBooking; selected: boolean; showCustomer?: boolean; onPick: () => void }> = ({ booking, selected, showCustomer = false, onPick }) => {
  const { t } = useTranslation('cash');
  const locale = useDateLocale();
  return (
    <button type="button" role="radio" aria-checked={selected} className={`hc-rc-booking ${selected ? 'is-selected' : ''}`} onClick={onPick}>
      <span className="hc-rc-booking-top">
        <strong dir="ltr" className="hc-num">{booking.bookingNumber}</strong>
        <BookingStatusPill status={booking.status} />
      </span>
      <span className="hc-rc-booking-car">
        {booking.plate && <PlateChip plate={booking.plate} />}
        {booking.model && <bdi dir="auto">{booking.model}</bdi>}
      </span>
      {showCustomer && booking.customerName && <span className="hc-rc-booking-who"><bdi dir="auto">{booking.customerName}</bdi></span>}
      <span className="hc-rc-booking-dates">{t('booking.dates', { start: formatDay(booking.startDate, locale), end: formatDay(booking.endDate, locale) })}</span>
      <span className="hc-rc-booking-check" aria-hidden="true">{selected && svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, 14)}</span>
    </button>
  );
};

// ── The sheet ─────────────────────────────────────────────────────────────────

const ReceiveCashSheet: React.FC<{ prefill: ReceiveCashPrefill; onClose: () => void; onReceived: () => void }> = ({ prefill, onClose, onReceived }) => {
  const { t } = useTranslation('cash');
  const locale = useDateLocale();
  const titleId = useId();
  const noteId = useId();
  const amountId = useId();
  const panel = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>(prefill.bookingId ? 'loading' : prefill.customer ? 'booking' : 'customer');
  const [customer, setCustomer] = useState<Customer | null>(prefill.customer ?? null);
  const [bookings, setBookings] = useState<CashBooking[] | null>(null);
  const [bookingsFailed, setBookingsFailed] = useState(false);
  const [bookingsTry, setBookingsTry] = useState(0);
  const [booking, setBooking] = useState<CashBooking | null>(null);
  const [purpose, setPurpose] = useState<CashPurpose | null>(null);
  const [amountText, setAmountText] = useState('');
  const [currency, setCurrency] = useState<CashCurrency>('TRY');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<CashReceipt | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [copied, setCopied] = useState(false);
  const [plateHits, setPlateHits] = useState<CashBooking[] | null>(null);
  const [plateQuery, setPlateQuery] = useState<string | null>(null);

  const amount = parseAmount(amountText);
  const noteMissing = needsNote(purpose) && !note.trim();

  const showError = useCallback((message: string | undefined) => setToast({ tone: 'error', text: t(`errors.${receiveCashErrorKey(message)}`) }), [t]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Opened from a booking: that booking and its customer, straight to the purpose.
  useEffect(() => {
    if (!prefill.bookingId) return undefined;
    let active = true;
    getCashBooking(prefill.bookingId)
      .then(found => {
        if (!active) return;
        if (!found || found.status === 'cancelled') {
          showError(found ? 'cancelled' : 'Booking not found');
          setStep('customer');
          return;
        }
        setCustomer({ id: found.customerId, name: found.customerName });
        setBooking(found);
        setStep('purpose');
      })
      .catch((failure: { message?: string }) => { if (active) { showError(failure?.message); setStep('customer'); } });
    return () => { active = false; };
  }, [prefill.bookingId, showError]);

  // The customer's bookings, once per customer; the only active one is chosen for them.
  useEffect(() => {
    if (step !== 'booking' || !customer) return undefined;
    let active = true;
    setBookingsFailed(false);
    getCustomerCashBookings(customer.id)
      .then(rows => {
        if (!active) return;
        const list = cashBookings(rows);
        setBookings(list);
        setBooking(current => (current && list.some(row => row.id === current.id) ? current : preselectBooking(list)));
      })
      .catch(() => { if (active) { setBookings(null); setBookingsFailed(true); } });
    return () => { active = false; };
  }, [step, customer, bookingsTry]);

  // A plate typed into the customer search finds the booking on that car too.
  useEffect(() => {
    if (!plateQuery) { setPlateHits(null); return undefined; }
    let active = true;
    const timer = window.setTimeout(() => {
      findCashBookingsByPlate(plateQuery)
        .then(rows => { if (active) setPlateHits(cashBookings(rows)); })
        .catch(() => { if (active) setPlateHits([]); });
    }, PLATE_DEBOUNCE_MS);
    return () => { active = false; window.clearTimeout(timer); };
  }, [plateQuery]);

  // Each step starts at its top, with focus on the sheet for screen readers.
  useEffect(() => {
    panel.current?.querySelector('.hc-rc-body')?.scrollTo?.({ top: 0 });
    if (step !== 'customer' && step !== 'amount') panel.current?.focus({ preventScroll: true });
  }, [step]);

  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const pickCustomer = (next: Customer) => {
    if (customer?.id !== next.id) { setBooking(null); setBookings(null); }
    setCustomer(next);
    setStep('booking');
  };

  const pickPlateBooking = (hit: CashBooking) => {
    setCustomer({ id: hit.customerId, name: hit.customerName });
    setBooking(hit);
    setBookings(null);
    setStep('purpose');
  };

  const submit = async () => {
    if (!booking || !purpose || amount === null || noteMissing || busy) return;
    setBusy(true);
    setToast(null);
    try {
      const result = await receiveCash({ bookingId: booking.id, purpose, amount, currency, note: note.trim() || null });
      setReceipt(result);
      setStep('done');
      onReceived();
    } catch (failure) {
      showError((failure as { message?: string })?.message);
    } finally {
      setBusy(false);
    }
  };

  // ── What goes on the envelope ──
  const lines = (lang?: 'en' | 'ar'): EnvelopeLines | null => {
    if (!receipt) return null;
    const fixed = lang ? i18n.getFixedT(lang, 'cash') : t;
    const env = receipt.envelope;
    const dateLocale = lang ? (lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB') : locale;
    return {
      ref: env.ref,
      customer: env.customer ?? customer?.name ?? '',
      booking: env.bookingNumber ?? booking?.bookingNumber ?? '',
      plate: env.plate ?? booking?.plate ?? '',
      amount: formatCashAmount(env.amount, env.currency),
      purpose: purpose ? fixed(`purpose.${purpose}`) : env.purpose,
      date: env.date ? `${formatDay(env.date.slice(0, 10), dateLocale)} ${env.date.slice(11)}`.trim() : '',
      holder: env.holder ?? '',
    };
  };
  const fieldLabels = (lang?: 'en' | 'ar') => {
    const fixed = lang ? i18n.getFixedT(lang, 'cash') : t;
    return Object.fromEntries([...FIELD_KEYS, 'ref' as const].map(key => [key, fixed(`fields.${key}`)])) as Record<keyof EnvelopeLines, string>;
  };

  const copyRef = async () => {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.envelope.ref);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setToast({ tone: 'error', text: t('done.copyFailed') });
    }
  };

  const printLabel = () => {
    const en = lines('en');
    const ar = lines('ar');
    if (!en || !ar) return;
    // Bilingual labels; values in English, which finance reads either way.
    const html = envelopeLabelHtml(en, { en: fieldLabels('en'), ar: fieldLabels('ar') }, { en: i18n.getFixedT('en', 'cash')('done.instruction'), ar: i18n.getFixedT('ar', 'cash')('done.instruction') });
    void printHtml(html).catch(() => setToast({ tone: 'error', text: t('done.printFailed') }));
  };

  const shareText = receipt ? envelopeShareText(t('done.shareTitle'), fieldLabels(), lines() as EnvelopeLines, t('done.instruction')) : '';

  // ── Render ──
  const stepIndex = STEPS.indexOf(step);
  const back = BACK[step];
  const title = step === 'done' ? t('done.title') : step === 'loading' ? t('title') : t(`steps.${step}`);

  const summary = (
    <div className="hc-rc-context">
      {customer && (
        <span className="hc-rc-context-who"><CustomerAvatar size={28} /><bdi dir="auto">{customer.name || '—'}</bdi></span>
      )}
      {booking && step !== 'booking' && (
        <span className="hc-rc-context-booking"><b dir="ltr" className="hc-num">{booking.bookingNumber}</b>{booking.plate && <PlateChip plate={booking.plate} />}</span>
      )}
    </div>
  );

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (step === 'loading') {
    body = <div className="hc-rc-state" role="status"><span className="hc-rc-spinner" aria-hidden="true" />{t('loading')}</div>;
  }

  if (step === 'customer') {
    body = (
      <>
        <p className="hc-rc-lead">{t('customer.lead')}</p>
        <CustomerSearch
          autoFocus
          allowBanned
          required={false}
          flagFor={() => ''}
          formatDate={date => formatDay(date, locale)}
          onSelect={match => pickCustomer({ id: match.id, name: match.full_name })}
          onQueryChange={term => setPlateQuery(plateTerm(term))}
        />
        {plateQuery && plateHits && plateHits.length > 0 && (
          <section className="hc-rc-plates" aria-label={t('customer.byPlate')}>
            <h3>{t('customer.byPlate')}</h3>
            <div role="radiogroup" aria-label={t('customer.byPlate')} className="hc-rc-bookings">
              {plateHits.map(hit => <BookingCardButton key={hit.id} booking={hit} selected={false} showCustomer onPick={() => pickPlateBooking(hit)} />)}
            </div>
          </section>
        )}
      </>
    );
  }

  if (step === 'booking') {
    body = (
      <>
        {summary}
        {bookingsFailed ? (
          <div className="hc-rc-state" role="alert">
            <p>{t('booking.failed')}</p>
            <Button variant="secondary" onClick={() => setBookingsTry(n => n + 1)}>{t('retry')}</Button>
          </div>
        ) : bookings === null ? (
          <div className="hc-rc-bookings" aria-busy="true">{[0, 1, 2].map(i => <span key={i} className="hc-rc-bone" />)}</div>
        ) : bookings.length === 0 ? (
          <div className="hc-rc-state"><p>{t('booking.empty')}</p></div>
        ) : (
          <div role="radiogroup" aria-label={t('steps.booking')} className="hc-rc-bookings">
            {bookings.map(row => <BookingCardButton key={row.id} booking={row} selected={booking?.id === row.id} onPick={() => setBooking(row)} />)}
          </div>
        )}
      </>
    );
    footer = <Button className="hc-rc-next" disabled={!booking} onClick={() => setStep('purpose')}>{t('next')}</Button>;
  }

  if (step === 'purpose') {
    body = (
      <>
        {summary}
        <div role="radiogroup" aria-label={t('steps.purpose')} className="hc-rc-purposes">
          {CASH_PURPOSES.map(key => (
            <button key={key} type="button" role="radio" aria-checked={purpose === key} className={`hc-rc-purpose ${purpose === key ? 'is-selected' : ''}`} onClick={() => { setPurpose(key); setStep('amount'); }}>
              <span className="hc-rc-purpose-icon">{PURPOSE_ICON[key]}</span>
              <span>{t(`purpose.${key}`)}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  if (step === 'amount') {
    body = (
      <>
        {summary}
        <div className="hc-rc-amount">
          <label htmlFor={amountId} className="hc-rc-label">{t('amount.label')}</label>
          <div className="hc-rc-amount-field" dir="ltr">
            <span aria-hidden="true">{CURRENCY_SIGN[currency]}</span>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the amount is the whole step */}
            <input id={amountId} autoFocus inputMode="decimal" autoComplete="off" enterKeyHint="next" placeholder="0" value={amountText} style={{ width: `${Math.max(amountText.length, 1) + 0.6}ch` }}
              onChange={e => setAmountText(cleanAmountInput(e.target.value))}
              onKeyDown={e => { if (e.key === 'Enter' && amount !== null && !noteMissing) setStep('confirm'); }} />
          </div>
          <div role="radiogroup" aria-label={t('amount.currency')} className="hc-rc-currency">
            {CASH_CURRENCIES.map(code => (
              <button key={code} type="button" role="radio" aria-checked={currency === code} aria-label={t(`currency.${code}`)} className={currency === code ? 'is-selected' : undefined} onClick={() => setCurrency(code)}>
                <span aria-hidden="true">{CURRENCY_SIGN[code]}</span>
              </button>
            ))}
          </div>
        </div>
        <label htmlFor={noteId} className="hc-rc-label">{needsNote(purpose) ? t('amount.noteRequired') : t('amount.note')}</label>
        <textarea id={noteId} rows={2} maxLength={300} value={note} onChange={e => setNote(e.target.value)} className="hc-input !mt-0 hc-rc-note" placeholder={t('amount.notePlaceholder')} aria-invalid={noteMissing && note.length > 0} />
      </>
    );
    footer = <Button className="hc-rc-next" disabled={amount === null || noteMissing} onClick={() => setStep('confirm')}>{t('next')}</Button>;
  }

  if (step === 'confirm' && booking && purpose && amount !== null) {
    body = (
      <>
        <div className="hc-rc-total">
          <span>{t('confirm.youReceive')}</span>
          <strong dir="ltr" className="hc-num">{formatCashAmount(amount, currency)}</strong>
          <span className="hc-rc-total-purpose">{PURPOSE_ICON[purpose]}{t(`purpose.${purpose}`)}</span>
        </div>
        <dl className="hc-rc-summary">
          <div><dt>{t('fields.customer')}</dt><dd><bdi dir="auto">{customer?.name || '—'}</bdi></dd></div>
          <div><dt>{t('fields.booking')}</dt><dd><b dir="ltr" className="hc-num">{booking.bookingNumber}</b> <BookingStatusPill status={booking.status} /></dd></div>
          {booking.plate && <div><dt>{t('fields.plate')}</dt><dd><PlateChip plate={booking.plate} /></dd></div>}
          {note.trim() && <div><dt>{t('fields.note')}</dt><dd><bdi dir="auto">{note.trim()}</bdi></dd></div>}
        </dl>
        <p className="hc-rc-hint">{t('confirm.hint')}</p>
      </>
    );
    footer = (
      <Button className="hc-rc-next" disabled={busy} aria-busy={busy} onClick={() => void submit()}>
        {busy && <span className="hc-rc-spinner is-light" aria-hidden="true" />}{busy ? t('confirm.saving') : t('confirm.button')}
      </Button>
    );
  }

  if (step === 'done' && receipt) {
    const shown = lines() as EnvelopeLines;
    body = (
      <>
        <div className="hc-rc-done-mark" aria-hidden="true">{svg(<path d="M5 12.5l4.5 4.5L19 7.5" />, 30)}</div>
        <p className="hc-rc-done-lead">{t('done.lead')}</p>
        <div className="hc-rc-ref">
          <span className="hc-rc-ref-label">{t('fields.ref')}</span>
          <p dir="ltr" className="hc-num">{receipt.envelope.ref}</p>
          <button type="button" onClick={() => void copyRef()} aria-label={t('done.copy')}>
            <CopyMark done={copied} /><span>{copied ? t('done.copied') : t('done.copy')}</span>
          </button>
        </div>
        <p className="hc-rc-instruction">{t('done.instruction')}</p>
        <dl className="hc-rc-summary">
          {FIELD_KEYS.map(key => (key === 'holder' ? (
            <div key={key}><dt>{t('fields.holder')}</dt><dd><span className="hc-rc-with">{t('done.withYou')}</span></dd></div>
          ) : shown[key] ? (
            <div key={key}>
              <dt>{t(`fields.${key}`)}</dt>
              <dd>{key === 'plate' ? <PlateChip plate={shown.plate} /> : <bdi dir={key === 'amount' || key === 'booking' ? 'ltr' : 'auto'}>{shown[key]}</bdi>}</dd>
            </div>
          ) : null))}
        </dl>
      </>
    );
    footer = (
      <div className="hc-rc-done-actions">
        <Button variant="secondary" onClick={printLabel}><PrintIcon />{t('done.print')}</Button>
        <a className="hc-btn hc-btn-secondary hc-rc-wa" href={whatsappUrl(shareText)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon />{t('done.whatsapp')}</a>
        <Button className="hc-rc-next" onClick={onClose}>{t('done.finish')}</Button>
      </div>
    );
  }

  return ReactDOM.createPortal(
    <div className="hc-rc-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && step !== 'done') close(); }}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`hc-rc surface-float ${step === 'done' ? 'is-done' : ''}`}>
        <span className="hc-rc-grabber" aria-hidden="true" />
        <header className="hc-rc-head">
          {back && !busy ? (
            <button type="button" className="hc-rc-icon" onClick={() => setStep(back)} aria-label={t('back')}><BackIcon /></button>
          ) : <span className="hc-rc-icon is-blank" aria-hidden="true" />}
          <div className="hc-rc-head-text">
            <p className="hc-rc-eyebrow">{t('title')}</p>
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="hc-rc-icon" onClick={close} disabled={busy} aria-label={t('close')}><CloseIcon /></button>
        </header>
        {stepIndex >= 0 && (
          <ol className="hc-rc-progress" aria-label={t('progress', { current: stepIndex + 1, total: STEPS.length })}>
            {STEPS.map((key, index) => <li key={key} className={index <= stepIndex ? 'is-done' : undefined} aria-current={index === stepIndex ? 'step' : undefined}><span className="sr-only">{t(`steps.${key}`)}</span></li>)}
          </ol>
        )}
        <div className="hc-rc-body">{body}</div>
        {footer && <footer className="hc-rc-foot">{footer}</footer>}
        {toast && (
          <div role={toast.tone === 'error' ? 'alert' : 'status'} className={`hc-rc-toast is-${toast.tone}`}>
            <span>{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} aria-label={t('close')}>{svg(<path d="M6 6l12 12M18 6L6 18" />, 14)}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default ReceiveCashSheet;

