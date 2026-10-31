import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUiDir } from '../lib/notifications/renderI18n';
import { useInbox } from '../lib/InboxContext';
import { usePageAccess } from '../contexts/PageAccessContext';
import { getMyNotifications, markAllNotificationsRead } from '../lib/queries/tasks';
import type { MyNotification } from '../lib/types/tasks';
import NotificationRow, { useOpenNotification } from './NotificationRow';

export { resolveNotificationPath } from './NotificationRow';

/**
 * The notifications_v2 bell.
 *
 * The badge count comes from `InboxContext`, which polls once for the whole
 * chrome. The list itself is fetched only when the panel is opened — nobody
 * needs eight rows of text on a 30-second timer. Whether it is open lives there
 * too, because Home's Notifications card opens this same panel.
 */

const PANEL_LIMIT = 8;

const TasksBell: React.FC = () => {
  const [items, setItems] = useState<MyNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { unreadCount, refresh, notificationsOpen: open, setNotificationsOpen: setOpen, arrival } = useInbox();
  const { pages, canAccessPage } = usePageAccess();
  const { t } = useTranslation('notifications');
  const openNotification = useOpenNotification();
  // Follows the UI language rather than a baked-in value, so the panel flips
  // with `i18n.changeLanguage` and never sits RTL inside an English dashboard.
  const dir = useUiDir();

  const tasksRoute = canAccessPage('tasks') ? pages.find(p => p.key === 'tasks')?.route : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await getMyNotifications(PANEL_LIMIT);
    setItems(rows);
    setLoading(false);
  }, []);

  // Fetched on open, and again on each reopen: the panel should never show a
  // list that was accurate ten minutes ago.
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Delivered live while the panel is open: it goes straight to the top.
  useEffect(() => {
    if (!arrival) return;
    setItems(prev => [arrival, ...prev.filter(x => x.id !== arrival.id)].slice(0, PANEL_LIMIT));
  }, [arrival]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const handleOpen = useCallback((n: MyNotification) => {
    setOpen(false);
    // Optimistic: the badge should fall the moment it is clicked, and the
    // navigation must not wait on a write.
    setItems(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: true } : x)));
    openNotification(n);
  }, [openNotification, setOpen]);

  const handleMarkAll = useCallback(async () => {
    setItems(prev => prev.map(x => ({ ...x, is_read: true })));
    await markAllNotificationsRead();
    refresh();
  }, [refresh]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title={t('bell.tooltip')}
        aria-label={unreadCount > 0 ? t('bell.ariaUnread', { count: unreadCount }) : t('bell.aria')}
        aria-expanded={open}
        className={`relative flex size-11 cursor-pointer items-center justify-center rounded-xl border border-[var(--border-subtle)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-strong)] lg:size-10 ${open ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'bg-[var(--surface)] text-gray-500'}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          // Keyed on the arrival, so each new one replays the bounce.
          <span key={arrival?.id ?? 'badge'} className={arrival ? 'hc-badge-bounce' : undefined} style={{
            position: 'absolute', top: -5, insetInlineEnd: -5,
            minWidth: 18, height: 18, padding: '0 5px',
            borderRadius: 9, background: '#ef4444', color: '#fff',
            fontSize: 10.5, fontWeight: 800, lineHeight: '18px',
            textAlign: 'center', boxShadow: '0 0 0 2px #fff',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        // The panel declares its own direction from the UI language, so it reads
        // correctly whatever <html dir> the surrounding chrome is using.
        <div
          dir={dir}
          className="tb-panel"
          style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
            overflow: 'hidden',
            animation: 'tbFade 140ms ease',
            textAlign: dir === 'rtl' ? 'right' : 'left',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f1117' }}>{t('bell.heading')}</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: 'var(--accent-strong)',
                  fontFamily: 'inherit', padding: '4px 2px',
                }}
              >
                {t('bell.markAllRead')}
              </button>
            )}
          </div>

          <div className="tb-list" style={{ overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                {t('bell.loading')}
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: '32px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                {t('bell.empty')}
              </div>
            ) : (
              items.map(n => <NotificationRow key={n.id} notification={n} onOpen={handleOpen} />)
            )}
          </div>

          {tasksRoute && (
            <button
              onClick={() => { setOpen(false); navigate(tasksRoute); }}
              style={{
                display: 'block', width: '100%', minHeight: 44, padding: '11px 14px',
                border: 'none', background: 'var(--surface)',
                cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f3f7fb'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)'; }}
            >
              {t('bell.viewAll')}
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes tbFade { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
        .tb-panel { position: absolute; top: 52px; inset-inline-end: 0; z-index: 400; width: 356px; }
        .tb-list { max-height: 420px; }
        /* On a phone the bell sits mid-bar, so a panel hung from it would run off screen. */
        @media (max-width: 639.98px) {
          .tb-panel { position: fixed; top: 72px; inset-inline: 12px; width: auto; }
          .tb-list { max-height: calc(100dvh - 200px); }
        }
      `}</style>
    </div>
  );
};

export default TasksBell;
