import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import type { BookingExtension } from '../../lib/bookingTabs';
import { formatMoney } from '../../lib/suppliers';
import PlateChip from '../booking/PlateChip';
import CustomerAvatar from '../CustomerAvatar';

interface ExtensionsListProps {
  rows: BookingExtension[];
  onOpen: (row: BookingExtension) => void;
}

const ExtensionsList: React.FC<ExtensionsListProps> = ({ rows, onOpen }) => {
  const { t } = useTranslation('bookings');
  const locale = useDateLocale();

  return (
    <div className="hc-cash-table hc-bk-table hc-bk-ext surface-depth">
      <table>
        <thead>
          <tr>
            <th>{t('extensions.extension')}</th>
            <th>{t('extensions.car')}</th>
            <th>{t('extensions.customer')}</th>
            <th>{t('extensions.period')}</th>
            <th>{t('extensions.amount')}</th>
            <th>{t('extensions.enteredBy')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.event_id} className={row.rental_amount === 0 ? 'is-zero' : undefined} onClick={() => onOpen(row)}>
              <td className="hc-bk-c-ref">
                <span className="hc-bk-badge">{t('extensions.badge', { no: row.event_no })}</span>
                <button type="button" className="hc-bk-link hc-num" onClick={e => { e.stopPropagation(); onOpen(row); }}>{row.booking_number}</button>
                {row.is_legacy && <span className="hc-bk-legacy">{t('extensions.legacy')}</span>}
              </td>
              <td data-label={t('extensions.car')} className="hc-bk-c-car">
                {row.plate && <PlateChip plate={row.plate} />}
                <span><bdi dir="auto">{row.car_model ?? '—'}</bdi></span>
              </td>
              <td data-label={t('extensions.customer')} className="hc-bk-c-who">
                <CustomerAvatar size={28} />
                <bdi dir="auto">{row.customer_name || '—'}</bdi>
              </td>
              <td data-label={t('extensions.period')} className="hc-bk-c-period">
                {row.period_start ? (
                  <>
                    <span>{formatDay(row.period_start, locale)} → {formatDay(row.period_end, locale)}</span>
                    {row.days !== null && <small>{t('range.days', { count: row.days })}</small>}
                  </>
                ) : '—'}
              </td>
              <td data-label={t('extensions.amount')} className="hc-bk-c-amount">
                <b className="hc-num" dir="ltr">{formatMoney(row.rental_amount, 'TRY')}</b>
              </td>
              <td data-label={t('extensions.enteredBy')} className="hc-bk-c-by">
                <span>{row.created_by_name ?? '—'}</span>
                <small>{formatDay(row.created_at.slice(0, 10), locale)}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ExtensionsList;
