import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { prepareReceipt, receiptRejection } from '../../lib/receiptImage';
import { CameraIcon, UploadBar, UploadIcon } from './FileDrop';

interface PhotoGridProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  progress?: number | null;
}

/** Several photos: the camera comes first on a phone, and the first photo is the cover. */
const PhotoGrid: React.FC<PhotoGridProps> = ({ files, onChange, disabled = false, progress }) => {
  const { t } = useTranslation('common');
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const previews = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);

  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);

  const add = async (picked: File[]) => {
    if (picked.length === 0 || disabled) return;
    const usable = picked.filter(file => file.type.startsWith('image/') && !receiptRejection(file));
    setProblem(usable.length < picked.length ? t('upload.someSkipped') : null);
    setPreparing(true);
    const prepared = await Promise.all(usable.map(file => prepareReceipt(file).catch(() => null)));
    setPreparing(false);
    const good = prepared.filter((file): file is File => file !== null);
    if (good.length < usable.length) setProblem(t('upload.someSkipped'));
    if (good.length > 0) onChange([...files, ...good]);
  };

  const move = (index: number, by: number) => {
    const next = [...files];
    const [file] = next.splice(index, 1);
    next.splice(index + by, 0, file);
    onChange(next);
  };

  return (
    <div className="min-w-0">
      <input ref={gallery} type="file" accept="image/*" multiple hidden disabled={disabled} onChange={e => { void add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden disabled={disabled} onChange={e => { void add(Array.from(e.target.files ?? [])); e.target.value = ''; }} />

      <div
        className={`hc-file-drop ${dragging ? 'is-dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); void add(Array.from(e.dataTransfer.files)); }}
      >
        <button type="button" className="hc-file-camera" disabled={disabled} onClick={() => camera.current?.click()}><CameraIcon />{t('upload.camera')}</button>
        <button type="button" disabled={disabled || preparing} onClick={() => gallery.current?.click()}>
          <UploadIcon />{preparing ? t('upload.preparing') : t('upload.dropPhotos')}
        </button>
      </div>

      {files.length > 0 && (
        <ol className="hc-photo-grid">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <img src={previews[index]} alt="" />
              <button type="button" className="is-remove" disabled={disabled} aria-label={t('actions.remove')} onClick={() => onChange(files.filter((_, i) => i !== index))}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
              </button>
              {files.length > 1 && (
                <span className="hc-photo-move">
                  <button type="button" disabled={disabled || index === 0} aria-label={t('upload.moveEarlier')} onClick={() => move(index, -1)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-flip"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button type="button" disabled={disabled || index === files.length - 1} aria-label={t('upload.moveLater')} onClick={() => move(index, 1)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-flip"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      <UploadBar percent={progress} />
      {problem && <p role="alert" className="hc-field-error">{problem}</p>}
    </div>
  );
};

export default PhotoGrid;
