import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BOOKING_TABS, type BookingTab } from '../../lib/bookingTabs';

interface BookingTabsBarProps {
  tab: BookingTab;
  /** `null` while that tab's count is loading. */
  counts: Record<BookingTab, number | null>;
  onChange: (tab: BookingTab) => void;
}

const BookingTabsBar: React.FC<BookingTabsBarProps> = ({ tab, counts, onChange }) => {
  const { t } = useTranslation('bookings');
  const list = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const forward = (e.key === 'ArrowRight') === (document.documentElement.dir !== 'rtl');
    const next = BOOKING_TABS[(BOOKING_TABS.indexOf(tab) + (forward ? 1 : BOOKING_TABS.length - 1)) % BOOKING_TABS.length];
    onChange(next);
    window.setTimeout(() => list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus(), 0);
  };

  return (
    <div ref={list} role="tablist" aria-label={t('tabs.label')} className="hc-bk-tabs" onKeyDown={onKeyDown}>
      {BOOKING_TABS.map(item => (
        <button key={item} type="button" role="tab" aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onClick={() => onChange(item)}>
          {t(`tabs.${item}`)}
          {counts[item] !== null && <span className="hc-num">{counts[item]}</span>}
        </button>
      ))}
    </div>
  );
};

export default BookingTabsBar;
