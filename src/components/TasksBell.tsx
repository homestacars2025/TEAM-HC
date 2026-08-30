import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { relativeTimeAr } from '../lib/arabic-time';
import { useInbox } from '../lib/InboxContext';
import {
  getMyNotifications, markAllNotificationsRead, markNotificationRead,
} from '../lib/queries/tasks';
import type { MyNotification, NotificationCategory } from '../lib/types/tasks';

/**
 * The notifications_v2 bell.
 *
 * Deliberately a second bell beside the legacy kabis one rather than a
 * replacement: the two systems have separate tables, separate id types and
 * separate audiences, and merging them is its own piece of work. This one is
 * distinguishable by its list icon and its Arabic tooltip.
 *
 * The badge count comes from `InboxContext`, which polls once for the whole
 * chrome. The list itself is fetched only when the panel is opened — nobody
 * needs ten rows of text on a 30-second timer.
 */

const PANEL_LIMIT = 10;

const BRAND = '#4ba6ea';

// ─── Category presentation ────────────────────────────────────────────────────

interface CategoryStyle {
  label: string;
  tint: string;
  color: string;
  icon: React.ReactNode;
}

const CATEGORY: Record<NotificationCategory, CategoryStyle> = {
  task: {
    label: 'مهمة',
    tint: 'rgba(16,185,129,0.10)',
    color: '#059669',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="4" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  reminder: {
    label: 'تذكير',
    tint: 'rgba(245,158,11,0.12)',
    color: '#d97706',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.7" />
        <path d="M12 9v4l2.5 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 3L2.5 5.5M19 3l2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  event: {
    label: 'حدث',
    tint: 'rgba(75,166,234,0.12)',
    color: BRAND,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  manual: {
    label: 'رسالة',
    tint: 'rgba(139,92,246,0.11)',
    color: '#7c3aed',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3.5 7.5l7.3 5.2a2 2 0 002.4 0l7.3-5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
};

/** An unrecognised category from a newer server still renders as something. */
const styleFor = (c: NotificationCategory): CategoryStyle => CATEGORY[c] ?? CATEGORY.event;

// ─── Link resolution ──────────────────────────────────────────────────────────

/**
 * Notification links are written for the whole product ("/cars/24"), not for
 * this dashboard, and TEAM has no per-car page. Rather than navigating to a
 * route that would bounce to the login redirect, anything unrecognised lands on
 * the tasks page — where the matching task is waiting anyway.
 *
 * Adding the route later is enough to make its links work: no change here.
 */
const TEAM_PATHS = new Set([
  '/dashboard/bookings', '/dashboard/calendar', '/dashboard/cars',
  '/dashboard/cars/tracking', '/dashboard/car-issues', '/dashboard/model-groups',
  '/dashboard/operations', '/dashboard/kgm', '/dashboard/fines',
  '/dashboard/customer-wallets', '/dashboard/accounting', '/dashboard/kabis',
  '/dashboard/tasks',
]);

export function resolveNotificationPath(link: string | null | undefined): string {
  if (!link) return '/dashboard/tasks';
  const path = link.startsWith('/dashboard') ? link : `/dashboard${link.startsWith('/') ? '' : '/'}${link}`;
  return TEAM_PATHS.has(path) ? path : '/dashboard/tasks';
}

// ─── Component ────────────────────────────────────────────────────────────────

const TasksBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MyNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { unreadCount, refresh } = useInbox();

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
  }, [open]);

  const handleClick = useCallback(async (n: MyNotification) => {
    setOpen(false);
    if (!n.is_read) {
      // Optimistic: the badge should fall the moment it is clicked, and the
      // navigation must not wait on a write.
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: true } : x)));
      await markNotificationRead(n.id);
      refresh();
    }
    navigate(resolveNotificationPath(n.link));
  }, [navigate, refresh]);

  const handleMarkAll = useCallback(async () => {
    setItems(prev => prev.map(x => ({ ...x, is_read: true })));
    await markAllNotificationsRead();
    refresh();
  }, [refresh]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="المهام والتنبيهات"
        aria-label={unreadCount > 0 ? `التنبيهات (${unreadCount} غير مقروء)` : 'التنبيهات'}
        aria-expanded={open}
        style={{
          width: 36, height: 36, borderRadius: 10,
          border: '1.5px solid #ebebeb',
          background: open ? 'rgba(75,166,234,0.08)' : '#fff',
          color: open ? BRAND : '#6b7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative', padding: 0,
          transition: 'all 140ms ease',
        }}
        onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = BRAND; b.style.color = BRAND; }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = '#ebebeb'; if (!open) b.style.color = '#6b7280'; }}
      >
        {/* A checklist, not a second bell — the two icons must not be confusable. */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9.2 8.6l1.8 1.8 3.6-3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
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
        // The dashboard chrome is LTR; this panel declares its own direction so
        // it reads correctly without touching <html dir>.
        <div
          dir="rtl"
          style={{
            position: 'absolute',
            top: 48, right: 0, zIndex: 400,
            width: 336, maxWidth: 'calc(100vw - 32px)',
            background: '#fff', border: '1px solid #ebebeb', borderRadius: 14,
            boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
            overflow: 'hidden',
            animation: 'tbFade 140ms ease',
            textAlign: 'right',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, padding: '12px 14px', borderBottom: '1px solid #f3f4f6',
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f1117' }}>التنبيهات</span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: BRAND,
                  fontFamily: 'inherit', padding: '4px 2px',
                }}
              >
                تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                جارٍ التحميل…
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: '32px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                ما في تنبيهات
              </div>
            ) : (
              items.map(n => {
                const style = styleFor(n.category);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'right',
                      padding: '11px 14px', border: 'none',
                      borderBottom: '1px solid #f6f7f8',
                      background: n.is_read ? '#fff' : 'rgba(75,166,234,0.05)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = n.is_read ? '#fff' : 'rgba(75,166,234,0.05)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                      <span
                        aria-hidden
                        title={style.label}
                        style={{
                          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                          background: style.tint, color: style.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginTop: 1,
                        }}
                      >
                        {style.icon}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{
                            flex: 1, minWidth: 0,
                            fontSize: 13, fontWeight: n.is_read ? 600 : 800,
                            color: '#0f1117', lineHeight: 1.55,
                          }}>
                            {n.title}
                          </div>
                          {!n.is_read && (
                            <span style={{
                              width: 7, height: 7, borderRadius: '50%', background: BRAND,
                              marginTop: 6, flexShrink: 0,
                            }} />
                          )}
                        </div>
                        {n.body && (
                          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.65, wordBreak: 'break-word', marginTop: 1 }}>
                            {n.body}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                          {relativeTimeAr(n.created_at)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <button
            onClick={() => { setOpen(false); navigate('/dashboard/tasks'); }}
            style={{
              display: 'block', width: '100%', padding: '11px 14px',
              border: 'none', borderTop: '1px solid #f3f4f6', background: '#fbfcfd',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 700, color: BRAND,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f3f7fb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fbfcfd'; }}
          >
            عرض الكل
          </button>
        </div>
      )}

      <style>{`@keyframes tbFade { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  );
};

export default TasksBell;
