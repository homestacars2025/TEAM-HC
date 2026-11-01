import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { asIssueType, ISSUE_TYPES, type IssueRow, type IssueType } from '../../lib/carIssues';
import { istanbulDate } from '../../lib/istanbulTime';
import { recentCarIds, rememberCar } from '../../lib/queries/availability';
import { bookingsOnDay, getCarBookings, type CarBooking } from '../../lib/queries/carBookings';
import { addIssue, updateIssue, uploadIssuePhotos } from '../../lib/queries/carIssues';
import type { FineCar } from '../../lib/queries/fines';
import { supabase } from '../../lib/supabase';
import Button from '../Button';
import CustomerAvatar from '../CustomerAvatar';
import BookingSheet from '../booking/BookingSheet';
import CarPicker from '../booking/CarPicker';
import DateParts from '../booking/DateParts';
import { Field, FieldError, FormCard, FormError } from '../booking/FormParts';
import PlateChip from '../booking/PlateChip';
import { FINE_ICONS } from '../fines/parts';
import PhotoGrid from '../forms/PhotoGrid';
import StaffAvatar from '../StaffAvatar';
import { IssueIcon } from './parts';

interface IssueFormProps {
  /** Present when editing, which changes the type and the description only, as it always did. */
  issue?: IssueRow;
  cars: FineCar[] | null;
  carsFailed: boolean;
  onRetryCars: () => void;
  onClose: () => void;
  onSaved: () => void;
}

const IssueForm: React.FC<IssueFormProps> = ({ issue, cars, carsFailed, onRetryCars, onClose, onSaved }) => {
  const { t } = useTranslation('carIssues');
  const { t: tc } = useTranslation('common');
  const { t: tb } = useTranslation('bookings');
  const locale = useDateLocale();
  const { profile } = useCurrentUser();
  const closeRef = useRef<(() => void) | null>(null);
  const submitting = useRef(false);
  const carLabelId = React.useId();

  const [carId, setCarId] = useState<number | null>(null);
  const [type, setType] = useState<IssueType>(issue ? asIssueType(issue.type) : 'damage');
  const [description, setDescription] = useState(issue?.description ?? '');
  const [discoveredAt, setDiscoveredAt] = useState(istanbulDate());
  const [bookings, setBookings] = useState<CarBooking[] | null>(null);
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [problems, setProblems] = useState<{ car?: string; description?: string; date?: string }>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const recent = useMemo(() => (cars ? recentCarIds().flatMap(id => cars.filter(car => car.id === id)) : []), [cars]);

  useEffect(() => {
    setBookings(null);
    setBookingId(null);
    setChoosing(false);
    if (!carId) return undefined;
    let active = true;
    getCarBookings(carId).then(rows => { if (active) setBookings(rows); }).catch(() => { if (active) setBookings([]); });
    return () => { active = false; };
  }, [carId]);

  // The booking that had the car on that day, otherwise its latest.
  const suggested = useMemo(() => (bookings ? bookingsOnDay(bookings, discoveredAt)[0] ?? bookings[0] ?? null : null), [bookings, discoveredAt]);
  const linked = bookings?.find(booking => booking.id === bookingId) ?? null;

  const dirty = issue
    ? type !== asIssueType(issue.type) || description !== (issue.description ?? '')
    : !!carId || !!description || files.length > 0;

  const bookingRow = (booking: CarBooking, action: React.ReactNode, onClick?: () => void) => (
    <div key={booking.id} className={`hc-suggest ${onClick ? 'is-pick' : ''}`} onClick={onClick}>
      <CustomerAvatar size={34} />
      <span className="min-w-0 flex-1">
        <span dir="auto" className="block truncate text-sm font-semibold text-[#0f1117]">{booking.customer_name ?? t('add.unknownCustomer')}</span>
        <span className="block text-xs text-gray-500"><span className="hc-num">{booking.booking_number ?? `#${booking.id}`}</span> · {tb('range.span', { start: formatDay(booking.start_date, locale), end: formatDay(booking.end_date, locale) })}</span>
      </span>
      {action}
    </div>
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setFailure(null);

    const found: typeof problems = {};
    if (!issue && !carId) found.car = t('errors.selectCar');
    if (!description.trim()) found.description = t(issue ? 'errors.emptyDescription' : 'errors.description');
    if (!issue && !discoveredAt) found.date = t('errors.discovered');
    setProblems(found);
    if (Object.keys(found).length > 0) return;

    submitting.current = true;
    setSaving(true);
    try {
      if (issue) {
        await updateIssue(issue.id, { type, description: description.trim() });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        let damage_photos: string[] = [];
        if (files.length > 0) {
          setProgress(0);
          const { urls, failed } = await uploadIssuePhotos(files, `${carId}/damage`, setProgress);
          if (failed > 0 && urls.length === 0) { setFailure(t('errors.photoUpload')); return; }
          damage_photos = urls;
        }
        await addIssue({
          car_id: carId as number,
          type,
          description: description.trim(),
          damage_photos,
          discovered_at: discoveredAt,
          discovered_by: user?.id ?? null,
          booking_id: linked?.id ?? null,
          customer_id: linked?.customer_id ?? null,
        });
        rememberCar(carId as number);
      }
      onSaved();
    } catch {
      setFailure(t('errors.saveFailed'));
    } finally {
      submitting.current = false;
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <BookingSheet
      narrow
      title={issue ? t('edit.title') : t('add.title')}
      subtitle={issue ? issue.plate_number : t('add.subtitle')}
      alerts={failure ? <FormError>{failure}</FormError> : undefined}
      dirty={dirty}
      busy={saving}
      onClose={onClose}
      onSubmit={onSubmit}
      closeRef={closeRef}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={() => closeRef.current?.()}>{tc('actions.cancel')}</Button>
          <Button type="submit" className="hc-bs-primary" disabled={saving}>{saving ? t('add.saving') : issue ? tc('actions.saveChanges') : t('logIssue')}</Button>
        </>
      )}
    >
      <FormCard icon={FINE_ICONS.car} title={tc('fields.car')}>
        {issue ? (
          <div className="hc-field-wide flex flex-wrap items-center gap-3">
            <PlateChip plate={issue.plate_number} />
            {issue.model_name && <span dir="auto" className="text-sm text-gray-600">{issue.model_name}</span>}
          </div>
        ) : (
          <>
            <Field label={tc('fields.car')} required wide>
              <CarPicker labelId={carLabelId} cars={cars} failed={carsFailed} onRetry={onRetryCars} recent={recent} value={carId} onChange={id => { setCarId(id); setProblems(p => ({ ...p, car: undefined })); }} disabled={saving} />
              <FieldError>{problems.car}</FieldError>
              <span id={carLabelId} hidden>{tc('fields.car')}</span>
            </Field>
            {carId && (
              <Field label={t('add.bookingOptional')} wide>
                {!bookings ? (
                  <p role="status" className="text-[13px] text-gray-500">{t('add.loadingBookings')}</p>
                ) : bookings.length === 0 ? (
                  <p className="text-[13px] text-gray-500">{t('add.noBookings')}</p>
                ) : linked ? (
                  bookingRow(linked, <button type="button" onClick={() => setBookingId(null)}>{t('add.unlink')}</button>)
                ) : (
                  <>
                    {suggested && bookingRow(suggested, <button type="button" onClick={() => setBookingId(suggested.id)}>{t('add.linkBooking')}</button>)}
                    {bookings.length > 1 && !choosing && (
                      <button type="button" className="hc-cust-new" onClick={() => setChoosing(true)}>{t('add.otherBooking')}</button>
                    )}
                    {choosing && (
                      <div className="hc-suggest-list mt-2">
                        {bookings.filter(booking => booking.id !== suggested?.id).map(booking => bookingRow(booking, <button type="button" onClick={() => setBookingId(booking.id)}>{t('add.linkBooking')}</button>))}
                      </div>
                    )}
                  </>
                )}
              </Field>
            )}
          </>
        )}
      </FormCard>

      <FormCard icon={<IssueIcon type="accident" size={15} />} title={t('add.typeSection')}>
        <div role="radiogroup" aria-label={tc('fields.type')} className="hc-type-grid hc-field-wide">
          {ISSUE_TYPES.map(option => (
            <label key={option} className={`hc-type-card is-${option} ${type === option ? 'is-selected' : ''}`}>
              <input type="radio" name="issue-type" checked={type === option} onChange={() => setType(option)} />
              <span className="hc-type-icon"><IssueIcon type={option} size={20} /></span>
              <span>{t(`types.${option}`)}</span>
            </label>
          ))}
        </div>
      </FormCard>

      <FormCard icon={FINE_ICONS.document} title={tc('fields.description')}>
        <Field label={tc('fields.description')} required wide>
          <textarea
            className={problems.description ? 'hc-input is-invalid' : 'hc-input'}
            rows={4}
            value={description}
            onChange={e => { setDescription(e.target.value); setProblems(p => ({ ...p, description: undefined })); }}
            placeholder={t('add.descriptionHelp')}
          />
          <FieldError>{problems.description}</FieldError>
        </Field>
      </FormCard>

      {!issue && (
        <>
          <FormCard icon={FINE_ICONS.image} title={t('add.damagePhotos')}>
            <div className="hc-field-wide"><PhotoGrid files={files} onChange={setFiles} disabled={saving} progress={progress} /></div>
          </FormCard>
          <FormCard icon={FINE_ICONS.timeline} title={t('add.whenSection')}>
            <Field label={t('add.discoveredOn')} required>
              <DateParts label={t('add.discoveredOn')} locale={locale} invalid={!!problems.date} value={discoveredAt} onChange={setDiscoveredAt} />
              <FieldError>{problems.date}</FieldError>
            </Field>
            <Field label={t('detail.loggedBy')}>
              <div className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
                <StaffAvatar profile={profile} size={26} />
                <span dir="auto">{profile?.full_name ?? '—'}</span>
              </div>
            </Field>
          </FormCard>
        </>
      )}
    </BookingSheet>
  );
};

export default IssueForm;
