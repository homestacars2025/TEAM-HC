import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../custody/ConfirmDialog';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]):not([type="file"]), select:not(:disabled), textarea:not(:disabled)';

interface BookingSheetProps {
  title: string;
  subtitle?: string;
  /** Beside the title, such as the booking number. */
  chip?: React.ReactNode;
  stepper?: React.ReactNode;
  /** Sits above the footer, so it stays on screen while the form scrolls. */
  summary?: React.ReactNode;
  /** Errors, kept in view instead of at the end of a long form. */
  alerts?: React.ReactNode;
  /** A change here starts the body from the top again, as moving between steps should. */
  scrollKey?: string | number;
  footer: React.ReactNode;
  dirty: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  /** Lets a flow ask to close from its own Cancel button. */
  closeRef?: React.MutableRefObject<(() => void) | null>;
  children: React.ReactNode;
}

/** The shell of all four booking flows: a side sheet on a computer, full screen on a phone. */
const BookingSheet: React.FC<BookingSheetProps> = ({ title, subtitle, chip, stepper, summary, alerts, scrollKey, footer, dirty, busy, onClose, onSubmit, closeRef, children }) => {
  const { t } = useTranslation('common');
  const { t: tb } = useTranslation('bookings');
  const formRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (dirty) setConfirming(true);
    else onClose();
  }, [busy, dirty, onClose]);

  useEffect(() => {
    if (closeRef) closeRef.current = requestClose;
  }, [closeRef, requestClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const page = document.getElementById('root');
    document.body.style.overflow = 'hidden';
    // Safari's Tab skips buttons, so it can't be trusted to reach the sheet's last stop
    // and wrap. With the page inert there's nothing behind the sheet to land on.
    page?.setAttribute('inert', '');
    formRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      page?.removeAttribute('inert');
      opener?.focus?.();
    };
  }, []);

  // On the document, not the form: a button that disables itself while it works drops
  // the focus to the page, and the keyboard would stop reaching the sheet.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (confirming) return;
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== 'Tab' || !formRef.current) return;
      const focusable = Array.from(formRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!formRef.current.contains(active) || active === formRef.current) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirming, requestClose]);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    bodyRef.current?.scrollTo({ top: 0 });
    formRef.current?.focus();
  }, [scrollKey]);

  return ReactDOM.createPortal(
    <div className="hc-bs-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <form ref={formRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} noValidate onSubmit={onSubmit} className="hc-bs surface-depth surface-float">
        <header className="hc-bs-head">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold text-[#0f1117]">{title}</h2>
              {chip}
            </div>
            {subtitle && <p dir="auto" className="mt-0.5 truncate text-[13px] text-gray-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={requestClose} disabled={busy} aria-label={t('actions.close')} className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-black/[0.04] disabled:opacity-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {stepper}
        <div ref={bodyRef} className="hc-bs-body">{children}</div>
        {alerts && <div className="hc-bs-alerts">{alerts}</div>}
        {summary}
        <footer className="hc-bs-foot">{footer}</footer>
      </form>

      {confirming && (
        <ConfirmDialog
          title={tb('sheet.discardTitle')}
          body={tb('sheet.discardBody')}
          confirmLabel={tb('sheet.discard')}
          cancelLabel={tb('sheet.keepEditing')}
          onConfirm={onClose}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>,
    document.body,
  );
};

export default BookingSheet;
