import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useInbox } from '../lib/InboxContext';
import { BUSINESS_TIME_ZONE } from '../lib/istanbulTime';
import { useUiDir } from '../lib/notifications/renderI18n';
import { TASK_PAGE_SIZE, completeTask, getMyTasks, proofTooLarge, uploadTaskProof } from '../lib/queries/tasks';
import { useTimeFormat } from '../lib/relative-time';
import { TASK_GROUPS, groupTasks } from '../lib/taskGroups';
import type { MyTask, TaskActionResult, TaskPriority } from '../lib/types/tasks';
import { ReceiptThumb } from '../components/WalletParts';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { ReceiptLightbox, useDateLocale } from './AccountingPage';

/**
 * The signed-in person's tasks. Everything arrives assigned, so there is nothing to
 * claim: a task is done, missed, or still to do. Every write goes through an RPC,
 * and each one re-reads the list afterwards, because whether a task is still open
 * is a fact only the server holds.
 */

type Tab = 'active' | 'done' | 'missed';

const TABS: Tab[] = ['active', 'done', 'missed'];

/** Long enough for the check to land before the card leaves. */
const FINISH_MS = 720;
const DESCRIPTION_PREVIEW = 120;

const PRIORITY_CHIP: Record<TaskPriority, string> = {
  urgent: 'bg-red-50 text-red-700',
  high: 'bg-orange-50 text-orange-700',
  normal: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  low: 'bg-gray-100 text-gray-600',
};

const GROUP_COLOR: Record<string, string> = { overdue: 'text-red-600' };

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

function useDateTime(): (iso: string) => string {
  const locale = useDateLocale();
  return useCallback((iso: string) => new Date(iso).toLocaleString(locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: BUSINESS_TIME_ZONE,
  }), [locale]);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastState = { message: string; tone: 'success' | 'error' | 'info' } | null;

const TOAST_CLASS = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-[#0f1117]' };

const Toast: React.FC<{ toast: NonNullable<ToastState>; dir: 'ltr' | 'rtl' }> = ({ toast, dir }) =>
  ReactDOM.createPortal(
    <div
      dir={dir}
      role="status"
      className={`fixed start-1/2 top-5 z-[10000] max-w-[90vw] -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-lg rtl:translate-x-1/2 ${TOAST_CLASS[toast.tone]}`}
    >
      {toast.message}
    </div>,
    document.body,
  );

function refusalMessage(t: TFunction, result: TaskActionResult): NonNullable<ToastState> {
  switch (result.code) {
    case 'not_open': return { message: t('toast.notOpen'), tone: 'info' };
    case 'proof_required': return { message: t('toast.proofRequired'), tone: 'error' };
    case 'forbidden': return { message: t('toast.forbidden'), tone: 'error' };
    default: return { message: t('toast.completeFailed'), tone: 'error' };
  }
}

// ─── Mark done ────────────────────────────────────────────────────────────────

const CompleteDialog: React.FC<{
  task: MyTask;
  onCancel: () => void;
  /** Resolves with a message to show, or `null` once the dialog can close. */
  onConfirm: (notes: string, file: File | null) => Promise<string | null>;
}> = ({ task, onCancel, onConfirm }) => {
  const { t } = useTranslation('tasks');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

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
    if (proofTooLarge(picked)) { setError(t('dialog.proofTooLarge')); return; }
    setError(null);
    setFile(picked);
  };

  const submit = async () => {
    if (task.requires_proof && !file) { setError(t('dialog.proofMissing')); return; }
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
      className="fixed inset-0 z-[9000] flex items-end justify-center bg-[rgba(15,17,23,0.45)] p-3 sm:items-center"
      onMouseDown={e => { if (e.target === e.currentTarget && !saving) onCancel(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={t('dialog.title')} className="flex max-h-[calc(100dvh-24px)] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-[var(--surface)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:p-6">
        <h2 className="text-base font-semibold text-[#0f1117]">{t('dialog.title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{task.title}</p>

        {task.requires_proof && (
          <div className="mt-4">
            <div className="mb-1.5 text-[13px] font-medium text-gray-700">
              {t('dialog.proofLabel')} <span className="font-normal text-red-600">{t('dialog.proofRequired')}</span>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }}
            />
            {preview && <img src={preview} alt={t('dialog.proofAlt')} className="mb-2 max-h-48 w-full rounded-xl object-contain" />}
            <button
              type="button"
              disabled={saving}
              onClick={() => fileInput.current?.click()}
              className="min-h-11 w-full cursor-pointer rounded-xl border border-dashed border-gray-300 text-sm font-medium text-gray-700 transition-colors hover:border-[var(--accent)] disabled:cursor-default"
            >
              {file ? t('dialog.replacePhoto') : t('dialog.takePhoto')}
            </button>
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-medium text-gray-700">
            {t('dialog.notesLabel')} <span className="font-normal text-gray-400">{t('dialog.notesOptional')}</span>
          </span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder={t('dialog.notesPlaceholder')}
            className="w-full resize-none rounded-xl border border-[var(--border-subtle)] p-3 text-base text-[#0f1117] outline-none transition-colors focus:border-[var(--accent)] sm:text-sm"
          />
        </label>

        {error && <p role="alert" className="mt-2 text-[13px] text-red-600">{error}</p>}

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={saving} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border-subtle)] px-5 text-sm font-medium text-gray-700 disabled:cursor-default disabled:opacity-60">
            {t('dialog.cancel')}
          </button>
          <button type="button" onClick={submit} disabled={saving} className="min-h-11 cursor-pointer rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-default disabled:opacity-60">
            {saving ? t('dialog.saving') : t('dialog.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Task card ────────────────────────────────────────────────────────────────

const TaskCard: React.FC<{
  task: MyTask;
  finishing: boolean;
  onComplete: (task: MyTask) => void;
  onOpenProof: (url: string) => void;
}> = ({ task, finishing, onComplete, onOpenProof }) => {
  const { t } = useTranslation('tasks');
  const { due } = useTimeFormat();
  const dateTime = useDateTime();
  const [expanded, setExpanded] = useState(false);

  const isActive = task.status === 'open' || task.status === 'claimed';
  const deadline = isActive && task.due_at ? due(task.due_at) : null;
  const description = task.description ?? '';
  const isLong = description.length > DESCRIPTION_PREVIEW;

  return (
    <article className={`relative flex flex-col gap-2.5 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:p-5 ${finishing ? 'hc-task-finishing' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[15px] font-semibold leading-snug text-[#0f1117]">{task.title}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_CHIP[task.priority] ?? PRIORITY_CHIP.normal}`}>
          {t(`priority.${task.priority}`)}
        </span>
      </div>

      {description && (
        <div className="text-[13px] leading-relaxed text-gray-600">
          <p className={expanded || !isLong ? 'whitespace-pre-wrap' : 'line-clamp-2'}>{description}</p>
          {isLong && (
            <button type="button" onClick={() => setExpanded(open => !open)} aria-expanded={expanded} className="mt-1 min-h-8 cursor-pointer font-medium text-[var(--accent-strong)]">
              {t(expanded ? 'showLess' : 'showMore')}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        {task.kind === 'recurring' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('kind.recurring')}
          </span>
        )}
        {task.due_at && isActive && <bdi>{dateTime(task.due_at)}</bdi>}
        {deadline && <span className={deadline.overdue ? 'font-semibold text-red-600' : 'font-medium text-[var(--accent-strong)]'}>{deadline.text}</span>}
        {task.status === 'done' && task.completed_at && <span>{t('completedOn', { date: dateTime(task.completed_at) })}</span>}
        {task.status === 'missed' && task.due_at && <span className="font-medium text-red-600">{t('wasDue', { date: dateTime(task.due_at) })}</span>}
        {task.created_by_name && <span>{t('from', { name: task.created_by_name })}</span>}
        {isActive && task.requires_proof && <span className="font-medium text-amber-700">{t('requiresProof')}</span>}
      </div>

      {task.status === 'done' && (task.completion_notes || task.proof_url) && (
        <div className="flex items-start gap-3 rounded-xl bg-black/[0.03] p-3">
          {task.proof_url && <ReceiptThumb url={task.proof_url} label={t('viewProof')} onOpen={onOpenProof} />}
          {task.completion_notes && (
            <p className="min-w-0 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">
              <span className="font-medium text-gray-700">{t('note')}: </span>{task.completion_notes}
            </p>
          )}
        </div>
      )}

      {isActive && (
        <div className="mt-1">
          <button
            type="button"
            onClick={() => onComplete(task)}
            disabled={finishing}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-default lg:min-h-10"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t('actions.complete')}
          </button>
        </div>
      )}

      {finishing && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-white/80">
          <span className="hc-task-check flex size-14 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </span>
      )}
    </article>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type Lists = Record<Tab, MyTask[]>;

const NO_TASKS: Lists = { active: [], done: [], missed: [] };

const fetchLists = async (): Promise<Lists> => {
  const [active, done, missed] = await Promise.all(TABS.map(tab => getMyTasks(tab)));
  return { active, done, missed };
};

const TasksPage: React.FC = () => {
  const { t } = useTranslation('tasks');
  const dir = useUiDir();
  const { userId } = useCurrentUser();
  const { refresh: refreshInbox } = useInbox();

  const [tab, setTab] = useState<Tab>('active');
  const [lists, setLists] = useState<Lists>(NO_TASKS);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [completing, setCompleting] = useState<MyTask | null>(null);
  const [finishing, setFinishing] = useState<Set<string>>(new Set());
  const [proof, setProof] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = useCallback((next: NonNullable<ToastState>) => {
    setToast(next);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fetchLists()
      .then(next => { if (!cancelled) setLists(next); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  /** Silent: this runs after an action, and a spinner would flash more than it informs. */
  const reload = useCallback(async () => {
    try { setLists(await fetchLists()); } catch { /* the list stays as it was */ }
  }, []);

  const setFinished = (id: string, on: boolean) => setFinishing(prev => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  /** Optimistic: the check lands at once, and a refusal puts the card back. */
  const finish = async (task: MyTask, notes: string, proofUrl: string | null) => {
    setCompleting(null);
    setFinished(task.id, true);
    const [result] = await Promise.all([completeTask(task.id, notes, proofUrl), wait(FINISH_MS)]);

    if (result.ok) {
      showToast({ message: t('toast.completed'), tone: 'success' });
    } else {
      showToast(refusalMessage(t, result));
    }
    await reload();
    setFinished(task.id, false);
    refreshInbox();
  };

  const confirmDialog = async (notes: string, file: File | null): Promise<string | null> => {
    const task = completing;
    if (!task) return null;
    let proofUrl: string | null = null;
    if (file) {
      if (!userId) return t('dialog.uploadFailed');
      try {
        proofUrl = await uploadTaskProof(userId, task.id, file);
      } catch {
        return t('dialog.uploadFailed');
      }
    }
    finish(task, notes, proofUrl);
    return null;
  };

  const closeDialog = useCallback(() => setCompleting(null), []);
  const closeProof = useCallback(() => setProof(null), []);

  const hasMore = (key: Tab) => lists[key].length > 0 && lists[key].length % TASK_PAGE_SIZE === 0;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const rows = await getMyTasks(tab, TASK_PAGE_SIZE, lists[tab].length);
      setLists(prev => ({ ...prev, [tab]: [...prev[tab], ...rows] }));
    } catch {
      showToast({ message: t('failed'), tone: 'error' });
    }
    setLoadingMore(false);
  };

  const countOf = (key: Tab) => {
    const count = key === 'active'
      ? lists.active.filter(task => !finishing.has(task.id)).length
      : lists[key].length;
    return hasMore(key) ? `${count}+` : String(count);
  };

  const groups = useMemo(() => groupTasks(lists.active), [lists.active]);
  const card = (task: MyTask) => (
    <TaskCard key={task.id} task={task} finishing={finishing.has(task.id)} onComplete={setCompleting} onOpenProof={setProof} />
  );
  const grid = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3';

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-10">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-[var(--accent)]" />
          <span className="text-xs font-semibold text-[var(--accent-strong)]">{t('eyebrow')}</span>
        </div>
        <h1 className="text-2xl font-semibold text-[#0f1117] sm:text-[28px]">{t('title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
      </header>

      <div role="tablist" aria-label={t('tabs.aria')} className="flex flex-wrap gap-1.5">
        {TABS.map(key => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setTab(key)}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors lg:min-h-10 ${selected ? 'border-transparent bg-[var(--accent-strong)] text-white' : 'border-[var(--border-subtle)] bg-[var(--surface)] text-gray-600 hover:border-gray-300'}`}
            >
              {t(`tabs.${key}`)}
              {!loading && !failed && (
                <span className={`rounded-full px-1.5 text-xs font-bold leading-5 ${selected ? 'bg-white/20' : 'bg-black/[0.05] text-gray-500'}`}>{countOf(key)}</span>
              )}
            </button>
          );
        })}
      </div>

      {failed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border-subtle)] px-6 py-14 text-center">
          <p role="alert" className="text-sm text-gray-600">{t('failed')}</p>
          <button type="button" onClick={() => setAttempt(n => n + 1)} className="min-h-11 cursor-pointer rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-white">
            {t('common:actions.tryAgain')}
          </button>
        </div>
      ) : loading ? (
        <div aria-busy className={grid}>
          {[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-black/[0.04]" />)}
        </div>
      ) : lists[tab].length === 0 ? (
        <div className="rounded-2xl border border-[var(--border-subtle)] px-6 py-14 text-center">
          <div className="text-[17px] font-semibold text-[#0f1117]">{t(`empty.${tab}Title`)}</div>
          <div className="mt-2 text-sm text-gray-500">{t(`empty.${tab}Body`)}</div>
        </div>
      ) : tab === 'active' ? (
        TASK_GROUPS.filter(group => groups[group].length > 0).map(group => (
          <section key={group}>
            <h2 className={`mb-2.5 text-[13px] font-semibold ${GROUP_COLOR[group] ?? 'text-gray-600'}`}>
              {t(`groups.${group}`)} <span className="font-normal opacity-70">({groups[group].length})</span>
            </h2>
            <div className={grid}>{groups[group].map(card)}</div>
          </section>
        ))
      ) : (
        <div className={grid}>{lists[tab].map(card)}</div>
      )}

      {!loading && !failed && hasMore(tab) && (
        <div className="flex justify-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border-subtle)] px-5 text-sm font-medium text-gray-700 disabled:cursor-default disabled:opacity-60">
            {t('loadMore')}
          </button>
        </div>
      )}

      {completing && <CompleteDialog task={completing} onCancel={closeDialog} onConfirm={confirmDialog} />}
      {proof && <ReceiptLightbox url={proof} onClose={closeProof} />}
      {toast && <Toast toast={toast} dir={dir} />}
    </div>
  );
};

export default TasksPage;
