import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { asIssueStatus, photoUrls, type IssueRow } from '../../lib/carIssues';
import { deleteIssue, setIssueStatus, setRepairPhotos, uploadIssuePhotos } from '../../lib/queries/carIssues';
import Button from '../Button';
import BookingSheet from '../booking/BookingSheet';
import { FormCard, FormError } from '../booking/FormParts';
import PlateChip from '../booking/PlateChip';
import ConfirmDialog from '../custody/ConfirmDialog';
import { FINE_ICONS } from '../fines/parts';
import Lightbox from '../forms/Lightbox';
import PhotoGrid from '../forms/PhotoGrid';
import { StatusPill, TypeChip } from './parts';

interface IssueDetailProps {
  issue: IssueRow;
  onClose: () => void;
  onChanged: (message: string) => void;
  onEdit: () => void;
  onResolve: () => void;
}

const IssueDetail: React.FC<IssueDetailProps> = ({ issue, onClose, onChanged, onEdit, onResolve }) => {
  const { t } = useTranslation('carIssues');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const closeRef = useRef<(() => void) | null>(null);
  const damage = useMemo(() => photoUrls(issue.damage_photos), [issue.damage_photos]);
  const repair = useMemo(() => photoUrls(issue.repair_photos), [issue.repair_photos]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const status = asIssueStatus(issue.status);
  const gallery = [
    ...damage.map((url, index) => ({ url, label: `${t('detail.before')} ${index + 1}` })),
    ...repair.map((url, index) => ({ url, label: `${t('detail.after')} ${index + 1}` })),
  ];

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setFailure(null);
    try {
      await action();
    } catch {
      setFailure(t('errors.saveFailed'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const reopen = () => run(async () => {
    await setIssueStatus(issue.id, 'open');
    onChanged(t('toast.reopened'));
  });

  const addPhotos = () => run(async () => {
    setProgress(0);
    const { urls, failed } = await uploadIssuePhotos(files, `${issue.car_id}/repair/${issue.id}`, setProgress);
    if (urls.length === 0) { setFailure(t('errors.photoUpload')); return; }
    // Appended, so concurrent additions don't drop earlier photos.
    await setRepairPhotos(issue.id, [...repair, ...urls]);
    setFiles([]);
    onChanged(failed > 0 ? t('detail.photosPartial', { added: urls.length, failed }) : t('toast.photosAdded'));
  });

  const remove = () => run(async () => {
    await deleteIssue(issue.id);
    onChanged(t('toast.deleted'));
  });

  const column = (label: string, urls: string[], empty: string, offset: number) => (
    <section className="min-w-0">
      <h4 className="hc-field-label">{label} <small className="font-normal text-gray-500">({urls.length})</small></h4>
      {urls.length > 0 ? (
        <div className="hc-gallery">
          {urls.map((url, index) => (
            <button key={url} type="button" onClick={() => setViewing(offset + index)} aria-label={`${label} ${index + 1}`}>
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : <p className="hc-gallery-empty">{empty}</p>}
    </section>
  );

  const rows: [string, React.ReactNode][] = [
    [tc('fields.car'), <span className="inline-flex flex-wrap items-center justify-end gap-2"><PlateChip plate={issue.plate_number} />{issue.model_name}</span>],
    [t('detail.loggedBy'), issue.discovered_by_name ?? '—'],
    [tc('fields.customer'), issue.customer_name ?? '—'],
    [tc('fields.booking'), <span className="hc-num">{issue.booking_number ?? '—'}</span>],
  ];

  return (
    <>
      <BookingSheet
        narrow
        title={t('detail.title')}
        subtitle={issue.plate_number}
        chip={<StatusPill status={issue.status} />}
        alerts={failure ? <FormError>{failure}</FormError> : undefined}
        dirty={files.length > 0}
        busy={busy}
        onClose={onClose}
        onSubmit={e => e.preventDefault()}
        closeRef={closeRef}
        footer={(
          <div className="hc-detail-actions">
            <Button variant="destructive" disabled={busy} onClick={() => setConfirming(true)}>{tc('actions.delete')}</Button>
            <Button variant="secondary" disabled={busy} onClick={onEdit}>{tc('actions.edit')}</Button>
            {status === 'open'
              ? <Button disabled={busy} onClick={onResolve}>{t('detail.markResolved')}</Button>
              : <Button variant="secondary" disabled={busy} onClick={() => void reopen()}>{busy ? t('detail.updating') : t('detail.reopen')}</Button>}
          </div>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <TypeChip type={issue.type} />
          {status === 'resolved' && issue.days_to_resolve !== null && <span className="hc-age is-calm">{t('card.resolvedIn', { days: issue.days_to_resolve })}</span>}
        </div>

        <FormCard icon={FINE_ICONS.image} title={t('detail.beforeAfter')}>
          <div className="hc-before-after hc-field-wide">
            {column(t('detail.before'), damage, t('detail.noDamagePhotos'), 0)}
            {column(t('detail.after'), repair, t('detail.noRepairPhotos'), damage.length)}
          </div>
          <div className="hc-field-wide">
            <div className="hc-field-label">{t('detail.addRepairPhotos')}</div>
            <PhotoGrid files={files} onChange={setFiles} disabled={busy} progress={progress} />
            {files.length > 0 && (
              <Button className="mt-2" disabled={busy} onClick={() => void addPhotos()}>{busy ? t('detail.uploading') : t('detail.uploadPhotos', { count: files.length })}</Button>
            )}
          </div>
        </FormCard>

        <FormCard icon={FINE_ICONS.document} title={tc('fields.description')}>
          <p dir="auto" className="hc-field-wide whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{issue.description?.trim() || t('detail.noDescription')}</p>
          <dl className="hc-review hc-field-wide">
            {rows.map(([label, value], index) => <div key={index}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}
          </dl>
        </FormCard>

        <FormCard icon={FINE_ICONS.timeline} title={t('detail.timeline')}>
          <ol className="hc-steps-line hc-field-wide">
            <li className="is-done"><strong>{t('detail.discovered')}</strong><span>{formatDay(issue.discovered_at, locale)}</span></li>
            <li className={status === 'resolved' ? 'is-done' : undefined}><strong>{t('detail.resolved')}</strong><span>{status === 'resolved' ? formatDay(issue.resolved_at, locale) : '—'}</span></li>
          </ol>
        </FormCard>
      </BookingSheet>
      {viewing !== null && <Lightbox items={gallery} start={viewing} onClose={() => setViewing(null)} />}
      {confirming && (
        <ConfirmDialog
          title={t('detail.confirmDelete')}
          body={issue.plate_number}
          confirmLabel={busy ? t('detail.deleting') : t('detail.yesDelete')}
          cancelLabel={tc('actions.cancel')}
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
};

export default IssueDetail;
