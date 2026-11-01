import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { parseAmount } from '../../lib/custodyExpense';
import { cashErrorKey, envelopeCustomer, findEnvelope, type CashAccount, type Envelope } from '../../lib/envelopes';
import { receiveEnvelope } from '../../lib/queries/envelopes';
import { formatMoney } from '../../lib/suppliers';
import PlateChip from '../booking/PlateChip';
import Button from '../Button';

interface ReceiveEnvelopeProps {
  envelopes: Envelope[];
  accounts: CashAccount[];
  holderName: (envelope: Envelope) => string;
  onClose: () => void;
  onDone: (ref: string) => void;
}

const ReceiveEnvelope: React.FC<ReceiveEnvelopeProps> = ({ envelopes, accounts, holderName, onClose, onDone }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const input = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [counted, setCounted] = useState('');
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const found = useMemo(() => findEnvelope(envelopes, typed), [envelopes, typed]);
  const open = found?.status === 'with_employee' ? found : null;
  const destinations = useMemo(() => accounts.filter(account => account.kind === 'safe' || account.is_final), [accounts]);
  const countedValue = counted.trim() === '0' ? 0 : parseAmount(counted);
  const difference = open && countedValue !== null ? Math.round((countedValue - open.amount) * 100) / 100 : 0;
  const ready = !!open && countedValue !== null && !!accountId && (difference === 0 || !!note.trim());

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // A new envelope starts from what it should hold, so a matching count is one Enter away.
  useEffect(() => { if (open) setCounted(String(open.amount).replace('.', ',')); }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!open || !ready || countedValue === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await receiveEnvelope(open.ref, countedValue, Number(accountId), note.trim() || null);
      onDone(open.ref);
    } catch (failure) {
      setError(t(`cash.errors.${cashErrorKey((failure as { message?: string })?.message)}`));
      setBusy(false);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-[rgba(15,17,23,0.45)] p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form role="dialog" aria-modal="true" aria-label={t('cash.receive.title')} onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }} className="hc-cash-dialog surface-depth surface-float">
        <h2>{t('cash.receive.title')}</h2>
        <label className="hc-cash-field">
          <span className="hc-field-label">{t('cash.receive.ref')}</span>
          <input ref={input} className="hc-input hc-cash-ref" dir="ltr" autoComplete="off" spellCheck={false} placeholder="ENV-0000-0000" value={typed} disabled={busy} onChange={e => setTyped(e.target.value)} />
        </label>

        {typed.trim().length >= 12 && !found && <p role="alert" className="hc-cash-miss">{t('cash.receive.notFound')}</p>}
        {found && !open && <p role="alert" className="hc-cash-miss">{t('cash.receive.already', { status: t(`cash.status.${found.status}`) })}</p>}

        {open && (
          <>
            <div className="hc-cash-found">
              <strong><bdi dir="ltr">{formatMoney(open.amount, open.currency)}</bdi></strong>
              <small dir="auto">{holderName(open)}{envelopeCustomer(open) ? ` · ${envelopeCustomer(open)}` : ''}</small>
              {open.car && <PlateChip plate={open.car.plate_number} />}
            </div>
            <label className="hc-cash-field">
              <span className="hc-field-label">{t('cash.receive.counted')}</span>
              <input className="hc-input" dir="ltr" inputMode="decimal" autoComplete="off" value={counted} disabled={busy} onChange={e => setCounted(e.target.value)} />
            </label>
            <label className="hc-cash-field">
              <span className="hc-field-label">{t('cash.receive.destination')}</span>
              <select className="hc-input !mt-0" value={accountId} disabled={busy} onChange={e => setAccountId(e.target.value)}>
                <option value="">{t('cash.receive.choose')}</option>
                {destinations.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            {difference !== 0 && <p className="hc-cash-miss">{t('cash.receive.difference', { amount: formatMoney(difference, open.currency) })}</p>}
            <label className="hc-cash-field">
              <span className="hc-field-label">{difference !== 0 ? t('cash.receive.noteRequired') : t('cash.receive.note')}</span>
              <input className="hc-input !mt-0" maxLength={200} value={note} disabled={busy} onChange={e => setNote(e.target.value)} />
            </label>
          </>
        )}

        {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onClose}>{tc('actions.cancel')}</Button>
          <Button type="submit" disabled={busy || !ready}>{t('cash.receive.confirm')}</Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

export default ReceiveEnvelope;
