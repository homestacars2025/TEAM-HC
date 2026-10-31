import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isPdfFile } from '../../lib/receiptImage';

interface ReceiptFieldProps {
  labelId: string;
  file: File | null;
  preparing: boolean;
  /** 0 to 100 while uploading, otherwise `null`. */
  progress: number | null;
  disabled: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

const GalleryIcon: React.FC = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="15" rx="3" stroke="currentColor" strokeWidth="1.7" />
    <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 17l5-4 3.5 2.6L16 12l4 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CameraIcon: React.FC = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 8.5A1.5 1.5 0 015.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5v-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

const sourceButton = 'flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] text-sm font-semibold text-[#0f1117] transition-colors hover:bg-black/[0.03] disabled:cursor-default disabled:opacity-60';

/**
 * Two inputs on purpose. `capture` opens the camera directly and removes the gallery
 * from the sheet, so the gallery input must not have it.
 */
const ReceiptField: React.FC<ReceiptFieldProps> = ({ labelId, file, preparing, progress, disabled, onPick, onRemove }) => {
  const { t } = useTranslation('custody');
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const isPdf = !!file && isPdfFile(file);

  useEffect(() => {
    if (!file || isPdf) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isPdf]);

  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (picked) onPick(picked);
  };

  return (
    <div>
      <input ref={gallery} type="file" accept="image/*,application/pdf" className="hidden" tabIndex={-1} aria-hidden="true" onChange={take} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} aria-hidden="true" onChange={take} />

      {preparing ? (
        <div role="status" className="flex min-h-28 items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 text-sm text-gray-500">
          {t('expense.receipt.preparing')}
        </div>
      ) : file ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] p-3">
          {preview ? (
            <img src={preview} alt={t('expense.receipt.previewAlt')} className="size-16 shrink-0 rounded-lg border border-[var(--border-subtle)] object-cover" />
          ) : (
            <span aria-label={t('expense.receipt.pdf')} className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-red-50 text-xs font-bold text-red-700">{'PDF'}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-[#0f1117]" dir="ltr">{file.name}</div>
            <div className="text-xs text-gray-500"><bdi dir="ltr">{formatSize(file.size)}</bdi></div>
            <div className="mt-1 flex gap-4">
              <button type="button" disabled={disabled} onClick={() => gallery.current?.click()} className="min-h-9 cursor-pointer text-[13px] font-semibold text-[var(--accent-strong)] disabled:opacity-60">
                {t('expense.receipt.replace')}
              </button>
              <button type="button" disabled={disabled} onClick={onRemove} className="min-h-9 cursor-pointer text-[13px] font-semibold text-red-600 disabled:opacity-60">
                {t('expense.receipt.remove')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-labelledby={labelId}
            disabled={disabled}
            onClick={() => gallery.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) onPick(dropped);
            }}
            className={`hidden min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-4 text-center transition-colors md:flex ${dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-gray-200 hover:border-[var(--accent)]'}`}
          >
            <span className="text-[var(--accent-strong)]"><GalleryIcon /></span>
            <span className="text-sm font-medium text-gray-700">{t('expense.receipt.dropTitle')}</span>
            <span className="text-xs text-gray-400">{t('expense.receipt.dropHint')}</span>
          </button>

          <div className="grid grid-cols-2 gap-2 md:hidden">
            <button type="button" disabled={disabled} onClick={() => camera.current?.click()} className={sourceButton}>
              <CameraIcon />{t('expense.receipt.camera')}
            </button>
            <button type="button" disabled={disabled} onClick={() => gallery.current?.click()} className={sourceButton}>
              <GalleryIcon />{t('expense.receipt.gallery')}
            </button>
          </div>
        </>
      )}

      {progress !== null && (
        <div className="mt-2">
          <div className="text-xs text-gray-500">{t('expense.receipt.uploading', { percent: progress })}</div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-labelledby={labelId}
            className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.06]"
          >
            <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-150" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptField;
