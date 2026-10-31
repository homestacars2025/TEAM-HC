import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInbox } from '../lib/InboxContext';
import { useNotifText } from '../lib/notifications/renderI18n';
import type { MyNotification } from '../lib/types/tasks';
import { notificationBodyKey, useOpenNotification } from './NotificationRow';

/** A notification arriving live, in the corner. A new task gets an Open button. */

const SHOW_MS = 6000;
const MAX_VISIBLE = 3;

const NotificationToasts: React.FC = () => {
  const { t } = useTranslation('notifications');
  const { arrival } = useInbox();
  const notifText = useNotifText();
  const navigate = useNavigate();
  const openNotification = useOpenNotification();
  const [toasts, setToasts] = useState<MyNotification[]>([]);
  const timers = useRef(new Set<number>());

  const dismiss = useCallback((id: string) => setToasts(list => list.filter(n => n.id !== id)), []);

  useEffect(() => {
    if (!arrival) return;
    setToasts(list => [arrival, ...list.filter(n => n.id !== arrival.id)].slice(0, MAX_VISIBLE));
    const timer = window.setTimeout(() => dismiss(arrival.id), SHOW_MS);
    timers.current.add(timer);
  }, [arrival, dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(timer => window.clearTimeout(timer));
  }, []);

  if (toasts.length === 0) return null;

  return ReactDOM.createPortal(
    <div className="pointer-events-none fixed inset-x-3 top-[72px] z-[9500] flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:end-6 sm:top-auto sm:w-[340px]">
      {toasts.map(n => {
        const isNewTask = n.event_key === 'task.assigned';
        const title = notifText(n.i18n_key, n.vars, n.title);
        const body = notifText(notificationBodyKey(n), n.vars, n.body);
        const open = () => {
          dismiss(n.id);
          if (isNewTask && n.entity_id) navigate(`/dashboard/tasks?task=${n.entity_id}`);
          else openNotification(n);
        };
        return (
          <div key={n.id} role="status" className="hc-toast-in pointer-events-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-3.5 shadow-[0_12px_40px_rgba(15,17,23,0.14)]">
            <div className="flex items-start gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--accent)]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-snug text-[#0f1117]">{title}</div>
                {body && <div className="mt-0.5 text-[13px] text-gray-500">{body}</div>}
              </div>
              <button
                type="button"
                onClick={open}
                className="min-h-9 shrink-0 cursor-pointer rounded-lg bg-[var(--accent-strong)] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--accent-strong-hover)]"
              >
                {t('toast.open')}
              </button>
            </div>
          </div>
        );
      })}
    </div>,
    document.body,
  );
};

export default NotificationToasts;
