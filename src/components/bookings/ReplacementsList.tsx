import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { rentalDays } from '../../lib/bookingDates';
import { isOpenSheet, type SheetRow } from '../../lib/bookingTabs';
import PlateChip from '../booking/PlateChip';
import Button from '../Button';
import CustomerAvatar from '../CustomerAvatar';
import BannedBadge from '../customers/BannedBadge';

interface ReplacementsListProps<T extends SheetRow> {
  rows: T[];
  today: string;
  onEdit: (sheet: T) => void;
  onPrint: (sheet: T) => void;
}

function ReplacementsList<T extends SheetRow>({ rows, today, onEdit, onPrint }: ReplacementsListProps<T>) {
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();

  return (
    <div className="hc-cash-table hc-bk-table hc-bk-sheets surface-depth">
      <table>
        <thead>
          <tr>
            <th>{t('replacement.sheetNo')}</th>
            <th>{tc('fields.customer')}</th>
            <th>{t('replacement.originalToReplacement')}</th>
            <th>{t('replacement.period')}</th>
            <th>{tc('fields.status')}</th>
            <th aria-label={t('table.actions')} />
          </tr>
        </thead>
        <tbody>
          {rows.map(sheet => {
            const open = isOpenSheet(sheet, today);
            return (
              <tr key={sheet.id}>
                <td className="hc-bk-c-ref"><strong className="hc-num">{sheet.sheet_number}</strong></td>
                <td data-label={tc('fields.status')} className="hc-bk-c-state">
                  <span className={`hc-bk-state ${open ? 'is-open' : ''}`}>{t(open ? 'sheetStatus.open' : 'sheetStatus.closed')}</span>
                </td>
                <td data-label={tc('fields.customer')} className="hc-bk-c-who">
                  <CustomerAvatar size={28} />
                  <span>
                    <bdi dir="auto">{sheet.customer_name || '—'}</bdi>
                    {sheet.original_booking_number && <small className="hc-num">{sheet.original_booking_number}</small>}
                    {sheet.customer_banned && <BannedBadge reason={sheet.customer_ban_reason} showReason />}
                  </span>
                </td>
                <td data-label={t('replacement.originalToReplacement')} className="hc-bk-c-swap">
                  {sheet.original_plate ? <PlateChip plate={sheet.original_plate} /> : '—'}
                  <span aria-hidden="true" className="hc-flip">→</span>
                  <PlateChip plate={sheet.replacement_plate} />
                </td>
                <td data-label={t('replacement.period')} className="hc-bk-c-period">
                  <span>{formatDay(sheet.start_date, locale)} → {formatDay(sheet.end_date, locale)}</span>
                  <small>{t('range.days', { count: rentalDays(sheet.start_date, sheet.end_date) })}</small>
                </td>
                <td className="hc-bk-c-actions">
                  <Button variant="secondary" onClick={() => onEdit(sheet)}>{t('replacement.edit')}</Button>
                  <Button variant="secondary" onClick={() => onPrint(sheet)}>{t('reprint')}</Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ReplacementsList;
