import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { proofTooLarge } from '../../lib/queries/tasks';
import type { MyTask } from '../../lib/types/tasks';

interface TaskProofSheetProps {
  task: MyTask;
  onCancel: () => void;
  /** Resolves with a message to show, or `null` once the sheet can close. */
  onConfirm: (notes: string, file: File) => Promise<string | null>;
}

/** A bottom sheet on a phone, a modal on a computer. */
const TaskProofSheet: React.FC<TaskProofSheetProps> = ({ task, onCancel, onConfirm }) => {
  const { t } = useTranslation('tasks');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, saving]);

  const pick = (picked: File | undefined) => {
    if (!picked) return;
    if (!picked.type.startsWith('image/')) { setError(t('proof.notImage')); return; }
    if (proofTooLarge(picked)) { setError(t('proof.tooLarge')); return; }
    setError(null);
    setFile(picked);
  };

  const submit = async () => {
    if (!file) { setError(t('proof.missing')); return; }
    setSaving(true);
    setError(null);
    const message = await onConfirm(notes, file);
    if (message) {
      setError(message);
      setSaving(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9000] flex items-end justify-center bg-[rgba(15,17,23,0.45)] sm:items-center sm:p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !saving) onCancel(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={t('proof.title')} className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:rounded-2xl sm:p-6">
        <span aria-hidden className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-gray-200 sm:hidden" />
        <h2 className="text-[17px] font-semibold text-[#0f1117]">{t('proof.title')}</h2>
        <p className="mt-0.5 text-sm text-gray-500">{task.title}</p>

        <input ref={gallery} type="file" accept="image/*" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />

        <button
          type="button"
          disabled={saving}
          onClick={() => gallery.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]); }}
          className={`mt-4 flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed p-4 text-center transition-colors disabled:cursor-default ${dragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-gray-200 hover:border-[var(--accent)]'}`}
        >
          {preview ? (
            <img src={preview} alt={t('proof.previewAlt')} className="max-h-56 rounded-xl object-contain" />
          ) : (
            <>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-[var(--accent-strong)]" aria-hidden="true">
                <rect x="3" y="4.5" width="18" height="15" rx="3" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="9" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 17l5-4 3.5 2.6L16 12l4 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm font-medium text-gray-700">{t('proof.dropTitle')}</span>
              <span className="text-xs text-gray-400">{t('proof.dropHint')}</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={saving}
          onClick={() => camera.current?.click()}
          className="mt-2 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] text-sm font-medium text-gray-700 disabled:cursor-default md:hidden"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 8.5A1.5 1.5 0 015.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5v-9z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.7" />
          </svg>
          {t('proof.camera')}
        </button>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-gray-700">
            {t('proof.noteLabel')} <span className="font-normal text-gray-400">{t('proof.noteOptional')}</span>
          </span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder={t('proof.notePlaceholder')}
            className="w-full resize-none rounded-xl border border-[var(--border-subtle)] p-3 text-base text-[#0f1117] outline-none transition-colors focus:border-[var(--accent)] sm:text-sm"
          />
        </label>

        {error && <p role="alert" className="mt-2 text-[13px] text-red-600">{error}</p>}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border-subtle)] px-5 text-sm font-medium text-gray-700 disabled:cursor-default disabled:opacity-60">
            {t('proof.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={saving} className="min-h-11 cursor-pointer rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-strong-hover)] disabled:cursor-default disabled:opacity-60">
            {saving ? t('proof.saving') : t('proof.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TaskProofSheet;
