import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isPdfFile, prepareReceipt, receiptRejection } from '../../lib/receiptImage';
import { isPdfLink } from './Lightbox';

export const CameraIcon: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 8.5A1.5 1.5 0 015.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

export const UploadIcon: React.FC = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PdfBadge: React.FC = () => <span aria-hidden="true" className="hc-pdf-badge">PDF</span>;

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

export const UploadBar: React.FC<{ percent: number | null | undefined }> = ({ percent }) => {
  const { t } = useTranslation('common');
  if (percent == null) return null;
  return (
    <div className="hc-upload-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('upload.uploading', { percent })}>
      <span style={{ width: `${percent}%` }} />
    </div>
  );
};

interface FileDropProps {
  label: string;
  kind: 'image' | 'pdf' | 'any';
  file: File | null;
  /** What is on file already, shown until a new one replaces it. */
  existingUrl?: string | null;
  onChange: (file: File | null) => void;
  progress?: number | null;
  disabled?: boolean;
}

const ACCEPT = { image: 'image/*', pdf: 'application/pdf', any: 'image/*,application/pdf' };

/** Two inputs on purpose: `capture` opens the camera and hides the gallery. */
const FileDrop: React.FC<FileDropProps> = ({ label, kind, file, existingUrl, onChange, progress, disabled = false }) => {
  const { t } = useTranslation('common');
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const isPdf = !!file && isPdfFile(file);

  useEffect(() => {
    if (!file || isPdf) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isPdf]);

  const take = async (picked: File | undefined) => {
    if (!picked || disabled) return;
    const wrongKind = (kind === 'pdf' && !isPdfFile(picked)) || (kind === 'image' && !picked.type.startsWith('image/'));
    const rejected = wrongKind ? 'receiptType' : receiptRejection(picked);
    if (rejected) { setProblem(t(`upload.${rejected === 'receiptType' ? 'wrongType' : 'tooLarge'}`)); return; }
    setProblem(null);
    setPreparing(true);
    try {
      onChange(await prepareReceipt(picked));
    } catch {
      setProblem(t('upload.unreadable'));
    } finally {
      setPreparing(false);
    }
  };

  const shownPdf = file ? isPdf : !!existingUrl && isPdfLink(existingUrl);
  const shownImage = preview ?? (!file && existingUrl && !shownPdf ? existingUrl : null);
  const hasSomething = !!file || !!existingUrl;

  return (
    <div className="min-w-0">
      <div className="hc-field-label">{label}</div>
      <input ref={gallery} type="file" accept={ACCEPT[kind]} hidden disabled={disabled} onChange={e => { void take(e.target.files?.[0]); e.target.value = ''; }} />
      {kind !== 'pdf' && <input ref={camera} type="file" accept="image/*" capture="environment" hidden disabled={disabled} onChange={e => { void take(e.target.files?.[0]); e.target.value = ''; }} />}

      {hasSomething ? (
        <div className="hc-file-chosen">
          <span className="hc-file-thumb">{shownImage ? <img src={shownImage} alt="" /> : <PdfBadge />}</span>
          <span className="min-w-0 flex-1">
            <span dir="auto" className="block truncate text-[13px] font-medium text-[#0f1117]">{file ? file.name : label}</span>
            <span className="block text-xs text-gray-500">{preparing ? t('upload.preparing') : file ? formatSize(file.size) : t('upload.onFile')}</span>
          </span>
          {file ? (
            <button type="button" disabled={disabled} onClick={() => onChange(null)}>{t('actions.remove')}</button>
          ) : (
            <button type="button" disabled={disabled} onClick={() => gallery.current?.click()}>{t('upload.replace')}</button>
          )}
        </div>
      ) : (
        <div
          className={`hc-file-drop ${dragging ? 'is-dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); void take(e.dataTransfer.files[0]); }}
        >
          {kind !== 'pdf' && (
            <button type="button" className="hc-file-camera" disabled={disabled} onClick={() => camera.current?.click()}><CameraIcon />{t('upload.camera')}</button>
          )}
          <button type="button" disabled={disabled || preparing} onClick={() => gallery.current?.click()}>
            <UploadIcon />{preparing ? t('upload.preparing') : t('upload.drop')}
          </button>
        </div>
      )}
      <UploadBar percent={progress} />
      {problem && <p role="alert" className="hc-field-error">{problem}</p>}
    </div>
  );
};

export default FileDrop;
