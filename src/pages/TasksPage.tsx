import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { dueLabelAr, relativeTimeAr } from '../lib/arabic-time';
import { useInbox } from '../lib/InboxContext';
import { claimTask, completeTask, getMyTasks } from '../lib/queries/tasks';
import type { MyTask, TaskFilter, TaskPriority } from '../lib/types/tasks';

/**
 * "مهامي" — the tasks assigned to the signed-in user's role.
 *
 * Arabic and RTL: the task rows themselves are written in Arabic by the server
 * ("ارفع ملف التأمين — 34HZV894"), so an English shell around them would read
 * backwards. The page declares `dir="rtl"` on its own root rather than touching
 * `<html dir>`, which the surrounding dashboard chrome still relies on being LTR.
 *
 * Every write goes through an RPC — RLS blocks direct table access — and each
 * one re-reads the list afterwards, because whether a task is still claimable is
 * a fact only the server holds.
 */

const BRAND = '#4ba6ea';

// ─── Priority ─────────────────────────────────────────────────────────────────

interface PriorityStyle { label: string; color: string; bg: string; }

const PRIORITY: Record<TaskPriority, PriorityStyle> = {
  urgent: { label: 'عاجلة', color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  high: { label: 'مهمة', color: '#ea580c', bg: 'rgba(234,88,12,0.10)' },
  normal: { label: 'عادية', color: '#0284c7', bg: 'rgba(2,132,199,0.09)' },
  low: { label: 'منخفضة', color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
};

const priorityStyle = (p: TaskPriority): PriorityStyle => PRIORITY[p] ?? PRIORITY.normal;

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;

const TOAST_COLORS = {
  success: '#059669',
  error: '#dc2626',
  info: '#0f1117',
} as const;

const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info' }> = ({ message, type }) =>
  ReactDOM.createPortal(
    <div
      dir="rtl"
      role="status"
      style={{
        position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10000, background: TOAST_COLORS[type], color: '#fff',
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
  task: MyTask;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (notes: string) => void;
}> = ({ task, pending, onCancel, onConfirm }) => {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, pending]);

  return ReactDOM.createPortal(
    <div
      dir="rtl"
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
        animation: 'tpSlideUp 200ms ease', textAlign: 'right',
      }}>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: '#0f1117', marginBottom: 6, letterSpacing: '-0.2px' }}>
          إنجاز المهمة
        </div>
        <div style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.65, marginBottom: 18 }}>
          {task.title}
        </div>

        <label htmlFor="tp-notes" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
          ملاحظة <span style={{ fontWeight: 400, color: '#9ca3af' }}>(اختيارية)</span>
        </label>
        <textarea
          id="tp-notes"
          autoFocus
          rows={3}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="مثلاً: رفعت الملف وتم التحقق منه"
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
            {pending ? 'جارٍ الحفظ…' : 'تأكيد الإنجاز'}
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
            إلغاء
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
  busy: boolean;
  onClaim: (t: MyTask) => void;
  onComplete: (t: MyTask) => void;
}> = ({ task, busy, onClaim, onComplete }) => {
  const p = priorityStyle(task.priority);
  const due = task.due_at ? dueLabelAr(task.due_at) : null;
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
          {task.title}
        </h3>
        <span style={{
          flexShrink: 0, padding: '3px 10px', borderRadius: 20,
          fontSize: 11.5, fontWeight: 700, color: p.color, background: p.bg,
        }}>
          {p.label}
        </span>
      </div>

      {task.description && (
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280', lineHeight: 1.7 }}>
          {task.description}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: '#9ca3af' }}>
        <span>{relativeTimeAr(task.created_at)}</span>
        {due && (
          <span style={{ color: due.overdue ? '#dc2626' : '#9ca3af', fontWeight: due.overdue ? 700 : 400 }}>
            {due.text}
          </span>
        )}
        {task.status === 'claimed' && task.claimed_by_name && (
          <span style={{ color: '#0284c7', fontWeight: 600 }}>
            مستلمة بواسطة {task.claimed_by_name}
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
              أستلمها
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
            تمّت
          </button>
        </div>
      )}
    </article>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { key: TaskFilter; label: string }[] = [
  { key: 'active', label: 'نشطة' },
  { key: 'done', label: 'منجزة' },
];

const TasksPage: React.FC = () => {
  const [tab, setTab] = useState<TaskFilter>('active');
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [completing, setCompleting] = useState<MyTask | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const { refresh } = useInbox();

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
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
      showToast(result.error ?? 'تعذّر استلام المهمة', result.raced ? 'info' : 'error');
      await reload(tab);
      refresh();
      return;
    }
    showToast('استلمتها ✓', 'success');
    await reload(tab);
    refresh();
  }, [tab, reload, refresh, showToast]);

  const handleComplete = useCallback(async (notes: string) => {
    const task = completing;
    if (!task) return;

    setBusyId(task.id);
    const result = await completeTask(task.id, notes);
    setBusyId(null);
    setCompleting(null);

    if (!result.ok) {
      showToast(result.error ?? 'تعذّر إنجاز المهمة', result.raced ? 'info' : 'error');
      await reload(tab);
      refresh();
      return;
    }
    showToast('تمّت المهمة 🎉', 'success');
    await reload(tab);
    refresh();
  }, [completing, tab, reload, refresh, showToast]);

  const emptyCopy = useMemo(
    () => (tab === 'active'
      ? { title: 'ما عندك مهام — عاش! 🎉', body: 'كل شي مخلّص. رح تشوف المهام الجديدة هون أول ما تنضاف.' }
      : { title: 'ما في مهام منجزة بعد', body: 'أول ما تخلّص مهمة رح تنتقل لهون.' }),
    [tab],
  );

  return (
    <div
      dir="rtl"
      className="tp-page"
      style={{ minHeight: '100%', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', textAlign: 'right' }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: BRAND }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: BRAND, letterSpacing: '0.6px' }}>
            الفريق
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.6px', color: '#0f1117', lineHeight: 1.15, margin: '0 0 6px' }}>
          مهامي
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>
          المهام الموجّهة لك — استلمها أو علّمها كمنجزة
        </p>
      </div>

      {/* ── Tabs ── */}
      <div role="tablist" aria-label="حالة المهام" style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.key)}
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
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Body ── */}
      {loading ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          جارٍ التحميل…
        </div>
      ) : tasks.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 16, border: '1px solid #ebebeb',
          padding: '56px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f1117', marginBottom: 8 }}>
            {emptyCopy.title}
          </div>
          <div style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.7 }}>
            {emptyCopy.body}
          </div>
        </div>
      ) : (
        <div className="tp-grid">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              busy={busyId === task.id}
              onClaim={handleClaim}
              onComplete={setCompleting}
            />
          ))}
        </div>
      )}

      {completing && (
        <CompleteDialog
          task={completing}
          pending={busyId === completing.id}
          onCancel={() => setCompleting(null)}
          onConfirm={handleComplete}
        />
      )}

      {toast && <Toast {...toast} />}

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
