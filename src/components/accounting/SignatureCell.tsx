import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '../../hooks/useDateLocale';
import type { FinanceSigner } from '../../lib/queries/expenseReview';
import { formatSignalTime } from '../../lib/tracking';
import StaffAvatar from '../StaffAvatar';

interface SignatureCellProps {
  signer: FinanceSigner;
  /** When they signed, or `undefined` if they have not. */
  signedAt: string | undefined;
  /** The signed-in person's own cell is the only one that can be pressed. */
  onToggle?: () => void;
}

/** The avatar stays in the markup when unsigned: on a phone there is no header to say whose cell it is. */
const SignatureCell: React.FC<SignatureCellProps> = ({ signer, signedAt, onToggle }) => {
  const { t } = useTranslation('finance');
  const locale = useDateLocale();
  const name = signer.full_name ?? '—';
  const label = signedAt ? t('sign.signed', { name, time: formatSignalTime(signedAt, locale) }) : t('sign.unsigned', { name });
  const face = (
    <>
      <StaffAvatar profile={signer} size={26} />
      {signedAt && (
        <i aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </i>
      )}
    </>
  );
  const className = `hc-sig ${signedAt ? 'is-signed' : 'is-empty'}`;

  if (!onToggle) return <span role="img" aria-label={label} title={label} className={className}>{face}</span>;
  return <button type="button" aria-pressed={!!signedAt} aria-label={label} title={label} className={`${className} is-mine`} onClick={onToggle}>{face}</button>;
};

export default SignatureCell;
