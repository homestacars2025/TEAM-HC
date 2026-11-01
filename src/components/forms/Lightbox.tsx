import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBlockedPage } from '../../hooks/useBlockedPage';

export interface LightboxItem {
  url: string;
  label: string;
}

export const isPdfLink = (url: string): boolean => /\.pdf($|[?#])/i.test(url);

interface LightboxProps {
  items: LightboxItem[];
  start?: number;
  onClose: () => void;
}

/** One viewer for photos and PDFs, with arrow keys and a swipe between them. */
const Lightbox: React.FC<LightboxProps> = ({ items, start = 0, onClose }) => {
  const { t } = useTranslation('common');
  const [index, setIndex] = useState(start);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  useBlockedPage();

  const step = useCallback((by: number) => setIndex(current => (current + by + items.length) % items.length), [items.length]);

  useEffect(() => { closeRef.current?.focus(); }, []);

  // In the capture phase: a sheet underneath also listens for Esc on the document.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      const rtl = document.documentElement.dir === 'rtl';
      if (e.key === 'ArrowRight') step(rtl ? -1 : 1);
      if (e.key === 'ArrowLeft') step(rtl ? 1 : -1);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose, step]);

  const item = items[index];
  if (!item) return null;

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const moved = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(moved) < 48) return;
    const rtl = document.documentElement.dir === 'rtl';
    step((moved < 0) === rtl ? -1 : 1);
  };

  return ReactDOM.createPortal(
    <div role="dialog" aria-modal="true" aria-label={item.label} className="hc-lightbox" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} onTouchStart={e => { touchX.current = e.touches[0].clientX; }} onTouchEnd={onTouchEnd}>
      <header className="hc-lightbox-head">
        <span dir="auto" className="min-w-0 flex-1 truncate">{item.label}{items.length > 1 && ` · ${index + 1} / ${items.length}`}</span>
        <a href={item.url} target="_blank" rel="noopener noreferrer">{t('upload.openNewTab')}</a>
        <button ref={closeRef} type="button" onClick={onClose} aria-label={t('actions.close')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </header>
      <div className="hc-lightbox-stage" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        {isPdfLink(item.url)
          ? <iframe key={item.url} src={item.url} title={item.label} />
          : <img key={item.url} src={item.url} alt={item.label} />}
      </div>
      {items.length > 1 && (
        <>
          <button type="button" className="hc-lightbox-nav is-start" onClick={() => step(-1)} aria-label={t('upload.previous')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-flip"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <button type="button" className="hc-lightbox-nav is-end" onClick={() => step(1)} aria-label={t('upload.next')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-flip"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </>
      )}
    </div>,
    document.body,
  );
};

export default Lightbox;
