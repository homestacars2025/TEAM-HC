import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useStaffProfiles } from '../hooks/useStaffProfiles';
import { useInbox } from '../lib/InboxContext';
import { useUiDir } from '../lib/notifications/renderI18n';
import { TASK_PAGE_SIZE, completeTask, completeTaskOnExit, getMyTasks, uploadTaskProof } from '../lib/queries/tasks';
import { supabase } from '../lib/supabase';
import type { StaffAvatarProfile } from '../lib/staffAvatar';
import { TASK_GROUPS, groupTasks, taskGroup, weekProgress } from '../lib/taskGroups';
import type { MyTask, TaskActionResult } from '../lib/types/tasks';
import Confetti from '../components/Confetti';
import TaskCard from '../components/tasks/TaskCard';
import TaskProofSheet from '../components/tasks/TaskProofSheet';
import Button from '../components/Button';
import StaffAvatar from '../components/StaffAvatar';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { ReceiptLightbox } from './AccountingPage';

/**
 * The signed-in person's tasks.
 *
 * Completing is optimistic, and there is no RPC to undo it, so the write itself
 * waits: a card leaves at once, sits in Done for the length of the Undo toast, and
 * only then reaches the server. Anything still waiting when the page goes away is
 * sent right then, so leaving or closing the tab never loses a completion.
 */

type Tab = 'active' | 'done' | 'missed';

const TABS: Tab[] = ['active', 'done', 'missed'];

/** Circle fills and the check draws, then the card folds. Matches index.css. */
const LEAVE_MS = 720;
const UNDO_MS = 5000;
const CLOCK_MS = 60_000;

type Lists = Record<Tab, MyTask[]>;

const NO_TASKS: Lists = { active: [], done: [], missed: [] };

const fetchLists = async (): Promise<Lists> => {
  const [active, done, missed] = await Promise.all(TABS.map(tab => getMyTasks(tab)));
  return { active, done, missed };
};

function refusalMessage(t: TFunction, result: TaskActionResult): string {
  switch (result.code) {
    case 'not_open': return t('toast.notOpen');
    case 'proof_required': return t('toast.proofRequired');
    case 'forbidden': return t('toast.forbidden');
    default: return t('toast.completeFailed');
  }
}

interface Pending {
  task: MyTask;
  notes: string | null;
  proofUrl: string | null;
  timer: number;
  /** Read up front, because a closing page has no time to ask for it. */
  accessToken: string | null;
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

const Segments: React.FC<{ value: Tab; counts: Record<Tab, string | null>; onChange: (tab: Tab) => void }> = ({ value, counts, onChange }) => {
  const { t } = useTranslation('tasks');
  const index = TABS.indexOf(value);

  return (
    <div role="tablist" aria-label={t('tabs.aria')} className="relative grid w-full max-w-md grid-cols-3 rounded-full bg-black/[0.05] p-1">
      <span
        aria-hidden
        className="hc-segment-pill absolute bottom-1 top-1 rounded-full bg-[var(--surface)] shadow-[0_1px_4px_rgba(15,17,23,0.12)]"
        style={{ width: 'calc((100% - 8px) / 3)', insetInlineStart: `calc(4px + ${index} * (100% - 8px) / 3)` }}
      />
      {TABS.map(key => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`relative z-[1] inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-full text-[13.5px] font-semibold transition-colors ${value === key ? 'text-[#0f1117]' : 'text-gray-500'}`}
        >
          {t(`tabs.${key}`)}
          {counts[key] !== null && <span className="text-xs font-medium text-gray-400">{counts[key]}</span>}
        </button>
      ))}
    </div>
  );
};

const CardSkeleton: React.FC = () => (
  <div className="flex gap-3 rounded-2xl border border-[var(--border-subtle)] p-4">
    <div className="size-[26px] shrink-0 animate-pulse rounded-full bg-black/[0.06]" />
    <div className="min-w-0 flex-1">
      <div className="h-4 w-1/2 animate-pulse rounded bg-black/[0.06]" />
      <div className="mt-2.5 h-3 w-4/5 animate-pulse rounded bg-black/[0.04]" />
      <div className="mt-3 flex gap-3">
        <div className="h-3 w-16 animate-pulse rounded bg-black/[0.04]" />
        <div className="h-3 w-20 animate-pulse rounded bg-black/[0.04]" />
      </div>
    </div>
  </div>
);

const EmptyState: React.FC<{ tab: Tab; profile: StaffAvatarProfile | null }> = ({ tab, profile }) => {
  const { t } = useTranslation('tasks');
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <StaffAvatar profile={{ gender: profile?.gender, avatar_bg: profile?.avatar_bg }} size={132} />
      <div className="mt-5 text-[17px] font-semibold text-[#0f1117]">{t(`empty.${tab}Title`)}</div>
      <div className="mt-1.5 max-w-xs text-sm leading-relaxed text-gray-500">{t(`empty.${tab}Body`)}</div>
    </div>
  );
};

const UndoToast: React.FC<{ task: MyTask; onUndo: () => void }> = ({ task, onUndo }) => {
  const { t } = useTranslation('tasks');
  return (
    <div role="status" className="hc-toast-in relative overflow-hidden rounded-2xl bg-[#0f1117] text-white shadow-[0_12px_40px_rgba(15,17,23,0.3)]">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t('undo.done', { title: task.title })}</span>
        <button type="button" onClick={onUndo} className="min-h-9 shrink-0 cursor-pointer rounded-lg px-2 text-sm font-semibold text-[var(--accent)]">
          {t('undo.action')}
        </button>
      </div>
      <span aria-hidden className="hc-undo-timer absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent)]" style={{ animationDuration: `${UNDO_MS}ms` }} />
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const TasksPage: React.FC = () => {
  const { t } = useTranslation('tasks');
  const dir = useUiDir();
  const { userId, profile } = useCurrentUser();
  const { refresh: refreshInbox, tasksVersion, bumpTasks, adjustOpenTasks } = useInbox();
  const staffProfiles = useStaffProfiles();
  const [params] = useSearchParams();
  const highlighted = params.get('task');

  const [tab, setTab] = useState<Tab>('active');
  const [lists, setLists] = useState<Lists>(NO_TASKS);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [proving, setProving] = useState<MyTask | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [waiting, setWaiting] = useState<MyTask[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);
  const [now, setNow] = useState(() => new Date());

  const pending = useRef(new Map<string, Pending>());
  const mounted = useRef(true);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => window.clearInterval(clock);
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
    try {
      const next = await fetchLists();
      if (mounted.current) setLists(next);
    } catch { /* the list stays as it was */ }
  }, []);

  // A new task arrived, or another tab changed something.
  useEffect(() => {
    if (tasksVersion > 0) reload();
  }, [tasksVersion, reload]);

  const showError = useCallback((message: string) => {
    setErrorToast(message);
    window.setTimeout(() => setErrorToast(null), 3600);
  }, []);

  const commit = useCallback(async (id: string) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.current.delete(id);

    const result = await completeTask(id, entry.notes, entry.proofUrl);
    if (mounted.current) {
      await reload();
      setWaiting(list => list.filter(task => task.id !== id));
      if (!result.ok) showError(refusalMessage(t, result));
    }
    refreshInbox();
    bumpTasks();
  }, [reload, refreshInbox, bumpTasks, showError, t]);

  // Leaving is the moment nothing can wait any longer. Through a ref, so that a new
  // `commit` (a language change remakes it) cannot count as leaving.
  const latestCommit = useRef(commit);
  latestCommit.current = commit;
  useEffect(() => {
    mounted.current = true;
    const queue = pending.current;

    // Closing or reloading: the browser would cancel an ordinary request.
    const onPageHide = () => {
      queue.forEach((entry, id) => {
        window.clearTimeout(entry.timer);
        if (entry.accessToken) completeTaskOnExit(id, entry.notes, entry.proofUrl, entry.accessToken);
      });
      queue.clear();
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      mounted.current = false;
      window.removeEventListener('pagehide', onPageHide);
      // Moving to another page of the app: nothing is unloading, so the normal way.
      Array.from(queue.keys()).forEach(id => { latestCommit.current(id); });
    };
  }, []);

  const pendingIds = useMemo(() => new Set(waiting.map(task => task.id)), [waiting]);
  const active = useMemo(() => lists.active.filter(task => !pendingIds.has(task.id)), [lists.active, pendingIds]);
  const done = useMemo(() => [
    ...waiting.map(task => ({ ...task, status: 'done' as const, completed_at: now.toISOString() })),
    ...lists.done.filter(task => !pendingIds.has(task.id)),
  ], [lists.done, waiting, pendingIds, now]);

  const groups = useMemo(() => groupTasks(active, now), [active, now]);
  const progress = useMemo(() => weekProgress(active, done, lists.missed, now), [active, done, lists.missed, now]);

  const complete = useCallback((task: MyTask, notes: string | null, proofUrl: string | null) => {
    setLeaving(prev => new Set(prev).add(task.id));
    adjustOpenTasks(-1);

    const isDueNow = ['overdue', 'today'].includes(taskGroup(task, now));
    const remaining = active.filter(other => other.id !== task.id && ['overdue', 'today'].includes(taskGroup(other, now)));

    const entry: Pending = {
      task, notes, proofUrl,
      accessToken: null,
      timer: window.setTimeout(() => { commit(task.id); }, LEAVE_MS + UNDO_MS),
    };
    pending.current.set(task.id, entry);
    supabase.auth.getSession().then(({ data }) => { entry.accessToken = data.session?.access_token ?? null; });

    window.setTimeout(() => {
      if (!mounted.current || !pending.current.has(task.id)) return;
      setLeaving(prev => { const next = new Set(prev); next.delete(task.id); return next; });
      setWaiting(list => [task, ...list]);
      if (isDueNow && remaining.length === 0) setCelebrate(n => n + 1);
    }, LEAVE_MS);
  }, [active, adjustOpenTasks, commit, now]);

  const undo = (id: string) => {
    const entry = pending.current.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    pending.current.delete(id);
    setWaiting(list => list.filter(task => task.id !== id));
    adjustOpenTasks(1);
  };

  const onTapCircle = useCallback((task: MyTask) => {
    if (task.requires_proof) setProving(task);
    else complete(task, null, null);
  }, [complete]);

  const confirmProof = async (notes: string, file: File): Promise<string | null> => {
    const task = proving;
    if (!task || !userId) return t('proof.uploadFailed');
    try {
      const url = await uploadTaskProof(userId, task.id, file);
      setProving(null);
      complete(task, notes.trim() || null, url);
      return null;
    } catch {
      return t('proof.uploadFailed');
    }
  };

  const closeProofSheet = useCallback(() => setProving(null), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  // Opened from a notification: bring that task to the middle of the screen.
  useEffect(() => {
    if (!highlighted || loading) return;
    setTab('active');
    document.querySelector(`[data-task="${highlighted}"]`)?.scrollIntoView({ block: 'center' });
  }, [highlighted, loading]);

  const hasMore = (key: Tab) => lists[key].length > 0 && lists[key].length % TASK_PAGE_SIZE === 0;

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const rows = await getMyTasks(tab, TASK_PAGE_SIZE, lists[tab].length);
      setLists(prev => ({ ...prev, [tab]: [...prev[tab], ...rows] }));
    } catch {
      showError(t('failed'));
    }
    setLoadingMore(false);
  };

  const visible: Record<Tab, MyTask[]> = { active, done, missed: lists.missed };
  const ready = !loading && !failed;
  const counts: Record<Tab, string | null> = {
    active: ready ? String(active.length) : null,
    done: ready ? `${done.length}${hasMore('done') ? '+' : ''}` : null,
    missed: ready ? `${lists.missed.length}${hasMore('missed') ? '+' : ''}` : null,
  };

  const creators = useMemo(
    () => new Map(Array.from(staffProfiles?.values() ?? []).map(person => [person.full_name, person])),
    [staffProfiles],
  );
  const card = (task: MyTask) => (
    <TaskCard
      key={task.id}
      task={task}
      now={now}
      leaving={leaving.has(task.id)}
      highlighted={task.id === highlighted}
      from={creators.get(task.created_by_name)}
      onComplete={onTapCircle}
      onOpenProof={setLightbox}
    />
  );

  const dueToday = groups.today.length;
  const overdue = groups.overdue.length;
  const todayLine = t('summary.today', { count: dueToday });
  const overdueLine = t('summary.overdue', { count: overdue });
  const summary = overdue > 0 ? t('summary.joined', { today: todayLine, overdue: overdueLine }) : todayLine;
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6 lg:py-10">
      <header className="relative">
        {celebrate > 0 && <Confetti key={celebrate} pieces={22} />}
        <h1 className="text-[32px] font-semibold leading-tight text-[#0f1117] sm:text-[36px]">{t('title')}</h1>
        <p className="mt-1 min-h-6 text-[15px] text-gray-500">{ready && summary}</p>
        {ready && progress.total > 0 && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.06]">
              <div className="hc-progress-fill h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{t('progress', { done: progress.done, total: progress.total })}</p>
          </div>
        )}
      </header>

      <Segments value={tab} counts={counts} onChange={setTab} />

      {failed ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border-subtle)] px-6 py-14 text-center">
          <p role="alert" className="text-sm text-gray-600">{t('failed')}</p>
          <Button onClick={() => setAttempt(n => n + 1)}>{t('common:actions.tryAgain')}</Button>
        </div>
      ) : loading ? (
        <div aria-busy className="flex flex-col gap-3">
          {[0, 1, 2, 3].map(i => <CardSkeleton key={i} />)}
        </div>
      ) : visible[tab].length === 0 ? (
        <EmptyState tab={tab} profile={profile} />
      ) : tab === 'active' ? (
        <div className="flex flex-col gap-5">
          {TASK_GROUPS.filter(group => groups[group].length > 0).map(group => (
            <section key={group}>
              <h2 className="sticky top-0 z-10 -mx-1 mb-1.5 flex items-center gap-2 bg-white/85 px-1 py-2 text-[13px] font-semibold text-gray-600 backdrop-blur-sm">
                {group === 'overdue' && <span className="size-2 rounded-full bg-red-500" />}
                <span className={group === 'overdue' ? 'text-red-600' : undefined}>{t(`groups.${group}`)}</span>
                <span className="font-normal text-gray-400">{groups[group].length}</span>
              </h2>
              <div className="flex flex-col gap-2.5">{groups[group].map(card)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">{visible[tab].map(card)}</div>
      )}

      {ready && hasMore(tab) && (
        <div className="flex justify-center">
          <button type="button" onClick={loadMore} disabled={loadingMore} className="min-h-11 cursor-pointer rounded-xl border border-[var(--border-subtle)] px-5 text-sm font-medium text-gray-700 disabled:cursor-default disabled:opacity-60">
            {t('loadMore')}
          </button>
        </div>
      )}

      {proving && <TaskProofSheet task={proving} onCancel={closeProofSheet} onConfirm={confirmProof} />}
      {lightbox && <ReceiptLightbox url={lightbox} onClose={closeLightbox} />}

      {ReactDOM.createPortal(
        <div dir={dir} className="pointer-events-none fixed inset-x-3 bottom-4 z-[9400] mx-auto flex max-w-sm flex-col gap-2 [&>*]:pointer-events-auto">
          {errorToast && <div role="alert" className="hc-toast-in rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg">{errorToast}</div>}
          {waiting.filter(task => pending.current.has(task.id)).map(task => (
            <UndoToast key={task.id} task={task} onUndo={() => undo(task.id)} />
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default TasksPage;
