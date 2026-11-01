import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CURRENCY_SYMBOLS } from '../../lib/CurrencyContext';
import { parseAmount } from '../../lib/custodyExpense';
import { cashErrorKey, type CashAccount } from '../../lib/envelopes';
import { PAY_CURRENCIES, type PayCurrency } from '../../lib/payments';
import { transferMoney } from '../../lib/queries/envelopes';
import Button from '../Button';

interface TransferDialogProps {
  accounts: CashAccount[];
  isAdmin: boolean;
  onClose: () => void;
  onDone: (ref: string) => void;
}

const TransferDialog: React.FC<TransferDialogProps> = ({ accounts, isAdmin, onClose, onDone }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const first = useRef<HTMLSelectElement>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<PayCurrency>('TRY');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseAmount(amount);
  const ready = !!from && !!to && from !== to && value !== null;
  // The server refuses this too. It just shouldn't look possible.
  const targets = accounts.filter(account => String(account.id) !== from && (isAdmin || !account.is_final));

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    first.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || value === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await transferMoney(Number(from), Number(to), value, currency, note.trim() || null));
    } catch (failure) {
      setError(t(`cash.errors.${cashErrorKey((failure as { message?: string })?.message)}`));
      setBusy(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-[rgba(15,17,23,0.45)] p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-label={t('cash.transfer.title')} onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }} className="hc-cash-dialog surface-depth surface-float">
        <h2>{t('cash.transfer.title')}</h2>
        <label className="hc-cash-field">
          <span className="hc-field-label">{t('cash.transfer.from')}</span>
          <select ref={first} className="hc-input !mt-0" value={from} disabled={busy} onChange={e => { setFrom(e.target.value); if (e.target.value === to) setTo(''); }}>
            <option value="">{t('cash.receive.choose')}</option>
            {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <label className="hc-cash-field">
          <span className="hc-field-label">{t('cash.transfer.to')}</span>
          <select className="hc-input !mt-0" value={to} disabled={busy} onChange={e => setTo(e.target.value)}>
            <option value="">{t('cash.receive.choose')}</option>
            {targets.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <div className="hc-pay-amount">
          <input className="hc-input" dir="ltr" inputMode="decimal" autoComplete="off" aria-label={t('cash.transfer.amount')} placeholder="0,00" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} />
          <div role="group" aria-label={t('payment.currency')} dir="ltr" className="hc-seg">
            {PAY_CURRENCIES.map(option => (
              <button key={option} type="button" aria-pressed={currency === option} aria-label={option} disabled={busy} onClick={() => setCurrency(option)}>{CURRENCY_SYMBOLS[option]}</button>
            ))}
          </div>
        </div>
        <label className="hc-cash-field">
          <span className="hc-field-label">{t('cash.receive.note')}</span>
          <input className="hc-input !mt-0" maxLength={200} value={note} disabled={busy} onChange={e => setNote(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>{tc('actions.cancel')}</Button>
          <Button type="submit" disabled={busy || !ready}>{t('cash.transfer.confirm')}</Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

export default TransferDialog;
