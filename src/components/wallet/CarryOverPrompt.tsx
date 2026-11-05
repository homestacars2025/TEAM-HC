import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { balanceTone, buildWallet, formatLira, leftoverBalance } from '../../lib/bookingWallet';
import { getCustomerWallet, type CustomerWalletData, type TransferResult } from '../../lib/queries/bookingWallet';
import MoveBalanceSheet from './MoveBalanceSheet';
import { MoveIcon } from './WalletParts';

/**
 * After a new booking or an extension: when one of the customer's other bookings still
 * holds money, offer to bring it to this one. After a move it looks again, so a second
 * leftover is offered next. Shows nothing when there is nothing to move.
 */
const CarryOverPrompt: React.FC<{
  bookingId: number;
  customerId: string;
  onDismiss: () => void;
  onMoved: (message: string) => void;
}> = ({ bookingId, customerId, onDismiss, onMoved }) => {
  const { t } = useTranslation('wallets');
  const [data, setData] = useState<CustomerWalletData | null>(null);
  const [reload, setReload] = useState(0);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    let active = true;
    getCustomerWallet(customerId).then(next => { if (active) setData(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [customerId, reload]);

  const wallet = useMemo(() => (data ? buildWallet(data.rows, data.bookings, data.replacements) : []), [data]);
  const target = wallet.find(entry => entry.booking.id === bookingId) ?? null;
  const leftover = target ? leftoverBalance(wallet, bookingId) : null;

  if (!target || !leftover) return null;

  const from = leftover.booking.booking_number ?? `#${leftover.booking.id}`;
  const to = target.booking.booking_number ?? `#${target.booking.id}`;
  const owes = balanceTone(leftover.balance) === 'owes';

  const moved = (result: TransferResult) => {
    setMoving(false);
    onMoved(t('move.done', { amount: formatLira(result.amount), number: result.to }));
    setReload(value => value + 1);
  };

  return (
    <>
      <div role="status" className={`hc-cw-carry surface-depth is-${owes ? 'owes' : 'credit'}`}>
        <span aria-hidden="true" className="hc-cw-move-badge"><MoveIcon /></span>
        <p>
          {t(owes ? 'carry.owes' : 'carry.credit', { from, to, amount: formatLira(leftover.balance) })}
        </p>
        <div className="hc-cw-carry-actions">
          <button type="button" className="hc-btn hc-btn-primary" onClick={() => setMoving(true)}>{t('carry.move')}</button>
          <button type="button" className="hc-btn hc-btn-secondary" onClick={onDismiss}>{t('carry.later')}</button>
        </div>
      </div>
      {moving && <MoveBalanceSheet from={leftover} wallet={wallet} target={bookingId} onClose={() => setMoving(false)} onMoved={moved} />}
    </>
  );
};

export default CarryOverPrompt;
