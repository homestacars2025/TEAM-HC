import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { envelopeCustomer, isOverdue, type Envelope, type EnvelopeStatus } from '../../lib/envelopes';
import { istanbulDate } from '../../lib/istanbulTime';
import { formatMoney } from '../../lib/suppliers';
import PlateChip from '../booking/PlateChip';

const STEPS: EnvelopeStatus[] = ['with_employee', 'in_safe', 'with_admin'];

/** How far an envelope has got. A cancelled one has no road left to show. */
export const EnvelopeTimeline: React.FC<{ status: EnvelopeStatus }> = ({ status }) => {
  const { t } = useTranslation('finance');
  if (status === 'cancelled') return <span className="hc-pill is-old">{t('cash.status.cancelled')}</span>;
  const reached = STEPS.indexOf(status);
  return (
    <ol className="hc-env-steps">
      {STEPS.map((step, index) => (
        <li key={step} className={index <= reached ? 'is-done' : undefined} aria-current={index === reached ? 'step' : undefined}>{t(`cash.status.${step}`)}</li>
      ))}
    </ol>
  );
};

const MyEnvelopes: React.FC<{ envelopes: Envelope[] | null; failed: boolean; now: number }> = ({ envelopes, failed, now }) => {
  const { t } = useTranslation('finance');
  const locale = useDateLocale();

  return (
    <section id="envelopes" className="surface-depth overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]">
      <header className="border-b border-[var(--border-subtle)] p-4 md:px-5">
        <h2 className="text-[15px] font-semibold text-[#0f1117]">{t('envelopes.title')}</h2>
      </header>
      {failed ? <p role="alert" className="px-5 py-8 text-center text-sm text-gray-500">{t('envelopes.failed')}</p>
        : envelopes === null ? <div className="m-5 h-8 animate-pulse rounded-md bg-black/[0.05]" />
        : envelopes.length === 0 ? <p className="px-5 py-10 text-center text-sm text-gray-500">{t('envelopes.empty')}</p>
        : (
          <ul>
            {envelopes.map(envelope => (
              <li key={envelope.id} className={`hc-env-row ${isOverdue(envelope, now) ? 'is-late' : ''}`}>
                <div className="min-w-0">
                  <strong dir="ltr" className="hc-num">{envelope.ref}</strong>
                  <small>{formatDay(istanbulDate(new Date(envelope.created_at)), locale)}{envelopeCustomer(envelope) ? ` · ${envelopeCustomer(envelope)}` : ''}</small>
                </div>
                {envelope.car && <PlateChip plate={envelope.car.plate_number} />}
                <b><bdi dir="ltr">{formatMoney(envelope.amount, envelope.currency)}</bdi></b>
                <EnvelopeTimeline status={envelope.status} />
              </li>
            ))}
          </ul>
        )}
    </section>
  );
};

export default MyEnvelopes;
