import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import PlateChip from '../booking/PlateChip';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import {
  balanceTone, defaultTarget, formatLira, round2, transferAmount, transferFailure, transferTargets, type BookingWallet,
} from '../../lib/bookingWallet';
import { transferBookingBalance, type TransferResult } from '../../lib/queries/bookingWallet';
import { BalanceChip, CloseIcon, MoveIcon } from './WalletParts';

/**
 * Moves money from one of a customer's bookings to another through
 * `transfer_booking_balance`. The amount starts at the whole balance; a smaller one
 * leaves the rest where it is.
 */
const MoveBalanceSheet: React.FC<{
  from: BookingWallet;
  wallet: BookingWallet[];
  /** Chosen for the person, as when a new booking asks for an old balance. */
  target?: number;
  onClose: () => void;
  onMoved: (result: TransferResult) => void;
}> = ({ from, wallet, target, onClose, onMoved }) => {
  const { t } = useTranslation('wallets');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const targets = useMemo(() => transferTargets(wallet, from.booking.id), [wallet, from.booking.id]);
  const [to, setTo] = useState<number | ''>(() => target ?? defaultTarget(wallet, from.booking.id) ?? '');
  const [typed, setTyped] = useState(String(round2(Math.abs(from.balance))));
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const amount = transferAmount(from.balance, typed);
  const problem = 'problem' in amount ? amount.problem : null;
  const moving = problem ? null : (amount as { amount: number }).amount;
  const destination = targets.find(entry => entry.booking.id === to) ?? null;
  const owes = balanceTone(from.balance) === 'owes';

  useEffect(() => { box.current?.querySelector<HTMLElement>('input')?.focus(); }, []);

  // On the window, ahead of the wallet behind it, so Escape still works after a disabled
  // button has dropped focus to the page.
  const savingRef = useRef(saving);
  savingRef.current = saving;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      if (!savingRef.current) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const close = () => { if (!saving) onClose(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (moving == null || to === '' || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      onMoved(await transferBookingBalance(from.booking.id, to, moving, note));
    } catch (error) {
      const said = transferFailure((error as { message?: string })?.message);
      setFailure(said.message ?? t(`move.errors.${said.key}`));
      setSaving(false);
    }
  };

  const label = (entry: BookingWallet) => {
    const { booking } = entry;
    const dates = `${formatDay(booking.start_date.slice(0, 10), locale)} → ${formatDay(booking.end_date.slice(0, 10), locale)}`;
    return [booking.booking_number ?? `#${booking.id}`, booking.plate, dates, booking.is_currently_active ? t('wallet.onRent') : null].filter(Boolean).join(' · ');
  };

  return ReactDOM.createPortal(
    <div className="hc-cw-move-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        className="hc-cw-move surface-float"
      >
        <form onSubmit={submit} noValidate>
          <header className="hc-cw-move-head">
            <span aria-hidden="true" className="hc-cw-move-badge"><MoveIcon /></span>
            <h3 id={`${ids}-title`}>{t('move.title')}</h3>
            <button type="button" className="hc-ce-close" onClick={close} disabled={saving} aria-label={tc('actions.close')}><CloseIcon /></button>
          </header>

          <div className="hc-cw-move-from">
            <div className="hc-cw-move-booking">
              <span className="hc-cw-move-label">{t('move.from')}</span>
              <strong className="hc-num"><bdi dir="ltr">{from.booking.booking_number ?? `#${from.booking.id}`}</bdi></strong>
              {from.booking.plate && <PlateChip plate={from.booking.plate} />}
            </div>
            <div className="hc-cw-move-balance">
              <span className="hc-cw-move-label">{t('move.balance')}</span>
              <BalanceChip balance={from.balance} />
            </div>
          </div>

          <div className="hc-cw-move-fields">
            <label className="hc-cw-move-field">
              <span className="hc-field-label">{t('move.to')}</span>
              <select className="hc-input" value={to} onChange={e => setTo(e.target.value ? Number(e.target.value) : '')} disabled={saving}>
                {to === '' && <option value="">{t('move.pickBooking')}</option>}
                {targets.map(entry => <option key={entry.booking.id} value={entry.booking.id}>{label(entry)}</option>)}
              </select>
              {destination && moving != null ? (
                <span className="hc-cw-move-hint hc-cw-move-preview">
                  {t('move.after', { number: destination.booking.booking_number ?? `#${destination.booking.id}` })}
                  <BalanceChip balance={destination.balance} />
                  <span aria-hidden="true">→</span>
                  <BalanceChip balance={round2(destination.balance + moving)} />
                </span>
              ) : tried && to === '' ? <span className="hc-cw-move-problem">{t('move.pickBooking')}</span> : null}
            </label>

            <label className="hc-cw-move-field">
              <span className="hc-field-label">{t('move.amount')}</span>
              <input
                className={`hc-input hc-num${tried && problem ? ' is-invalid' : ''}`}
                dir="ltr"
                inputMode="decimal"
                value={typed}
                onChange={e => { setTyped(e.target.value); setFailure(null); }}
                disabled={saving}
                aria-invalid={tried && !!problem}
                aria-describedby={`${ids}-amount`}
              />
              <span id={`${ids}-amount`} className={tried && problem ? 'hc-cw-move-problem' : 'hc-cw-move-hint'}>
                {tried && problem ? t(`move.problems.${problem}`, { max: formatLira(from.balance) }) : t(`move.hint.${owes ? 'owes' : 'credit'}`, { max: formatLira(from.balance) })}
              </span>
            </label>

            <label className="hc-cw-move-field">
              <span className="hc-field-label">{t('move.note')}</span>
              <input className="hc-input" value={note} onChange={e => setNote(e.target.value)} placeholder={t('move.notePlaceholder')} maxLength={200} disabled={saving} />
            </label>
          </div>

          {failure && <p role="alert" className="hc-cw-move-failure">{failure}</p>}

          <footer className="hc-cw-move-foot">
            <Button variant="secondary" onClick={close} disabled={saving}>{tc('actions.cancel')}</Button>
            <Button type="submit" disabled={saving || targets.length === 0}>
              {saving ? t('move.moving') : moving != null ? t('move.submitAmount', { amount: formatLira(moving) }) : t('move.submit')}
            </Button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default MoveBalanceSheet;
