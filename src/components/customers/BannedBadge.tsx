import React from 'react';
import { useTranslation } from 'react-i18next';

interface BannedBadgeProps {
  reason?: string | null;
  /** Writes the reason out beside the badge, for a phone, where a tooltip never shows. */
  showReason?: boolean;
}

/** Ordinary text, not colour alone: the word has to survive a screen reader too. */
const BannedBadge: React.FC<BannedBadgeProps> = ({ reason, showReason = false }) => {
  const { t } = useTranslation('common');
  return (
    <span className="hc-banned-wrap">
      <span className="hc-banned" title={reason ?? undefined}>{t('customer.banned')}</span>
      {showReason && reason && <span className="hc-banned-reason" title={reason}>{reason}</span>}
    </span>
  );
};

export default BannedBadge;
