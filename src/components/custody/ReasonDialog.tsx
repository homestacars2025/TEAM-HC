import React, { useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';

interface ReasonDialogProps {
  title: string;
  body: string;
  label: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

/** For the two things finance can't do without saying why: refusing and voiding. */
const ReasonDialog: React.FC<ReasonDialogProps> = ({ title, body, label, confirmLabel, busy, error, onConfirm, onCancel }) => {
  const { t: tc } = useTranslation('common');
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    field.current?.focus();
    return () => opener?.focus?.();
  }, []);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9100] flex items-center justify-center bg-[rgba(15,17,23,0.45)] p-4" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onSubmit={e => { e.preventDefault(); if (trimmed && !busy) onConfirm(trimmed); }}
        onKeyDown={e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); } }}
        className="surface-depth surface-float w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5"
      >
        <h2 id={`${id}-title`} className="text-[17px] font-semibold text-[#0f1117]">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{body}</p>
        <label htmlFor={`${id}-reason`} className="mt-4 block text-[13px] font-semibold text-gray-700">{label}</label>
        <textarea ref={field} id={`${id}-reason`} rows={3} maxLength={300} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} className="hc-input mt-1.5 w-full" />
        {error && <p role="alert" className="mt-2 text-[13px] text-red-600">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{tc('actions.cancel')}</Button>
          <Button type="submit" variant="destructive" disabled={!trimmed || busy}>{confirmLabel}</Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

export default ReasonDialog;
