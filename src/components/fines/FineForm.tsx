import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import type { Fine } from '../../lib/fines';
import { bookingsOnDay, getCarBookings, type CarBooking } from '../../lib/queries/carBookings';
import { recentCarIds, rememberCar } from '../../lib/queries/availability';
import { addFine, nextFineSequence, updateFine, uploadFineFile, type FineCar, type FineChange } from '../../lib/queries/fines';
import Button from '../Button';
import CustomerAvatar from '../CustomerAvatar';
import BookingSheet from '../booking/BookingSheet';
import CarPicker from '../booking/CarPicker';
import DateParts from '../booking/DateParts';
import { Field, FieldError, FormCard, FormError } from '../booking/FormParts';
import MoneyField from '../booking/MoneyField';
import BannedBadge from '../customers/BannedBadge';
import CustomerSearch from '../customers/CustomerSearch';
import FileDrop from '../forms/FileDrop';
import TimeParts from '../forms/TimeParts';
import { FINE_ICONS } from './parts';

interface FineFormProps {
  /** Present when editing. */
  fine?: Fine;
  cars: FineCar[] | null;
  carsFailed: boolean;
  onRetryCars: () => void;
  onClose: () => void;
  onSaved: () => void;
}

type Problem = 'number' | 'car' | 'amount' | 'date';

const FineForm: React.FC<FineFormProps> = ({ fine, cars, carsFailed, onRetryCars, onClose, onSaved }) => {
  const { t } = useTranslation('fines');
  const { t: tc } = useTranslation('common');
  const { t: tb } = useTranslation('bookings');
  const locale = useDateLocale();
  const closeRef = useRef<(() => void) | null>(null);
  const submitting = useRef(false);
  const carLabelId = React.useId();

  const initial = useMemo(() => ({
    violation_number: fine?.violation_number ?? '',
    violation_code: fine?.violation_code ?? '',
    article: fine?.article ?? '',
    description: fine?.description ?? '',
    location: fine?.location ?? '',
    violation_date: fine?.violation_date ?? '',
    violation_time: fine?.violation_time ?? '',
    notification_date: fine?.notification_date ?? '',
    car_id: fine?.car_id ?? null as number | null,
    plate_number: fine?.plate_number ?? '',
    customer_id: fine?.customer_id ?? null as string | null,
    amount: fine?.amount != null ? String(fine.amount) : '',
  }), [fine]);

  const [form, setForm] = useState(initial);
  const [customerName, setCustomerName] = useState(fine?.customer_name ?? '');
  const [searching, setSearching] = useState(false);
  const [image, setImage] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [progress, setProgress] = useState<Record<string, number | null>>({});
  const [bookings, setBookings] = useState<CarBooking[] | null>(null);
  const [problems, setProblems] = useState<Partial<Record<Problem, string>>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const lastCar = useRef(form.car_id);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(current => ({ ...current, [key]: value }));
  const clearProblem = (key: Problem) => setProblems(current => ({ ...current, [key]: undefined }));

  // A fine may point at a car that has since left the fleet.
  const carList = useMemo(() => {
    if (!cars || !fine?.car_id || cars.some(car => car.id === fine.car_id)) return cars;
    return [...cars, { id: fine.car_id, plate_number: fine.plate_number, model: null }];
  }, [cars, fine]);
  const recent = useMemo(() => (carList ? recentCarIds().flatMap(id => carList.filter(car => car.id === id)) : []), [carList]);

  useEffect(() => {
    setBookings(null);
    if (!form.car_id) return undefined;
    let active = true;
    getCarBookings(form.car_id).then(rows => { if (active) setBookings(rows); }).catch(() => { if (active) setBookings([]); });
    return () => { active = false; };
  }, [form.car_id]);

  const chooseCar = (id: number | null) => {
    if (id === null) { set('car_id', null); return; }
    const car = carList?.find(item => item.id === id);
    // Whoever was linked belonged to the previous car.
    const moved = id !== lastCar.current;
    lastCar.current = id;
    setForm(current => ({ ...current, car_id: id, plate_number: car?.plate_number ?? current.plate_number, customer_id: moved ? null : current.customer_id }));
    if (moved) setCustomerName('');
    clearProblem('car');
  };

  const suggestions = useMemo(
    () => (bookings && form.violation_date ? bookingsOnDay(bookings, form.violation_date).filter(booking => booking.customer_id) : []),
    [bookings, form.violation_date],
  );

  const pickCustomer = (id: string, name: string | null) => {
    set('customer_id', id);
    setCustomerName(name ?? '');
    setSearching(false);
  };

  const dirty = !!image || !!pdf || !!receipt || (Object.keys(form) as (keyof typeof form)[]).some(key => form[key] !== initial[key]);

  const validate = () => {
    const found: Partial<Record<Problem, string>> = {};
    if (!form.violation_number.trim()) found.number = t('errors.number');
    if (!fine && !form.car_id) found.car = t('errors.car');
    if (!form.amount) found.amount = t('errors.amount');
    if (!form.violation_date) found.date = t('errors.date');
    setProblems(found);
    return Object.keys(found).length === 0;
  };

  const track = (key: string) => (percent: number) => setProgress(current => ({ ...current, [key]: percent }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || !validate()) return;
    submitting.current = true;
    setSaving(true);
    setFailed(false);
    try {
      const plate = form.plate_number || fine?.plate_number || '';
      const sequence = await nextFineSequence(plate);
      // A replacement gets its own name, so it can never overwrite another fine's file.
      const name = fine ? `${plate}-${sequence}-${Date.now()}` : `${plate}-${sequence}`;
      const fine_image_url = image ? await uploadFineFile('CZ-R', name, image, track('image')) : undefined;
      const fine_pdf_url = pdf ? await uploadFineFile('CZ-D', name, pdf, track('pdf')) : undefined;
      const payment_receipt_url = receipt ? await uploadFineFile('CZ-F', name, receipt, track('receipt')) : undefined;

      const change: FineChange = {
        violation_number: form.violation_number.trim(),
        violation_code: form.violation_code.trim() || null,
        car_id: form.car_id ?? fine?.car_id ?? null,
        plate_number: plate,
        customer_id: form.customer_id,
        amount: parseFloat(form.amount),
        violation_date: form.violation_date || null,
        violation_time: form.violation_time || null,
        notification_date: form.notification_date || null,
        location: form.location || null,
        article: form.article || null,
        description: form.description || null,
        ...(fine_image_url !== undefined && { fine_image_url }),
        ...(fine_pdf_url !== undefined && { fine_pdf_url }),
        ...(payment_receipt_url !== undefined && { payment_receipt_url }),
      };
      if (fine) await updateFine(fine.id, change);
      else await addFine(change);
      if (form.car_id) rememberCar(form.car_id);
      onSaved();
    } catch {
      setFailed(true);
      setProgress({});
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const status = fine?.status ?? 'unpaid';

  return (
    <BookingSheet
      narrow
      title={fine ? t('form.editTitle') : t('form.addTitle')}
      subtitle={fine ? fine.violation_number ?? undefined : t('form.addSubtitle')}
      alerts={failed ? <FormError>{t('form.saveError')}</FormError> : undefined}
      dirty={dirty}
      busy={saving}
      onClose={onClose}
      onSubmit={onSubmit}
      closeRef={closeRef}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={() => closeRef.current?.()}>{tc('actions.cancel')}</Button>
          <Button type="submit" className="hc-bs-primary" disabled={saving}>
            {saving ? t('form.saving') : fine ? t('form.saveChanges') : t('form.addTitle')}
          </Button>
        </>
      )}
    >
      <FormCard icon={FINE_ICONS.fine} title={t('form.sectionViolation')}>
        <Field label={t('form.violationNumber')} required>
          <input
            className={problems.number ? 'hc-input is-invalid' : 'hc-input'}
            dir="ltr"
            value={form.violation_number}
            onChange={e => { set('violation_number', e.target.value); clearProblem('number'); }}
            placeholder={t('form.violationNoPlaceholder')}
          />
          <FieldError>{problems.number}</FieldError>
        </Field>
        <Field label={t('form.violationCode')}>
          <input className="hc-input" dir="ltr" value={form.violation_code} onChange={e => set('violation_code', e.target.value)} />
        </Field>
        <Field label={t('form.article')}>
          <input className="hc-input" value={form.article} onChange={e => set('article', e.target.value)} placeholder={t('form.articlePlaceholder')} />
        </Field>
        <Field label={t('table.location')}>
          <input className="hc-input" value={form.location} onChange={e => set('location', e.target.value)} placeholder={t('form.locationPlaceholder')} />
        </Field>
        <Field label={t('form.violationDate')} required>
          <DateParts label={t('form.violationDate')} locale={locale} invalid={!!problems.date} value={form.violation_date} onChange={value => { set('violation_date', value); clearProblem('date'); }} />
          <FieldError>{problems.date}</FieldError>
        </Field>
        <Field label={t('form.violationTime')}>
          <TimeParts label={t('form.violationTime')} value={form.violation_time} onChange={value => set('violation_time', value)} />
        </Field>
        <Field label={t('form.notificationDate')}>
          <DateParts label={t('form.notificationDate')} locale={locale} value={form.notification_date} onChange={value => set('notification_date', value)} />
        </Field>
        <Field label={tc('fields.description')} wide>
          <textarea className="hc-input" rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder={t('form.descriptionPlaceholder')} />
        </Field>
      </FormCard>

      <FormCard icon={FINE_ICONS.car} title={t('form.sectionCar')}>
        <Field label={tc('fields.car')} required={!fine} wide>
          <CarPicker labelId={carLabelId} cars={carList} failed={carsFailed} onRetry={onRetryCars} recent={recent} value={form.car_id} onChange={chooseCar} disabled={saving} />
          <FieldError>{problems.car}</FieldError>
          <span id={carLabelId} hidden>{tc('fields.car')}</span>
        </Field>

        <Field label={tc('fields.customer')} wide>
          {form.customer_id && !searching ? (
            <div className="hc-cust-chosen">
              <span className="flex min-w-0 items-center gap-2">
                <CustomerAvatar size={24} />
                <span dir="auto" className="truncate">{customerName || t('form.customerLinked')}</span>
              </span>
              <button type="button" onClick={() => setSearching(true)}>{t('form.changeCustomer')}</button>
            </div>
          ) : (
            <>
              {suggestions.length > 0 ? (
                <div className="hc-suggest-list">
                  <p>{t('form.suggestTitle')}</p>
                  {suggestions.map(booking => (
                    <div key={booking.id} className="hc-suggest">
                      <CustomerAvatar size={34} />
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#0f1117]">
                          {booking.customer_name}
                          {booking.customer_banned && <BannedBadge />}
                        </span>
                        <span className="block text-xs text-gray-500"><span className="hc-num">{booking.booking_number}</span> · {tb('range.span', { start: formatDay(booking.start_date, locale), end: formatDay(booking.end_date, locale) })}</span>
                      </span>
                      <button type="button" onClick={() => pickCustomer(booking.customer_id as string, booking.customer_name)}>{t('form.useCustomer')}</button>
                    </div>
                  ))}
                </div>
              ) : form.car_id && form.violation_date && bookings ? (
                <p className="mb-2 text-[13px] text-gray-500">{t('form.noBookingThatDay')}</p>
              ) : null}
              <CustomerSearch
                allowBanned
                required={false}
                onSelect={customer => pickCustomer(customer.id, customer.full_name)}
                flagFor={() => ''}
                formatDate={date => formatDay(date, locale)}
              />
              {searching && form.customer_id && (
                <button type="button" className="hc-cust-new" onClick={() => setSearching(false)}>{tc('actions.cancel')}</button>
              )}
            </>
          )}
        </Field>
      </FormCard>

      <FormCard icon={FINE_ICONS.money} title={t('form.sectionAmount')}>
        <Field label={t('form.amountLabel')} required>
          <MoneyField ariaLabel={t('form.amountLabel')} currency="TRY" rate={null} value={form.amount} onChange={value => { set('amount', value); clearProblem('amount'); }} />
          <FieldError>{problems.amount}</FieldError>
        </Field>
        <Field label={tc('fields.status')}>
          <div role="group" aria-label={tc('fields.status')} className="hc-seg hc-seg-full">
            {(['unpaid', 'paid'] as const).map(option => (
              <button key={option} type="button" disabled aria-pressed={status === option}>{t(`status.${option}`)}</button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">{t(status === 'paid' ? 'form.statusPaidHint' : 'form.statusHint')}</p>
        </Field>
      </FormCard>

      <FormCard icon={FINE_ICONS.document} title={t('form.sectionDocs')}>
        <FileDrop label={t('form.fineImage')} kind="image" file={image} existingUrl={fine?.fine_image_url} onChange={setImage} progress={progress.image} disabled={saving} />
        <FileDrop label={t('form.finePdf')} kind="pdf" file={pdf} existingUrl={fine?.fine_pdf_url} onChange={setPdf} progress={progress.pdf} disabled={saving} />
        {status === 'paid' && (
          <FileDrop label={t('view.paymentReceipt')} kind="any" file={receipt} existingUrl={fine?.payment_receipt_url} onChange={setReceipt} progress={progress.receipt} disabled={saving} />
        )}
      </FormCard>
    </BookingSheet>
  );
};

export default FineForm;
