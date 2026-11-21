import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatCashAmount, heldFor, heldSummary, heldTooLong, type HeldEnvelope } from '../../lib/receiveCash';
import { getHeldEnvelopes } from '../../lib/queries/receiveCash';
import { useReceiveCash } from './ReceiveCashContext';

const SHOWN = 6;

/**
 * "My envelopes" on the home page, from `my_held_envelopes()`: the cash still with this
 * person, oldest first, with anything past a day in amber. Finance gets everyone's from
 * the same call, and the card says so.
 */
const HeldEnvelopesCard: React.FC<{ everyone: boolean; custodyRoute: string | null }> = ({ everyone, custodyRoute }) => {
  const { t } = useTranslation('cash');
  const { version } = useReceiveCash();
  const [envelopes, setEnvelopes] = useState<HeldEnvelope[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    setFailed(false);
    getHeldEnvelopes()
      .then(rows => { if (active) { setEnvelopes(rows); setNow(Date.now()); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [version, attempt]);

  // "3 hours ago" keeps counting while the page is open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const summary = envelopes ? heldSummary(envelopes, now) : null;
  const ago = (createdAt: string) => {
    const age = heldFor(createdAt, now);
    if (!age) return '';
    return age.unit === 'now' ? t('held.now') : t(`held.${age.unit}`, { count: age.count });
  };

  return (
    <section className={`hc-rc-held surface-depth ${summary && summary.late > 0 ? 'is-late' : ''}`} aria-labelledby="hc-rc-held-title">
      <header className="hc-rc-held-head">
        <div className="min-w-0">
          <h2 id="hc-rc-held-title">{everyone ? t('held.titleAll') : t('held.title')}</h2>
          <p>{failed ? t('held.failed') : !summary ? ' ' : summary.count === 0 ? t('held.none') : summary.late > 0 ? t('held.late', { count: summary.late }) : t('held.hint')}</p>
        </div>
        {summary && summary.count > 0 && (
          <div className="hc-rc-held-sum">
            <b>{t('held.count', { count: summary.count })}</b>
            <span dir="ltr">{summary.totals.map(row => formatCashAmount(row.total, row.currency)).join(' · ')}</span>
          </div>
        )}
      </header>

      {failed ? (
        <div className="hc-rc-held-state"><button type="button" className="hc-rc-link" onClick={() => setAttempt(n => n + 1)}>{t('retry')}</button></div>
      ) : envelopes === null ? (
        <div className="hc-rc-held-list" aria-busy="true">{[0, 1].map(i => <span key={i} className="hc-rc-bone is-row" />)}</div>
      ) : envelopes.length > 0 && (
        <ul className="hc-rc-held-list">
          {envelopes.slice(0, SHOWN).map(envelope => {
            const late = heldTooLong(envelope, now);
            return (
              <li key={envelope.id} className={late ? 'is-late' : undefined}>
                <span className="min-w-0">
                  <strong dir="ltr" className="hc-num">{envelope.ref}</strong>
                  <small><bdi dir="auto">{envelope.customer || envelope.bookingNumber || '—'}</bdi></small>
                </span>
                <span className="hc-rc-held-amount">
                  <b dir="ltr" className="hc-num">{formatCashAmount(envelope.amount, envelope.currency)}</b>
                  <small className={late ? 'is-late' : undefined}>{ago(envelope.createdAt)}</small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {envelopes && envelopes.length > SHOWN && custodyRoute && (
        <Link to={`${custodyRoute}#envelopes`} className="hc-rc-link hc-rc-held-more">{t('held.more', { n: envelopes.length - SHOWN })}</Link>
      )}
    </section>
  );
};

export default HeldEnvelopesCard;
