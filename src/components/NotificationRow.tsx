import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNotifText, useUiDir } from '../lib/notifications/renderI18n';
import { useTimeFormat } from '../lib/relative-time';
import { useInbox } from '../lib/InboxContext';
import { usePageAccess } from '../contexts/PageAccessContext';
import { markNotificationRead } from '../lib/queries/tasks';
import type { MyNotification, NotificationCategory } from '../lib/types/tasks';

/** One notification, as shown in the bell and on Home. */

const BRAND = 'var(--accent-strong)';

// ─── Category presentation ────────────────────────────────────────────────────

interface CategoryStyle {
  tint: string;
  color: string;
  icon: React.ReactNode;
}

const CATEGORY: Record<NotificationCategory, CategoryStyle> = {
  task: {
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
    tint: 'var(--accent-soft)',
    color: BRAND,
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  manual: {
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
 * this dashboard, and TEAM has no per-car page. Anything the reader cannot open —
 * a route TEAM lacks, or a page they have no access to — lands on `fallback`
 * rather than on a dead route or a "no access" screen.
 *
 * `canOpen` comes from `app_pages`, so a page added there works here with no
 * change to this file.
 */
export function resolveNotificationPath(
  link: string | null | undefined,
  canOpen: (path: string) => boolean,
  fallback: string,
): string {
  if (!link) return fallback;
  const path = link.startsWith('/dashboard') ? link : `/dashboard${link.startsWith('/') ? '' : '/'}${link}`;
  return canOpen(path) ? path : fallback;
}

// ─── Opening one ──────────────────────────────────────────────────────────────

export function useOpenNotification(): (n: MyNotification) => Promise<void> {
  const navigate = useNavigate();
  const { refresh } = useInbox();
  const { pages, canAccessPage, canAccessRoute, firstAllowedRoute } = usePageAccess();
  const tasksRoute = canAccessPage('tasks') ? pages.find(p => p.key === 'tasks')?.route : undefined;
  const fallbackRoute = tasksRoute ?? firstAllowedRoute ?? '/dashboard';

  return useCallback(async (n: MyNotification) => {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      refresh();
    }
    navigate(resolveNotificationPath(n.link, canAccessRoute, fallbackRoute));
  }, [navigate, refresh, canAccessRoute, fallbackRoute]);
}

// ─── Row ──────────────────────────────────────────────────────────────────────

const UNREAD_BACKGROUND = 'var(--accent-soft)';

const NotificationRow: React.FC<{ notification: MyNotification; onOpen: (n: MyNotification) => void }> = ({
  notification: n, onOpen,
}) => {
  const { t } = useTranslation('notifications');
  const notifText = useNotifText();
  const { relative } = useTimeFormat();
  const dir = useUiDir();
  const style = styleFor(n.category);
  // Never `n.title` / `n.body` directly — the stored wording is a fallback for a
  // key this build has no translation for.
  const title = notifText(n.i18n_key, n.vars, n.title);
  const body = notifText(n.body_i18n_key, n.vars, n.body);
  const background = n.is_read ? 'var(--surface)' : UNREAD_BACKGROUND;

  return (
    <button
      onClick={() => onOpen(n)}
      style={{
        display: 'block', width: '100%',
        textAlign: dir === 'rtl' ? 'right' : 'left',
        padding: '11px 14px', border: 'none',
        borderBottom: '1px solid var(--border-subtle)',
        background,
        cursor: 'pointer', fontFamily: 'inherit',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; }}
      onMouseLeave={e => { e.currentTarget.style.background = background; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <span
          aria-hidden
          title={t(`category.${n.category}`)}
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
              {title}
            </div>
            {!n.is_read && (
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
                marginTop: 6, flexShrink: 0,
              }} />
            )}
          </div>
          {body && (
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.65, wordBreak: 'break-word', marginTop: 1 }}>
              {body}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
            {relative(n.created_at)}
          </div>
        </div>
      </div>
    </button>
  );
};

export default NotificationRow;
