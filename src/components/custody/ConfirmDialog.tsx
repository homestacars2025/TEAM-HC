import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import Button from '../Button';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Starts on the safe answer, so a stray Enter never destroys anything. */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, body, confirmLabel, cancelLabel, busy = false, onConfirm, onCancel }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (!busy) onCancel();
    }
    // Two buttons, so Tab only ever has to swap between them.
    if (e.key === 'Tab') {
      const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const next = buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length];
      e.preventDefault();
      next?.focus();
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9100] flex items-center justify-center bg-[rgba(15,17,23,0.45)] p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hc-confirm-title"
        aria-describedby="hc-confirm-body"
        onKeyDown={onKeyDown}
        className="surface-depth surface-float w-full max-w-sm rounded-2xl bg-[var(--surface)] p-5"
      >
        <h2 id="hc-confirm-title" className="text-[17px] font-semibold text-[#0f1117]">{title}</h2>
        <p id="hc-confirm-body" className="mt-1.5 text-sm leading-relaxed text-gray-500">{body}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmDialog;
