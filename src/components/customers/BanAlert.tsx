import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { BanMatch } from '../../lib/queries/customers';

interface BanAlertProps {
  ban: Pick<BanMatch, 'full_name' | 'ban_reason'> & { matched_on?: BanMatch['matched_on'] };
  /** Read-only info rather than a refusal: an existing booking can still be managed. */
  notice?: boolean;
}

const BanAlert: React.FC<BanAlertProps> = ({ ban, notice = false }) => {
  const { t } = useTranslation('common');
  const ref = useRef<HTMLDivElement>(null);

  // It appears at the end of a long form, usually below where someone is looking.
  useEffect(() => {
    if (!notice) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [notice]);

  const viaSomeoneElse = ban.matched_on === 'phone' || ban.matched_on === 'id_number';

  return (
    <div ref={ref} role="alert" className="hc-ban-alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M5.8 5.8l12.4 12.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="min-w-0">
        <div className="font-semibold">
          {ban.ban_reason ? t('customer.bannedWithReason', { reason: ban.ban_reason }) : t('customer.bannedNoReason')}
        </div>
        {viaSomeoneElse && (
          <div className="mt-0.5 text-[13px]">
            {t(ban.matched_on === 'phone' ? 'customer.matchedPhone' : 'customer.matchedId', { name: ban.full_name })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BanAlert;
