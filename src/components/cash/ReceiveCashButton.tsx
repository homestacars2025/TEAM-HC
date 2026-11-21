import React from 'react';
import { useTranslation } from 'react-i18next';
import { useReceiveCash, type ReceiveCashPrefill } from './ReceiveCashContext';
import { CashIcon } from './ReceiveCashSheet';

/**
 * "Receive cash", wherever it's offered:
 * - `top`: the top bar; an icon on a phone, the label from a tablet up.
 * - `hero`: the home page's quick action, full width on a phone.
 * - `pill`: a smaller one in a header (the customer's wallet).
 * Hidden outside the provider.
 */
const ReceiveCashButton: React.FC<{ variant: 'top' | 'hero' | 'pill'; prefill?: ReceiveCashPrefill; className?: string }> = ({ variant, prefill, className }) => {
  const { t } = useTranslation('cash');
  const { available, open } = useReceiveCash();
  if (!available) return null;
  return (
    <button type="button" className={`hc-rc-cta is-${variant} ${className ?? ''}`} onClick={() => open(prefill)} aria-label={variant === 'top' ? t('title') : undefined}>
      <CashIcon size={variant === 'hero' ? 20 : 18} />
      <span className={variant === 'top' ? 'hidden sm:inline' : undefined}>{t('title')}</span>
    </button>
  );
};

export default ReceiveCashButton;
