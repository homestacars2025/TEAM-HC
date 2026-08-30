import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useTimeFormat } from '../lib/relative-time';
import { useInbox } from '../lib/InboxContext';
import { useNotifText, useUiDir } from '../lib/notifications/renderI18n';
import { claimTask, completeTask, getMyTasks } from '../lib/queries/tasks';
import type { MyTask, TaskFilter, TaskPriority } from '../lib/types/tasks';

/**
 * The tasks targeted at the signed-in user's role.
 *
 * Nothing here renders server text directly. A task row carries a translation
 * key and its variables (`reminder.missing_insurance.title`, `{ plate }`), and
 * the stored `title`/`description` are a fallback for a key this build does not
 * know — so a dashboard deployed before a new reminder type still shows
 * something, and adding a language never touches the database.
 *
 * Direction follows the UI language for the same reason: the page has no fixed
 * language of its own any more.
 *
 * Every write goes through an RPC — RLS blocks direct table access — and each
 * one re-reads the list afterwards, because whether a task is still claimable
 * is a fact only the server holds.
 */

const BRAND = '#4ba6ea';

// ─── Priority ─────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<TaskPriority, { color: string; bg: string }> = {
  urgent: { color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  high: { color: '#ea580c', bg: 'rgba(234,88,12,0.10)' },
  normal: { color: '#0284c7', bg: 'rgba(2,132,199,0.09)' },
  low: { color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
};

const priorityColor = (p: TaskPriority) => PRIORITY_COLOR[p] ?? PRIORITY_COLOR.normal;

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastTone = 'success' | 'error' | 'info';
type ToastState = { message: string; tone: ToastTone } | null;

const TOAST_COLORS: Record<ToastTone, string> = {
  success: '#059669',
  error: '#dc2626',
  info: '#0f1117',
};

const Toast: React.FC<{ message: string; tone: ToastTone; dir: 'ltr' | 'rtl' }> = ({ message, tone, dir }) =>
  ReactDOM.createPortal(
    <div
      dir={dir}
      role="status"
      style={{
        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10000, background: TOAST_COLORS[tone], color: '#fff',
        borderRadius: 12, padding: '12px 20px', fontSize: 14, fontWeight: 600,
        boxShadow: '0 10px 32px rgba(0,0,0,0.22)', animation: 'tpSlideDown 200ms ease',
        maxWidth: 'calc(100vw - 32px)', textAlign: 'center',
      }}
    >
      {message}
    </div>,
    document.body,
  );

// ─── Completion dialog ────────────────────────────────────────────────────────

const CompleteDialog: React.FC<{
  title: string;
  pending: boolean;
  dir: 'ltr' | 'rtl';
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}> = ({ title, pending, dir, onCancel, onConfirm }) => {
  const { t } = useTranslation('tasks');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  return ReactDOM.createPortal(
    <div
      dir={dir}
      onMouseDown={e => { if (e.target === e.currentTarget && !pending) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,17,23,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'tpFadeIn 180ms ease',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 440,
        padding: '24px 24px 20px', boxShadow: '0 24px 80px rgba(0,0,0,0.20)',
        animation: 'tpSlideUp 200ms ease', textAlign: dir === 'rtl' ? 'right' : 'left',
      }}>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: '#0f1117', marginBottom: 6, letterSpacing: '-0.2px' }}>
          {t('dialog.title')}
        </div>
        <div style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.65, marginBottom: 18 }}>
          {title}
        </div>

        <label htmlFor="tp-notes" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
          {t('dialog.notesLabel')}{' '}
          <span style={{ fontWeight: 400, color: '#9ca3af' }}>{t('dialog.notesOptional')}</span>
        </label>
        <textarea
          id="tp-notes"
          autoFocus
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={t('dialog.notesPlaceholder')}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: '1.5px solid #e5e7eb', fontSize: 13.5, fontFamily: 'inherit',
            lineHeight: 1.7, resize: 'none', outline: 'none', color: '#0f1117',
            background: '#fff',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = BRAND; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            onClick={() => onConfirm(notes)}
            disabled={pending}
            style={{
              flex: 1, height: 44, borderRadius: 11, border: 'none',
              background: pending ? '#9ca3af' : '#059669', color: '#fff',
              fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
              cursor: pending ? 'default' : 'pointer', transition: 'background 140ms ease',
            }}
          >
            {pending ? t('dialog.saving') : t('dialog.confirm')}
          </button>
          <button
            onClick={onCancel}
            disabled={pending}
            style={{
              height: 44, padding: '0 20px', borderRadius: 11,
              border: '1.5px solid #e5e7eb', background: '#fff', color: '#4b5563',
              fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
              cursor: pending ? 'default' : 'pointer',
            }}
          >
            {t('dialog.cancel')}
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
  title: string;
  body: string;
  busy: boolean;
  onClaim: (t: MyTask) => void;
  onComplete: (t: MyTask) => void;
}> = ({ task, title, body, busy, onClaim, onComplete }) => {
  const { t } = useTranslation('tasks');
  const { relative, due: dueFormat } = useTimeFormat();
  const p = priorityColor(task.priority);
  const due = task.due_at ? dueFormat(task.due_at) : null;
  const isDone = task.status === 'done';

  return (
    <article style={{
      background: '#fff', borderRadius: 14, border: '1px solid #ebebeb',
      // The priority reads as a spine down the leading edge, so a column of
      // cards can be scanned by colour without reading a single word.
      borderInlineStartWidth: 4,
      borderInlineStartColor: isDone ? '#d1d5db' : p.color,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      opacity: isDone ? 0.72 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{
          flex: 1, minWidth: 180, margin: 0,
          fontSize: 15, fontWeight: 700, color: '#0f1117', lineHeight: 1.55,
          textDecoration: isDone ? 'line-through' : 'none',
        }}>
          {title}
        </h3>
        <span style={{
          flexShrink: 0, padding: '3px 10px', borderRadius: 20,
          fontSize: 11.5, fontWeight: 700, color: p.color, background: p.bg,
        }}>
          {t(`priority.${task.priority}`)}
        </span>
      </div>

      {body && (
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.7 }}>
          {body}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: '#9ca3af' }}>
        <span>{relative(task.created_at)}</span>
        {due && (
          <span style={{ color: due.overdue ? '#dc2626' : '#9ca3af', fontWeight: due.overdue ? 700 : 400 }}>
            {due.text}
          </span>
        )}
        {task.status === 'claimed' && task.claimed_by_name && (
          <span style={{ color: '#0284c7', fontWeight: 600 }}>
            {t('claimedBy', { name: task.claimed_by_name })}
          </span>
        )}
      </div>

      {!isDone && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
          {/* Claiming is offered, never required — completing straight from
              `open` is a legitimate path and the RPC allows it. */}
          {task.status === 'open' && (
            <button
              onClick={() => onClaim(task)}
              disabled={busy}
              style={{
                height: 38, padding: '0 16px', borderRadius: 10,
                border: `1.5px solid ${BRAND}`, background: '#fff', color: BRAND,
                fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                transition: 'background 140ms ease',
              }}
              onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'rgba(75,166,234,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
            >
              {t('actions.claim')}
            </button>
          )}
          <button
            onClick={() => onComplete(task)}
            disabled={busy}
            style={{
              height: 38, padding: '0 16px', borderRadius: 10, border: 'none',
              background: '#059669', color: '#fff',
              fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(5,150,105,0.25)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12.5l5 5L20 6.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('actions.complete')}
          </button>
        </div>
      )}
    </article>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: TaskFilter[] = ['active', 'done'];

/** A refusal's wording lives in the locale file; the data layer only names it. */
function refusalMessage(
  t: TFunction,
  result: { code?: string; error?: string },
  fallbackKey: 'claimFailed' | 'completeFailed',
): { message: string; tone: ToastTone } {
  switch (result.code) {
    case 'raced_claim': return { message: t('toast.racedClaim'), tone: 'info' };
    case 'raced_complete': return { message: t('toast.racedComplete'), tone: 'info' };
    case 'forbidden': return { message: t('toast.forbidden'), tone: 'error' };
    default: return { message: result.error ?? t(`toast.${fallbackKey}`), tone: 'error' };
  }
}

const TasksPage: React.FC = () => {
  const { t } = useTranslation('tasks');
  const dir = useUiDir();
  const notifText = useNotifText();

  const [tab, setTab] = useState<TaskFilter>('active');
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<MyTask | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const { refresh } = useInbox();

  const showToast = useCallback((message: string, tone: ToastTone) => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  /**
   * Silent on purpose: this runs after every action, and swapping the whole
   * list for a spinner on each click would flash more than it informs. Only the
   * tab switch below shows a loading state.
   */
  const reload = useCallback(async (filter: TaskFilter) => {
    setTasks(await getMyTasks(filter));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const rows = await getMyTasks(tab);
      if (!cancelled) { setTasks(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tab]);

  const handleClaim = useCallback(async (task: MyTask) => {
    setBusyId(task.id);
    const result = await claimTask(task.id);
    setBusyId(null);

    if (!result.ok) {
      // A lost race is not an error to apologise for — the list was simply
      // stale, so it is reloaded and the outcome stated plainly.
      const { message, tone } = refusalMessage(t, result, 'claimFailed');
      showToast(message, tone);
    } else {
      showToast(t('toast.claimed'), 'success');
    }
    await reload(tab);
    refresh();
  }, [tab, reload, refresh, showToast, t]);

  const handleComplete = useCallback(async (notes: string) => {
    const task = completing;
    if (!task) return;

    setBusyId(task.id);
    const result = await completeTask(task.id, notes);
    setBusyId(null);
    setCompleting(null);

    if (!result.ok) {
      const { message, tone } = refusalMessage(t, result, 'completeFailed');
      showToast(message, tone);
    } else {
      showToast(t('toast.completed'), 'success');
    }
    await reload(tab);
    refresh();
  }, [completing, tab, reload, refresh, showToast, t]);

  /** Resolved once per render so the card and the dialog cannot disagree. */
  const rendered = useMemo(
    () => tasks.map(task => ({
      task,
      title: notifText(task.i18n_key, task.vars, task.title),
      body: notifText(task.body_i18n_key, task.vars, task.description),
    })),
    [tasks, notifText],
  );

  const completingTitle = completing
    ? notifText(completing.i18n_key, completing.vars, completing.title)
    : '';

  return (
    <div
      dir={dir}
      className="tp-page"
      style={{
        minHeight: '100%',
        background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
        textAlign: dir === 'rtl' ? 'right' : 'left',
      }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: BRAND, letterSpacing: '0.6px' }}>
            {t('eyebrow')}
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.6px', color: '#0f1117', lineHeight: 1.15, margin: '0 0 6px' }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
          {t('subtitle')}
        </p>
      </div>

      {/* ── Tabs ── */}
      <div role="tablist" aria-label={t('tabs.aria')} style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(key => {
          const isActive = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(key)}
              style={{
                height: 38, padding: '0 18px', borderRadius: 10,
                border: isActive ? 'none' : '1.5px solid #e5e7eb',
                background: isActive ? BRAND : '#fff',
                color: isActive ? '#fff' : '#6b7280',
                fontSize: 13.5, fontWeight: isActive ? 700 : 600,
                fontFamily: 'inherit', cursor: 'pointer',
                transition: 'all 140ms ease',
                boxShadow: isActive ? '0 2px 8px rgba(75,166,234,0.30)' : 'none',
              }}
            >
              {t(`tabs.${key}`)}
            </button>
          );
        })}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          {t('loading')}
        </div>
      ) : rendered.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #ebebeb',
          padding: '56px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f1117', marginBottom: 8 }}>
            {t(tab === 'active' ? 'empty.activeTitle' : 'empty.doneTitle')}
          </div>
          <div style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.7 }}>
            {t(tab === 'active' ? 'empty.activeBody' : 'empty.doneBody')}
          </div>
        </div>
      ) : (
        <div className="tp-grid">
          {rendered.map(({ task, title, body }) => (
            <TaskCard
              key={task.id}
              task={task}
              title={title}
              body={body}
              busy={busyId === task.id}
              onClaim={handleClaim}
              onComplete={setCompleting}
            />
          ))}
        </div>
      )}

      {completing && (
        <CompleteDialog
          title={completingTitle}
          pending={busyId === completing.id}
          dir={dir}
          onCancel={() => setCompleting(null)}
          onConfirm={handleComplete}
        />
      )}

      {toast && <Toast {...toast} dir={dir} />}

      <style>{`
        .tp-page { padding: 24px 16px; }
        .tp-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
        @media (min-width: 640px) {
          .tp-page { padding: 32px 24px; }
          .tp-grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
        }
        @media (min-width: 1024px) {
          .tp-page { padding: 44px 40px; }
          .tp-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @keyframes tpFadeIn    { from { opacity: 0 } to { opacity: 1 } }
        @keyframes tpSlideUp   { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes tpSlideDown { from { transform: translate(-50%, -12px); opacity: 0 } to { transform: translate(-50%, 0); opacity: 1 } }
      `}</style>
    </div>
  );
};

export default TasksPage;
