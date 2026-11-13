import React, { useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Button from '../Button';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import { formatLira, hgsDay, type HgsGroup } from '../../lib/bookingWallet';
import { deleteHgsBatch, type HgsDeleteResult } from '../../lib/queries/bookingWallet';

/** "from 27/09 to 03/11", "on 02/10", with the year only when the range crosses one. */
export function hgsWhen(group: Pick<HgsGroup, 'from' | 'to'>, t: TFunction): string | null {
  if (!group.from || !group.to) return null;
  if (group.from === group.to) return t('hgs.on', { date: hgsDay(group.from) });
  const crossesYear = group.from.slice(0, 4) !== group.to.slice(0, 4);
  return t('hgs.range', { from: hgsDay(group.from, crossesYear), to: hgsDay(group.to, crossesYear) });
}

/**
 * Asks before deleting a booking's HGS charges, all of them or one batch, with an
 * optional reason, then calls `delete_customer_hgs_batch`. Finance only: the caller
 * shows the way here to finance alone, and the database refuses anyone else.
 */
export const HgsDeleteDialog: React.FC<{
  bookingId: number;
  bookingNumber: string;
  group: HgsGroup;
  /** `all`: every HGS charge of the booking. `batch`: only `group.eventNo`'s. */
  scope: 'all' | 'batch';
  onClose: () => void;
  onDeleted: (result: HgsDeleteResult) => void;
}> = ({ bookingId, bookingNumber, group, scope, onClose, onDeleted }) => {
  const { t } = useTranslation(['wallets', 'common']);
  useBlockedPage();
  const titleId = useId();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const when = hgsWhen(group, t);

  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, busy]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onDeleted(await deleteHgsBatch(bookingId, scope === 'all' ? null : group.eventNo, reason));
    } catch (reasonThrown) {
      setBusy(false);
      setError(t('hgsDelete.failed', { reason: reasonThrown instanceof Error ? reasonThrown.message : String(reasonThrown) }));
    }
  };

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop hc-cw-layer2" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="hc-ce hc-hgsdel surface-float">
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <h2 id={titleId}>{t(scope === 'all' ? 'hgsDelete.titleAll' : 'hgsDelete.titleBatch')}</h2>
            <p className="mt-0.5 text-[12.5px] text-black/50"><bdi dir="ltr" className="hc-num">{bookingNumber}</bdi></p>
          </div>
        </header>

        <div className="hc-ce-body">
          <dl className="hc-hgsdel-facts">
            <div><dt>{t('hgsDelete.entries')}</dt><dd className="hc-num">{group.charges.count}</dd></div>
            <div><dt>{t('hgsDelete.total')}</dt><dd><bdi dir="ltr" className="hc-num hc-money-mono">{formatLira(group.charges.total)}</bdi></dd></div>
            {when && <div><dt>{t('hgsDelete.dates')}</dt><dd>{when}</dd></div>}
          </dl>
          <p className="text-[12.5px] text-black/55">{t('hgsDelete.released')}</p>
          <div className="hc-ce-field">
            <label htmlFor={reasonId} className="hc-field-label">{t('hgsDelete.reason')}</label>
            <textarea id={reasonId} className="hc-input" rows={2} maxLength={500} dir="auto" value={reason} disabled={busy}
              placeholder={t('hgsDelete.reasonPlaceholder')} onChange={e => setReason(e.target.value)} />
          </div>
        </div>

        <footer className="hc-ce-foot">
          {error ? <p role="alert" className="hc-ce-save-error">{error}</p> : <span />}
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={busy}>{t('common:actions.cancel')}</Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy} aria-busy={busy}>
            {busy ? t('hgsDelete.deleting') : t('hgsDelete.confirm')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

export default HgsDeleteDialog;
