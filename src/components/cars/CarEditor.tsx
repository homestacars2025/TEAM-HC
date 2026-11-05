import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import { istanbulDate } from '../../lib/istanbulTime';
import {
  DOC_ACCEPT, DOCS, expiryTone, isImageUrl, isPdfUrl, movePhoto, PHOTO_ACCEPT, toFront, withPrimary,
  type CarPhoto, type DocKey, type DocSpec,
} from '../../lib/carEditor';
import {
  deleteCarPhoto, getCarEditor, removeCarDoc, saveCarFields, syncCarPhotos, uploadCarDoc, uploadCarPhoto,
  type CarEditorData, type CarFieldsChange,
} from '../../lib/queries/carEditor';
import Button from '../Button';
import DateParts from '../booking/DateParts';
import PlateChip from '../booking/PlateChip';

interface CarEditorProps {
  carId: number;
  isAdmin: boolean;
  locale: string;
  /** `changed` is true once a file was added or removed, which the list shows too. */
  onClose: (changed: boolean) => void;
  onSaved: () => void;
}

type SectionKey = 'info' | 'registration' | 'expiry' | 'documents' | 'photos';
type Confirm = { kind: 'doc'; key: DocKey } | { kind: 'photo'; url: string } | { kind: 'discard' };

const MAX_YEAR = new Date().getFullYear() + 1;

// ─── Small parts ────────────────────────────────────────────────────────────────

const ICON_DIR = `${process.env.PUBLIC_URL ?? ''}/icons/3d/cars`;

/** The same 3D renders as Admin. Always beside the section title, so decorative. */
const SectionIcon: React.FC<{ name: SectionKey }> = ({ name }) => (
  <img className="hc-ce-icon" src={`${ICON_DIR}/${name}.png`} alt="" width={40} height={40} decoding="async" />
);

const LockIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.2" stroke="currentColor" strokeWidth="2" /><path d="M8 10.5V7.5a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);

const Section: React.FC<{ name: SectionKey; title: string; aside?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }> = ({ name, title, aside, action, children }) => (
  <section className="hc-ce-section surface-depth" aria-labelledby={`hc-ce-${name}`}>
    <header className="hc-ce-section-head">
      <SectionIcon name={name} />
      <div className="hc-ce-section-title">
        <h3 id={`hc-ce-${name}`}>{title}</h3>
        {aside && <span className="hc-ce-section-aside">{aside}</span>}
      </div>
      {action}
    </header>
    {children}
  </section>
);

/** A field this person can see but not change: the value, greyed, with a lock. */
const LockedField: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => {
  const { t } = useTranslation('cars');
  return (
    <div className="hc-ce-field">
      <div className="hc-field-label">{label}<span className="hc-ce-lock" title={t('editor.lockedHint')}><LockIcon />{t('editor.locked')}</span></div>
      <div className="hc-ce-locked" aria-readonly="true">{value}</div>
    </div>
  );
};

/**
 * The iOS switch: green when on, grey when off. The whole row is the control, so the
 * label and caption are what a screen reader hears, and the thumb runs the reading way.
 */
const SpareKeyRow: React.FC<{ on: boolean; onChange: (on: boolean) => void }> = ({ on, onChange }) => {
  const { t } = useTranslation('cars');
  const labelId = useId();
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={labelId} aria-describedby={`${labelId}-caption`} className="hc-ce-key-row" onClick={() => onChange(!on)}>
      <img className="hc-ce-key-icon" src={`${ICON_DIR}/key.png`} alt="" width={40} height={40} decoding="async" />
      <span className="hc-ce-key-text">
        <span id={labelId} className="hc-ce-key-label">{t('editor.fields.spareKey')}</span>
        <span id={`${labelId}-caption`} className="hc-ce-key-caption">{t('editor.fields.spareKeyCaption')}</span>
      </span>
      <span className={`hc-ios-switch ${on ? 'is-on' : ''}`} aria-hidden="true"><span className="hc-ios-switch-thumb" /></span>
    </button>
  );
};

const ExpiryChip: React.FC<{ date: string | null }> = ({ date }) => {
  const { t } = useTranslation('cars');
  const { tone, days } = expiryTone(date, istanbulDate());
  const text = tone === 'unset' ? t('editor.expiry.unset')
    : tone === 'expired' ? t('editor.expiry.expiredAgo', { count: -(days ?? 0) })
    : days === 0 ? t('editor.expiry.today')
    : t('editor.expiry.left', { count: days ?? 0 });
  return <span className={`hc-ce-chip is-${tone}`}><span aria-hidden="true" className="hc-ce-chip-dot" />{text}</span>;
};

/** A file's kind from its name, or else from what the server says it is. */
const kindCache = new Map<string, Promise<'image' | 'pdf' | 'file'>>();
function useDocKind(url: string | null): 'image' | 'pdf' | 'file' | null {
  const [kind, setKind] = useState<'image' | 'pdf' | 'file' | null>(null);
  useEffect(() => {
    if (!url) { setKind(null); return; }
    if (isImageUrl(url)) { setKind('image'); return; }
    if (isPdfUrl(url)) { setKind('pdf'); return; }
    let active = true;
    if (!kindCache.has(url)) {
      kindCache.set(url, fetch(url, { method: 'HEAD' })
        .then(response => {
          const type = response.headers.get('content-type') ?? '';
          return type.startsWith('image/') ? 'image' as const : type.includes('pdf') ? 'pdf' as const : 'file' as const;
        })
        .catch(() => 'file' as const));
    }
    kindCache.get(url)!.then(found => { if (active) setKind(found); });
    return () => { active = false; };
  }, [url]);
  return kind;
}

const FileGlyph: React.FC<{ kind: 'pdf' | 'file' }> = ({ kind }) => {
  const { t } = useTranslation('cars');
  return (
    <span className={`hc-ce-file is-${kind}`} aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" fill="currentColor" opacity="0.14" /><path d="M7 3h7l5 5v12a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
      <span>{kind === 'pdf' ? t('editor.docs.pdf') : t('editor.docs.file')}</span>
    </span>
  );
};

// ─── Documents ──────────────────────────────────────────────────────────────────

interface DocCardProps {
  spec: DocSpec;
  url: string | null;
  editable: boolean;
  progress: number | null;
  error: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}

const coarsePointer = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

const DocCard: React.FC<DocCardProps> = ({ spec, url, editable, progress, error, onFile, onRemove }) => {
  const { t } = useTranslation('cars');
  const [touch] = useState(coarsePointer);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const kind = useDocKind(url);
  const [thumbFailed, setThumbFailed] = useState(false);
  const name = t(`editor.docs.${spec.key}`);
  const busy = progress !== null;
  useEffect(() => setThumbFailed(false), [url]);

  const pick = () => { if (editable && !busy) input.current?.click(); };
  const drop = editable && !busy ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); const file = e.dataTransfer.files?.[0]; if (file) onFile(file); },
  } : {};

  return (
    <div className={`hc-ce-doc ${url ? 'is-uploaded' : 'is-missing'} ${over ? 'is-over' : ''}`} {...drop}>
      <div className="hc-ce-doc-head">
        <span className="hc-ce-doc-name">{name}</span>
        {!editable && <span className="hc-ce-lock" title={t('editor.lockedHint')}><LockIcon /><span className="sr-only">{t('editor.locked')}</span></span>}
        <span className={`hc-ce-status ${url ? 'is-ok' : 'is-missing'}`}>
          {url && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          {url ? t('editor.docs.uploaded') : t('editor.docs.missing')}
        </span>
      </div>

      {url ? (
        <a className="hc-ce-doc-preview" href={url} target="_blank" rel="noreferrer" aria-label={`${t('editor.docs.view')} · ${name}`}>
          {kind === 'image' && !thumbFailed
            ? <img src={url} alt="" loading="lazy" decoding="async" onError={() => setThumbFailed(true)} />
            : kind === null ? <span className="hc-ce-doc-wait" /> : <FileGlyph kind={kind === 'image' ? 'file' : kind} />}
        </a>
      ) : (
        <button type="button" className="hc-ce-doc-drop" onClick={pick} disabled={!editable || busy}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>{editable ? (over ? t('editor.docs.dropHere') : touch ? t('editor.docs.tapUpload') : t('editor.docs.dropUpload')) : t('editor.locked')}</span>
          {editable && <small>{t('editor.docs.types')}</small>}
        </button>
      )}

      {busy && (
        <div className="hc-ce-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={t('editor.docs.uploading', { percent: progress })}>
          <span style={{ width: `${progress}%` }} />
          <small>{t('editor.docs.uploading', { percent: progress })}</small>
        </div>
      )}
      {error && <p role="alert" className="hc-ce-doc-error">{error}</p>}

      {url && (
        <div className="hc-ce-doc-actions">
          <a href={url} target="_blank" rel="noreferrer" className="hc-ce-link">{t('editor.docs.view')}</a>
          {editable && <button type="button" className="hc-ce-link" onClick={pick} disabled={busy}>{t('editor.docs.replace')}</button>}
          {editable && <button type="button" className="hc-ce-link is-danger" onClick={onRemove} disabled={busy}>{t('editor.docs.remove')}</button>}
        </div>
      )}
      {editable && (
        <input ref={input} type="file" accept={DOC_ACCEPT} hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) onFile(file); }} />
      )}
    </div>
  );
};

// ─── Photos ─────────────────────────────────────────────────────────────────────

interface Upload { key: string; name: string; preview: string; progress: number; failed?: boolean }

interface PhotoGridProps {
  photos: CarPhoto[];
  uploads: Upload[];
  onAdd: (files: File[]) => void;
  onPrimary: (url: string) => void;
  onDelete: (url: string) => void;
  onReorder: (from: number, to: number) => void;
  onDismiss: (key: string) => void;
  /** Opens the picker from the section header. */
  pickerRef: React.RefObject<HTMLInputElement | null>;
}

const PhotoGrid: React.FC<PhotoGridProps> = ({ photos, uploads, onAdd, onPrimary, onDelete, onReorder, onDismiss, pickerRef }) => {
  const { t, i18n } = useTranslation('cars');
  const input = pickerRef;
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [over, setOver] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const rtl = i18n.dir() === 'rtl';
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);

  const indexAt = (x: number, y: number) => {
    const tile = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-photo-index]');
    return tile && grid.current?.contains(tile) ? Number(tile.dataset.photoIndex) : null;
  };

  // The tiles stay where they are until the drop: moving a node under the finger would
  // drop the pointer. The window follows it instead, so it can't get lost on the way.
  const handle = (index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || photos.length < 2) return;
      e.preventDefault();
      let current = { from: index, over: index };
      setDrag(current);
      const move = (event: PointerEvent) => {
        if (event.pointerId !== e.pointerId) return;
        const at = indexAt(event.clientX, event.clientY);
        if (at !== null && at !== current.over) { current = { ...current, over: at }; setDrag(current); }
      };
      const finish = (commit: boolean) => (event: PointerEvent) => {
        if (event.pointerId !== e.pointerId) return;
        stopDrag.current?.();
        if (commit && current.over !== current.from) onReorder(current.from, current.over);
      };
      const up = finish(true), cancel = finish(false);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      stopDrag.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        stopDrag.current = null;
        setDrag(null);
      };
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const to = index + step;
      if (to < 0 || to >= photos.length) return;
      onReorder(index, to);
      setAnnounce(t('editor.photos.moved', { position: to + 1 }));
      window.requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-photo-index="${to}"] .hc-ce-grip`)?.focus());
    },
  });

  return (
    <div
      className={`hc-ce-photos ${over ? 'is-over' : ''}`}
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
      onDrop={e => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        setOver(false);
        onAdd(Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/')));
      }}
    >
      <div ref={grid} className="hc-ce-photo-grid">
        {photos.map((photo, index) => {
          const dragging = drag?.from === index;
          const target = drag && drag.over === index && drag.from !== index ? (drag.over > drag.from ? 'is-target-after' : 'is-target-before') : '';
          return (
            <figure key={photo.url} data-photo-index={index} className={`hc-ce-photo ${photo.primary ? 'is-primary' : ''} ${dragging ? 'is-dragging' : ''} ${target} ${photo.dead ? 'is-dead' : ''}`}>
              {photo.dead || broken.has(photo.url)
                ? <span className="hc-ce-photo-dead">{t('editor.photos.unavailable')}</span>
                : <img src={photo.url} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(current => new Set(current).add(photo.url))} />}
              {photo.primary && <span className="hc-ce-photo-badge">{t('editor.photos.primary')}</span>}
              <button type="button" className="hc-ce-grip" aria-label={t('editor.photos.reorder')} title={t('editor.photos.reorder')} {...handle(index)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
              </button>
              <div className="hc-ce-photo-tools">
                <span className="hc-ce-photo-spacer" />
                {!photo.dead && !photo.primary && (
                  <button type="button" className="hc-ce-star" aria-label={t('editor.photos.setPrimary')} title={t('editor.photos.setPrimary')} onClick={() => onPrimary(photo.url)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
                  </button>
                )}
                <button type="button" className="hc-ce-trash" aria-label={t('editor.photos.delete')} title={t('editor.photos.delete')} onClick={() => onDelete(photo.url)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M10 11v6m4-6v6M9 7l.7-2.3A1 1 0 0110.6 4h2.8a1 1 0 01.9.7L15 7m2.5 0l-.7 11.2a2 2 0 01-2 1.8H9.2a2 2 0 01-2-1.8L6.5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
            </figure>
          );
        })}
        {uploads.map(upload => (
          <figure key={upload.key} className={`hc-ce-photo is-uploading ${upload.failed ? 'is-failed' : ''}`}>
            <img src={upload.preview} alt="" />
            {upload.failed ? (
              <>
                <span role="alert" className="hc-ce-photo-failed">{t('editor.photos.failed')}</span>
                <button type="button" className="hc-ce-photo-dismiss" aria-label={t('editor.photos.dismiss')} onClick={() => onDismiss(upload.key)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
                </button>
              </>
            ) : (
              <div className="hc-ce-progress is-overlay" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={upload.progress} aria-label={upload.name}>
                <span style={{ width: `${upload.progress}%` }} />
                <small>{t('editor.photos.uploading', { percent: upload.progress })}</small>
              </div>
            )}
          </figure>
        ))}
        {!photos.length && !uploads.length && (
          <button type="button" className="hc-ce-photo-add" onClick={() => input.current?.click()}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span>{t('editor.photos.drop')}</span>
          </button>
        )}
      </div>
      {photos.length > 1 && <p className="hc-ce-hint">{t('editor.photos.hint')}</p>}
      <span className="sr-only" aria-live="polite">{announce}</span>
      <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple hidden onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; if (files.length) onAdd(files); }} />
    </div>
  );
};

// ─── The sheet ──────────────────────────────────────────────────────────────────

interface Fields {
  plate: string;
  modelGroupId: string;
  year: string;
  carPackage: string;
  insurance: string;
  inspection: string;
  spareKey: boolean;
}

const fieldsOf = (data: CarEditorData): Fields => ({
  plate: data.plate,
  modelGroupId: data.modelGroupId != null ? String(data.modelGroupId) : '',
  year: data.registration.manufacture_year != null ? String(data.registration.manufacture_year) : '',
  carPackage: data.registration.car_package ?? '',
  insurance: data.registration.insurance_expiry ?? '',
  inspection: data.registration.inspection_expiry ?? '',
  spareKey: data.registration.has_spare_key,
});

/** What Save would write. A date counts only once it's whole, so half a date never wipes one. */
export function changeOf(data: CarEditorData, fields: Fields, isAdmin: boolean): CarFieldsChange {
  const start = fieldsOf(data);
  const car: NonNullable<CarFieldsChange['car']> = {};
  const registration: NonNullable<CarFieldsChange['registration']> = {};
  if (isAdmin) {
    const plate = fields.plate.trim().toUpperCase();
    if (plate !== start.plate) car.plate_number = plate;
    if (fields.modelGroupId !== start.modelGroupId) car.model_group_id = fields.modelGroupId ? Number(fields.modelGroupId) : null;
  }
  if (fields.year.trim() !== start.year) registration.manufacture_year = fields.year.trim() ? Number(fields.year.trim()) : null;
  if (fields.carPackage.trim() !== start.carPackage) registration.car_package = fields.carPackage.trim() || null;
  if (fields.insurance && fields.insurance !== start.insurance) registration.insurance_expiry = fields.insurance;
  if (fields.inspection && fields.inspection !== start.inspection) registration.inspection_expiry = fields.inspection;
  if (fields.spareKey !== start.spareKey) registration.has_spare_key = fields.spareKey;
  return { car, registration };
}

const CarEditor: React.FC<CarEditorProps> = ({ carId, isAdmin, locale, onClose, onSaved }) => {
  const { t } = useTranslation('cars');
  const { t: tc } = useTranslation('common');
  const titleId = useId();
  useBlockedPage();

  const [data, setData] = useState<CarEditorData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fields, setFields] = useState<Fields | null>(null);
  const [docs, setDocs] = useState<Record<DocKey, string | null>>({ ruhsat: null, kasko: null, insurance: null });
  const [docProgress, setDocProgress] = useState<Partial<Record<DocKey, number>>>({});
  const [docErrors, setDocErrors] = useState<Partial<Record<DocKey, string>>>({});
  const [photos, setPhotos] = useState<CarPhoto[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [plateError, setPlateError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const photoPicker = useRef<HTMLInputElement>(null);
  const filesChanged = useRef(false);
  const photosRef = useRef<CarPhoto[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoadFailed(false);
    getCarEditor(carId)
      .then(found => {
        if (!active) return;
        setData(found);
        setFields(fieldsOf(found));
        setDocs(Object.fromEntries(DOCS.map(spec => [spec.key, found.registration[spec.column]])) as Record<DocKey, string | null>);
        photosRef.current = found.photos;
        setPhotos(found.photos);
      })
      .catch(() => { if (active) setLoadFailed(true); });
    return () => { active = false; };
  }, [carId, attempt]);

  useEffect(() => { sheet.current?.focus(); }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const change = useMemo(() => (data && fields ? changeOf(data, fields, isAdmin) : null), [data, fields, isAdmin]);
  const unsaved = change ? Object.keys(change.car ?? {}).length + Object.keys(change.registration ?? {}).length : 0;
  const dirty = unsaved > 0;
  // A file on its way up would be lost with the sheet, so the sheet waits for it.
  const uploading = uploads.some(upload => !upload.failed) || Object.values(docProgress).some(value => value !== undefined);
  const yearInvalid = !!fields?.year.trim() && !(/^\d{4}$/.test(fields.year.trim()) && Number(fields.year) >= 1980 && Number(fields.year) <= MAX_YEAR);

  const set = <K extends keyof Fields>(key: K) => (value: Fields[K]) => {
    setFields(current => (current ? { ...current, [key]: value } : current));
    setSaveError(null);
    if (key === 'plate') setPlateError(false);
  };

  const requestClose = useCallback(() => {
    if (saving || uploading) return;
    if (dirty) setConfirm({ kind: 'discard' });
    else onClose(filesChanged.current);
  }, [dirty, saving, uploading, onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (confirm) setConfirm(null);
    else requestClose();
  };

  const save = async () => {
    if (!data || !fields || !change || saving) return;
    if (isAdmin && !fields.plate.trim()) { setPlateError(true); return; }
    if (yearInvalid) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveCarFields(carId, change);
      onSaved();
    } catch {
      setSaveError(t('editor.errors.save'));
      setSaving(false);
    }
  };

  // ── Documents ──
  const plateForFiles = data?.plate ?? '';
  const uploadDoc = async (spec: DocSpec, file: File) => {
    setDocErrors(current => ({ ...current, [spec.key]: undefined }));
    setDocProgress(current => ({ ...current, [spec.key]: 0 }));
    try {
      const url = await uploadCarDoc(carId, spec, plateForFiles, file, percent => setDocProgress(current => ({ ...current, [spec.key]: percent })));
      setDocs(current => ({ ...current, [spec.key]: url }));
      filesChanged.current = true;
      setToast(t('editor.docs.uploadedToast', { name: t(`editor.docs.${spec.key}`) }));
    } catch {
      setDocErrors(current => ({ ...current, [spec.key]: t('editor.errors.upload') }));
    } finally {
      setDocProgress(current => ({ ...current, [spec.key]: undefined }));
    }
  };

  const removeDoc = async (key: DocKey) => {
    const spec = DOCS.find(item => item.key === key)!;
    const url = docs[key];
    setConfirm(null);
    if (!url) return;
    setDocErrors(current => ({ ...current, [key]: undefined }));
    setDocs(current => ({ ...current, [key]: null }));
    try {
      await removeCarDoc(carId, spec, url);
      filesChanged.current = true;
      setToast(t('editor.docs.removedToast', { name: t(`editor.docs.${key}`) }));
    } catch {
      setDocs(current => ({ ...current, [key]: url }));
      setDocErrors(current => ({ ...current, [key]: t('editor.errors.remove') }));
    }
  };

  // ── Photos: one change at a time, in the order they were made ──
  const showPhotos = (next: CarPhoto[]) => { photosRef.current = next; setPhotos(next); };

  const reloadPhotos = async () => {
    try { showPhotos((await getCarEditor(carId)).photos); } catch { /* keeps what's shown */ }
  };

  const enqueue = (work: () => Promise<void>) => {
    queue.current = queue.current.then(work).catch(async () => {
      setPhotoError(t('editor.errors.photo'));
      await reloadPhotos();
    });
  };

  const addPhotos = (files: File[]) => {
    if (!files.length) return;
    setPhotoError(null);
    const pending = files.map((file, index) => ({ file, upload: { key: `${Date.now()}-${index}-${file.name}`, name: file.name, preview: URL.createObjectURL(file), progress: 0 } }));
    setUploads(current => [...current, ...pending.map(item => item.upload)]);
    pending.forEach(({ file, upload }) => enqueue(async () => {
      let added: CarPhoto;
      try {
        added = await uploadCarPhoto(carId, file, photosRef.current.length, percent => setUploads(current => current.map(item => (item.key === upload.key ? { ...item, progress: percent } : item))));
      } catch {
        // Stays on the grid with its error until dismissed, so it's clear which one failed.
        setUploads(current => current.map(item => (item.key === upload.key ? { ...item, failed: true } : item)));
        return;
      }
      setUploads(current => current.filter(item => item.key !== upload.key));
      URL.revokeObjectURL(upload.preview);
      // Usable photos come before dead ones.
      const firstDead = photosRef.current.findIndex(photo => photo.dead);
      const list = [...photosRef.current];
      list.splice(firstDead === -1 ? list.length : firstDead, 0, added);
      const next = withPrimary(list);
      showPhotos(next);
      filesChanged.current = true;
      showPhotos(await syncCarPhotos(carId, next));
    }));
  };

  const setPrimary = (url: string) => {
    setPhotoError(null);
    showPhotos(toFront(photosRef.current, url));
    filesChanged.current = true;
    enqueue(async () => { showPhotos(await syncCarPhotos(carId, photosRef.current)); });
  };

  const reorder = (from: number, to: number) => {
    setPhotoError(null);
    showPhotos(withPrimary(movePhoto(photosRef.current, from, to)));
    filesChanged.current = true;
    enqueue(async () => { showPhotos(await syncCarPhotos(carId, photosRef.current)); });
  };

  const deletePhoto = (url: string) => {
    setConfirm(null);
    setPhotoError(null);
    const photo = photosRef.current.find(item => item.url === url);
    if (!photo) return;
    showPhotos(withPrimary(photosRef.current.filter(item => item.url !== url)));
    filesChanged.current = true;
    enqueue(async () => { showPhotos(await deleteCarPhoto(carId, photo, photosRef.current)); });
  };

  const dismissUpload = (key: string) => setUploads(current => {
    const gone = current.find(item => item.key === key);
    if (gone) URL.revokeObjectURL(gone.preview);
    return current.filter(item => item.key !== key);
  });

  // ── Drawing ──
  const modelName = data?.modelGroups.find(group => String(group.id) === fields?.modelGroupId)?.name;
  const confirmText = confirm?.kind === 'doc'
    ? { title: t('editor.docs.removeTitle', { name: t(`editor.docs.${confirm.key}`) }), body: t('editor.docs.removeBody'), keep: tc('actions.cancel'), go: t('editor.docs.remove') }
    : confirm?.kind === 'photo'
      ? { title: t('editor.photos.deleteTitle'), body: t('editor.photos.deleteBody'), keep: tc('actions.cancel'), go: tc('actions.delete') }
      : { title: t('editor.discard.title'), body: t('editor.discard.body'), keep: t('editor.discard.keep'), go: t('editor.discard.discard') };

  const runConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'doc') removeDoc(confirm.key);
    else if (confirm.kind === 'photo') deletePhoto(confirm.url);
    else onClose(filesChanged.current);
  };

  const dateField = (key: 'insurance' | 'inspection') => {
    const stored = data?.registration[key === 'insurance' ? 'insurance_expiry' : 'inspection_expiry'] ?? null;
    const shown = fields?.[key] || stored;
    return (
      <div className={`hc-ce-expiry is-${expiryTone(shown, istanbulDate()).tone}`} role="group" aria-label={t(`editor.fields.${key}`)}>
        <div className="hc-ce-expiry-head">
          <span className="hc-field-label !mb-0">{t(`editor.fields.${key}`)}</span>
          <ExpiryChip date={shown} />
        </div>
        <DateParts label={t(`editor.fields.${key}`)} locale={locale} value={fields?.[key] ?? ''} onChange={set(key)} />
      </div>
    );
  };

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <div ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label={data ? t('editor.editCar', { plate: data.plate }) : t('editor.title')} className="hc-ce surface-float" onKeyDown={onKeyDown}>
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <div className="hc-ce-head-title">
              <h2 id={titleId} dir="auto">{data ? modelName ?? t('editor.title') : t('editor.title')}</h2>
              {data && <PlateChip plate={data.plate} />}
            </div>
          </div>
          <button type="button" className="hc-ce-close" aria-label={tc('actions.close')} onClick={requestClose} disabled={uploading || saving}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          </button>
        </header>

        <div className="hc-ce-body">
          {loadFailed ? (
            <div className="hc-ce-state" role="alert">
              <p>{t('editor.loadFailed')}</p>
              <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
            </div>
          ) : !data || !fields ? (
            <div className="hc-ce-state" role="status"><span className="hc-ce-spinner" aria-hidden="true" />{t('editor.loading')}</div>
          ) : (
            <>
              <Section name="info" title={t('editor.sections.info')}>
                <div className="hc-ce-grid">
                  {isAdmin ? (
                    <label className="hc-ce-field">
                      <span className="hc-field-label">{t('editor.fields.plate')}</span>
                      <input dir="ltr" className={`hc-input ${plateError ? 'is-invalid' : ''}`} value={fields.plate} autoComplete="off" autoCapitalize="characters" onChange={e => set('plate')(e.target.value)} aria-invalid={plateError} />
                      {plateError && <span className="hc-field-error" role="alert">{t('editor.errors.plate')}</span>}
                    </label>
                  ) : <LockedField label={t('editor.fields.plate')} value={<PlateChip plate={data.plate} />} />}
                  {isAdmin ? (
                    <label className="hc-ce-field">
                      <span className="hc-field-label">{t('editor.fields.model')}</span>
                      <select className="hc-input" value={fields.modelGroupId} onChange={e => set('modelGroupId')(e.target.value)}>
                        <option value="">{t('editor.fields.selectModel')}</option>
                        {data.modelGroups.map(group => <option key={group.id} value={String(group.id)}>{group.name}</option>)}
                      </select>
                    </label>
                  ) : <LockedField label={t('editor.fields.model')} value={<span dir="auto">{modelName ?? '—'}</span>} />}
                </div>
              </Section>

              <Section name="registration" title={t('editor.sections.registration')}>
                <div className="hc-ce-grid">
                  <label className="hc-ce-field">
                    <span className="hc-field-label">{t('editor.fields.year')}</span>
                    <input dir="ltr" inputMode="numeric" maxLength={4} className={`hc-input ${yearInvalid ? 'is-invalid' : ''}`} placeholder={t('editor.fields.yearPlaceholder')} value={fields.year} onChange={e => set('year')(e.target.value.replace(/\D/g, ''))} aria-invalid={yearInvalid} />
                    {yearInvalid && <span className="hc-field-error" role="alert">{t('editor.errors.year', { max: MAX_YEAR })}</span>}
                  </label>
                  <label className="hc-ce-field">
                    <span className="hc-field-label">{t('editor.fields.package')}</span>
                    <input dir="auto" className="hc-input" placeholder={t('editor.fields.packagePlaceholder')} value={fields.carPackage} onChange={e => set('carPackage')(e.target.value)} />
                  </label>
                  <div className="hc-field-wide">
                    <SpareKeyRow on={fields.spareKey} onChange={set('spareKey')} />
                  </div>
                </div>
              </Section>

              <Section name="expiry" title={t('editor.sections.expiry')}>
                <div className="hc-ce-expiries">
                  {dateField('insurance')}
                  {dateField('inspection')}
                </div>
              </Section>

              <Section name="documents" title={t('editor.sections.documents')}>
                <div className="hc-ce-docs">
                  {DOCS.map(spec => (
                    <DocCard
                      key={spec.key}
                      spec={spec}
                      url={docs[spec.key]}
                      editable
                      progress={docProgress[spec.key] ?? null}
                      error={docErrors[spec.key] ?? null}
                      onFile={file => uploadDoc(spec, file)}
                      onRemove={() => setConfirm({ kind: 'doc', key: spec.key })}
                    />
                  ))}
                </div>
              </Section>

              <Section
                name="photos"
                title={t('editor.sections.photos')}
                aside={t('editor.photos.count', { count: photos.filter(photo => !photo.dead).length })}
                action={(
                  <button type="button" className="hc-ce-add-photos" onClick={() => photoPicker.current?.click()}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
                    {t('editor.photos.add')}
                  </button>
                )}
              >
                {photoError && <p role="alert" className="hc-ce-doc-error mb-2">{photoError}</p>}
                <PhotoGrid
                  photos={photos}
                  uploads={uploads}
                  onAdd={addPhotos}
                  onPrimary={setPrimary}
                  onDelete={url => setConfirm({ kind: 'photo', url })}
                  onReorder={reorder}
                  onDismiss={dismissUpload}
                  pickerRef={photoPicker}
                />
              </Section>
            </>
          )}
        </div>

        {toast && <div role="status" className="hc-ce-toast hc-toast-in">{toast}</div>}

        <footer className="hc-ce-foot">
          {saveError
            ? <p role="alert" className="hc-ce-save-error">{saveError}</p>
            : <p className={`hc-ce-foot-hint ${dirty ? 'is-dirty' : ''}`}>{dirty ? t('editor.unsaved', { count: unsaved }) : t('editor.filesHint')}</p>}
          <Button variant="secondary" disabled={saving || uploading} onClick={requestClose}>{tc('actions.cancel')}</Button>
          <Button onClick={save} disabled={saving || !dirty || yearInvalid} aria-busy={saving}>{saving ? tc('actions.saving') : t('editor.save')}</Button>
        </footer>

        {confirm && (
          <div className="hc-ce-confirm-layer" onMouseDown={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
            <div role="alertdialog" aria-modal="true" aria-labelledby={`${titleId}-confirm`} aria-describedby={`${titleId}-confirm-body`} className="hc-ce-confirm surface-depth surface-float">
              <h3 id={`${titleId}-confirm`}>{confirmText.title}</h3>
              <p id={`${titleId}-confirm-body`}>{confirmText.body}</p>
              <div className="hc-ce-confirm-actions">
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <Button variant="secondary" autoFocus onClick={() => setConfirm(null)}>{confirmText.keep}</Button>
                <Button variant="destructive" onClick={runConfirm}>{confirmText.go}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default CarEditor;
