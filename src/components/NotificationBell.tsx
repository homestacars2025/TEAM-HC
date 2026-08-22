import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSectionAccess } from '../lib/SectionAccessContext';

/**
 * Notification bell for the dashboard top bar.
 *
 * `notifications` is published to `supabase_realtime`, so new rows arrive over a
 * subscription rather than a poll. A single fetch on mount seeds the list; the
 * window-focus refresh is a cheap safety net for a dropped socket.
 */

const PAGE_SIZE = 30;

export interface NotificationRow {
  id: number;
  created_at: string;
  recipient_profile_id: string | null;
  section_key: string | null;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  is_read: boolean;
}

const NOTIF_SELECT =
  'id, created_at, recipient_profile_id, section_key, type, title, body, data, is_read';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** jsonb `data` is untyped at the DB level, so read the id defensively. */
function entryIdOf(n: NotificationRow): number | null {
  const raw = n.data?.['kabis_entry_id'];
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return null;
}

const NotificationBell: React.FC = () => {
  const [items, setItems]     = useState<NotificationRow[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(true);
  const [uid, setUid]         = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { canAccess, loading: accessLoading } = useSectionAccess();

  const canKabis = canAccess('kabis');

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setUid(data.user?.id ?? null);
    });
    return () => { active = false; };
  }, []);

  /** Section notifications reach only those granted that section; personal ones always. */
  const isEligible = useCallback((n: Pick<NotificationRow, 'recipient_profile_id' | 'section_key'>): boolean => {
    if (uid && n.recipient_profile_id === uid) return true;
    if (n.section_key === 'kabis' && canKabis) return true;
    return false;
  }, [uid, canKabis]);

  const fetchNotifications = useCallback(async () => {
    if (!uid) return;
    const filters = [`recipient_profile_id.eq.${uid}`];
    if (canKabis) filters.push('section_key.eq.kabis');

    const { data, error } = await supabase
      .from('notifications')
      .select(NOTIF_SELECT)
      .or(filters.join(','))
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    setLoading(false);
    if (error) return;
    setItems((data ?? []) as unknown as NotificationRow[]);
  }, [uid, canKabis]);

  // Seed once, then let realtime carry it.
  useEffect(() => {
    if (!uid || accessLoading) return;
    fetchNotifications();
    const onFocus = () => fetchNotifications();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [uid, accessLoading, fetchNotifications]);

  // Realtime INSERTs. Server-side filtering cannot express the section-or-personal
  // rule, so every row arrives and eligibility is applied here.
  useEffect(() => {
    if (!uid || accessLoading) return;

    const channel = supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        payload => {
          const row = payload.new as unknown as NotificationRow;
          if (!row || typeof row.id !== 'number') return;
          if (!isEligible(row)) return;
          setItems(prev => (
            // The seed fetch and the socket can race on the same row.
            prev.some(n => n.id === row.id)
              ? prev
              : [row, ...prev].slice(0, PAGE_SIZE)
          ));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [uid, accessLoading, isEligible]);

  // Close on outside click / Escape.
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

  const unread = useMemo(() => items.filter(n => !n.is_read).length, [items]);

  const markRead = useCallback(async (id: number) => {
    // Optimistic: the badge should drop the moment it is clicked.
    setItems(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
  }, []);

  const markAllRead = useCallback(async () => {
    const ids = items.filter(n => !n.is_read).map(n => n.id);
    if (ids.length === 0) return;
    setItems(prev => prev.map(n => ({ ...n, is_read: true })));
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .in('id', ids);
  }, [items]);

  const handleClick = useCallback((n: NotificationRow) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.type === 'kabis_pending' && canKabis) {
      const entryId = entryIdOf(n);
      navigate(entryId ? `/dashboard/kabis?entry=${entryId}` : '/dashboard/kabis');
    }
  }, [markRead, navigate, canKabis]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
        style={{
          width: 36, height: 36, borderRadius: 10,
          border: '1.5px solid #ebebeb', background: open ? 'rgba(75,166,234,0.08)' : '#fff',
          color: open ? '#4ba6ea' : '#6b7280',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', position: 'relative', padding: 0,
          transition: 'all 140ms ease',
        }}
        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ebebeb'; if (!open) b.style.color = '#6b7280'; }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 18, height: 18, padding: '0 5px',
            borderRadius: 9, background: '#ef4444', color: '#fff',
            fontSize: 10.5, fontWeight: 800, lineHeight: '18px',
            textAlign: 'center', boxShadow: '0 0 0 2px #fff',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          // Clears the bottom border of the top bar the button sits in.
          top: 48,
          right: 0,
          zIndex: 400,
          width: 320, maxWidth: 'calc(100vw - 32px)',
          background: '#fff', border: '1px solid #ebebeb', borderRadius: 14,
          boxShadow: '0 12px 40px rgba(0,0,0,0.14)',
          overflow: 'hidden',
          animation: 'nbFade 140ms ease',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, padding: '12px 14px', borderBottom: '1px solid #f3f4f6',
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f1117' }}>Notifications</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  border: 'none', background: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, color: '#4ba6ea',
                  fontFamily: 'inherit', padding: '4px 2px',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: '28px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: '32px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No notifications
              </div>
            ) : (
              items.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '11px 14px', border: 'none',
                    borderBottom: '1px solid #f6f7f8',
                    background: n.is_read ? '#fff' : 'rgba(75,166,234,0.05)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f9fafb'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = n.is_read ? '#fff' : 'rgba(75,166,234,0.05)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {!n.is_read && (
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', background: '#4ba6ea',
                        marginTop: 6, flexShrink: 0,
                      }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: n.is_read ? 600 : 800,
                        color: '#0f1117', lineHeight: 1.5, marginBottom: 2,
                      }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, wordBreak: 'break-word' }}>
                          {n.body}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                        {relativeTime(n.created_at)}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes nbFade { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  );
};

export default NotificationBell;
