import React from 'react';
import { useTranslation } from 'react-i18next';
import { balanceTone, formatLira, type LineKind } from '../../lib/bookingWallet';

/** "Credit ₺X", "Owes ₺X" or "Settled", coloured to match. */
export const BalanceChip: React.FC<{ balance: number; size?: 'sm' | 'lg' }> = ({ balance, size = 'sm' }) => {
  const { t } = useTranslation('wallets');
  const tone = balanceTone(balance);
  return (
    <span className={`hc-cw-chip is-${tone} is-${size}`}>
      {tone === 'settled' ? t('wallet.settled') : <>{t(`wallet.${tone}`)} <bdi dir="ltr" className="hc-num">{formatLira(balance)}</bdi></>}
    </span>
  );
};

const GLYPHS: Record<LineKind, React.ReactNode> = {
  rental: <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  deposit: <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />,
  payment: <><rect x="2.5" y="6" width="19" height="13" rx="2.5" /><path d="M2.5 10.5h19M6.5 15h3" /></>,
  hgs: <path d="M8 3L5 21M16 3l3 18M12 4v2.5M12 10.5v3M12 17.5V20" />,
  transfer: <path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5" />,
  refund: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" />,
  other: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /><path d="M9 8h6M9 12h6" /></>,
};

export const LineGlyph: React.FC<{ kind: LineKind }> = ({ kind }) => (
  <span aria-hidden="true" className={`hc-cw-glyph is-${kind}`}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{GLYPHS[kind]}</svg>
  </span>
);

export const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);

export const MoveIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5" /></svg>
);
