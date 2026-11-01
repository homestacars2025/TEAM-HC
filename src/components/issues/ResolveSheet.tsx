import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '../../hooks/useDateLocale';
import { photoUrls, type IssueRow } from '../../lib/carIssues';
import { istanbulDate } from '../../lib/istanbulTime';
import { resolveIssue, uploadIssuePhotos } from '../../lib/queries/carIssues';
import Button from '../Button';
import BookingSheet from '../booking/BookingSheet';
import DateParts from '../booking/DateParts';
import { Field, FormCard, FormError } from '../booking/FormParts';
import { FINE_ICONS } from '../fines/parts';
import PhotoGrid from '../forms/PhotoGrid';

const ResolveSheet: React.FC<{ issue: IssueRow; onClose: () => void; onResolved: () => void }> = ({ issue, onClose, onResolved }) => {
  const { t } = useTranslation('carIssues');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const closeRef = useRef<(() => void) | null>(null);
  const submitting = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const [resolvedAt, setResolvedAt] = useState(istanbulDate());
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    if (!resolvedAt) { setFailure(t('errors.resolved')); return; }
    submitting.current = true;
    setSaving(true);
    setFailure(null);
    try {
      let photos: string[] | undefined;
      if (files.length > 0) {
        setProgress(0);
        const { urls } = await uploadIssuePhotos(files, `${issue.car_id}/repair/${issue.id}`, setProgress);
        if (urls.length === 0) { setFailure(t('errors.photoUpload')); return; }
        // Added to what is there, so nothing already uploaded is dropped.
        photos = [...photoUrls(issue.repair_photos), ...urls];
      }
      await resolveIssue(issue.id, resolvedAt, photos);
      onResolved();
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
      title={t('detail.markResolved')}
      subtitle={issue.plate_number}
      alerts={failure ? <FormError>{failure}</FormError> : undefined}
      dirty={files.length > 0}
      busy={saving}
      onClose={onClose}
      onSubmit={onSubmit}
      closeRef={closeRef}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={() => closeRef.current?.()}>{tc('actions.cancel')}</Button>
          <Button type="submit" className="hc-bs-primary" disabled={saving}>{saving ? t('detail.updating') : t('detail.markResolved')}</Button>
        </>
      )}
    >
      <FormCard icon={FINE_ICONS.image} title={t('detail.addRepairPhotos')}>
        <div className="hc-field-wide"><PhotoGrid files={files} onChange={setFiles} disabled={saving} progress={progress} /></div>
      </FormCard>
      <FormCard icon={FINE_ICONS.timeline} title={t('detail.resolved')}>
        <Field label={t('detail.resolved')} required>
          <DateParts label={t('detail.resolved')} locale={locale} value={resolvedAt} onChange={setResolvedAt} />
        </Field>
      </FormCard>
    </BookingSheet>
  );
};

export default ResolveSheet;
