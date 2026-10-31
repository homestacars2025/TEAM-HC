import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { holdBootSplash } from '../lib/bootSplash';
import { formatTRY } from '../lib/CurrencyContext';
import { useInbox } from '../lib/InboxContext';
import { BUSINESS_TIME_ZONE, dayPart, istanbulDate, istanbulHour } from '../lib/istanbulTime';
import { getMyNotifications, getMyTasks } from '../lib/queries/tasks';
import { countTasks, getTodaySchedule, type ScheduleItem } from '../lib/queries/schedule';
import { custodyBalance, custodyTotals, getMyCustodyMovements, type CustodyMovement } from '../lib/queries/custody';
import { getMyWalletEntries, walletBalance, walletTotals, type WalletEntry } from '../lib/queries/staffWallet';
import { useTimeFormat } from '../lib/relative-time';
import type { MyNotification, MyTask } from '../lib/types/tasks';
import GoalsPanel from '../components/goals/GoalsPanel';
import HomeArt, { type HomeArtName } from '../components/HomeArt';
import NotificationRow, { useOpenNotification } from '../components/NotificationRow';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { usePageAccess } from '../contexts/PageAccessContext';
import { useDateLocale } from './AccountingPage';

const TASK_LIMIT = 200;
const LIST_LIMIT = 5;

/**
 * Five cards don't divide into the four-column grid, and amounts need more room than
 * five narrow columns give. So three over two on a computer, and on a tablet the odd
 * one out takes the whole last row.
 */
const FIVE_CARDS = 'xl:grid-cols-6 xl:[&>*]:col-span-2 xl:[&>*:nth-last-child(-n+2)]:col-span-3 sm:max-xl:[&>*:last-child]:col-span-2';

/**
 * With performance in the grid it takes the first two columns and two rows, so the
 * cards fill a 2×2 beside it. Any card left over takes the rest of the width below.
 */
const LEFTOVER_CARD: Record<number, string> = {
  3: 'sm:max-xl:[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-2',
  5: 'sm:max-xl:[&>*:last-child]:col-span-2 xl:[&>*:last-child]:col-span-4',
};

const ArrowIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path className="hc-flip-path" d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const arrowClass =
  'flex size-11 cursor-pointer items-center justify-center rounded-full border border-[var(--border-subtle)] text-gray-500 no-underline transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-strong)] lg:size-9';

const Bone: React.FC<{ className: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-md bg-black/[0.05] ${className}`} />
);

// ─── Cards ────────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  color: string;
  art: HomeArtName;
  eager?: boolean;
  /** `null` while loading. */
  value: string | number | null;
  sub: React.ReactNode;
  valueClass?: string;
  action: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, color, art, eager, value, sub, valueClass, action }) => (
  <article className={`hc-stat hc-art-${art} rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface)]`}>
    <div className="flex items-center gap-2 [grid-column:1/-1]">
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <h2 className="text-[13px] font-medium leading-snug text-gray-600">{title}</h2>
    </div>

    <div className="hc-stat-value">
      {value === null ? <Bone className="h-[30px] w-20" /> : (
        <span className={`font-semibold text-[#0f1117] ${valueClass ?? ''}`} style={{ '--chars': String(value).length } as React.CSSProperties}>
          <bdi dir="ltr">{value}</bdi>
        </span>
      )}
    </div>

    <div className="flex min-w-0 flex-col [grid-column:1]">
      <div className="min-h-5 text-[13px] leading-snug text-gray-500 [overflow-wrap:anywhere]">{sub}</div>
      <div className="mt-auto flex pt-1.5">{action}</div>
    </div>

    {/* A column of its own: the render may leave the card, but it can't reach the words. */}
    <div aria-hidden className="hc-stat-art">
      <HomeArt name={art} eager={eager} />
    </div>
  </article>
);

const Section: React.FC<{ title: string; action?: React.ReactNode; art?: HomeArtName; children: React.ReactNode }> = ({ title, action, art, children }) => (
  <section className="overflow-hidden rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface)]">
    <header className={`relative flex items-center justify-between gap-3 overflow-hidden border-b border-[var(--border-subtle)] ps-5 ${art ? 'min-h-[88px] pe-[127px]' : 'min-h-14 pe-5'}`}>
      <h2 className="text-[15px] font-semibold text-[#0f1117]">{title}</h2>
      {action}
      {art && <span aria-hidden className="hc-section-art"><HomeArt name={art} /></span>}
    </header>
    {children}
  </section>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-5 py-10 text-center text-[13px] text-gray-500">{children}</div>
);

const RowsLoading: React.FC = () => (
  <div className="flex flex-col gap-3 p-5" aria-busy>
    {[0, 1, 2].map(i => <Bone key={i} className="h-5 w-full" />)}
  </div>
);

// ─── Lists ────────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<string, string> = {
  urgent: '#dc2626', high: '#ea580c', normal: 'var(--accent)', low: '#9ca3af',
};

const TaskList: React.FC<{ tasks: MyTask[] | null; failed: boolean }> = ({ tasks, failed }) => {
  const { t } = useTranslation('home');
  const { due } = useTimeFormat();

  if (failed) return <Empty>{t('tasks.failed')}</Empty>;
  if (!tasks) return <RowsLoading />;
  if (tasks.length === 0) return <Empty>{t('tasks.empty')}</Empty>;

  return (
    <ul>
      {tasks.slice(0, LIST_LIMIT).map(task => {
        const deadline = task.due_at ? due(task.due_at) : null;
        return (
          <li key={task.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
            <Link to="/dashboard/tasks" className="flex min-h-14 items-start gap-3 px-5 py-3 no-underline transition-colors hover:bg-black/[0.02]">
              <span className="mt-[7px] size-2 shrink-0 rounded-full" style={{ background: PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.normal }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[#0f1117]">{task.title}</span>
                {task.description && <span className="block truncate text-[13px] text-gray-500">{task.description}</span>}
              </span>
              {deadline && (
                <span className={`shrink-0 pt-px text-xs ${deadline.overdue ? 'font-medium text-red-600' : 'text-gray-400'}`}>{deadline.text}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

const KIND_STYLE: Record<ScheduleItem['kind'], string> = {
  delivery: 'bg-emerald-50 text-emerald-700',
  pickup: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
};

const ScheduleList: React.FC<{ items: ScheduleItem[] | null; failed: boolean; onRetry: () => void }> = ({ items, failed, onRetry }) => {
  const { t } = useTranslation('home');
  const { t: tc } = useTranslation('common');

  if (failed) {
    return (
      <div className="px-5 py-8 text-center text-[13px] text-gray-500">
        <p role="alert">{t('schedule.failed')}</p>
        <button type="button" onClick={onRetry} className="mt-2 min-h-11 cursor-pointer font-semibold text-[var(--accent-strong)] lg:min-h-0">
          {tc('actions.tryAgain')}
        </button>
      </div>
    );
  }
  if (!items) return <RowsLoading />;
  if (items.length === 0) return <Empty>{t('schedule.empty')}</Empty>;

  return (
    <ul>
      {items.map(item => (
        <li key={item.key} className="flex min-h-14 items-center gap-3 border-b border-[var(--border-subtle)] px-5 py-3 last:border-b-0">
          <span className="hc-num w-11 shrink-0 text-[13px] font-semibold text-gray-600">{item.time ?? '—'}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-[#0f1117]"><span className="hc-num">{item.plate ?? '—'}</span></span>
            <span className="block truncate text-[13px] text-gray-500">{item.customer ?? '—'}</span>
          </span>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_STYLE[item.kind]}`}>
            {t(`schedule.${item.kind}`)}
          </span>
        </li>
      ))}
    </ul>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const HomePage: React.FC = () => {
  const { t } = useTranslation('home');
  const { t: tn } = useTranslation('notifications');
  const dateLocale = useDateLocale();
  const { userId, profile } = useCurrentUser();
  const { canAccessPage } = usePageAccess();
  const { unreadCount, setNotificationsOpen, tasksVersion } = useInbox();
  const openNotification = useOpenNotification();

  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [tasksFailed, setTasksFailed] = useState(false);
  const [notifications, setNotifications] = useState<MyNotification[] | null>(null);
  const [wallet, setWallet] = useState<WalletEntry[] | null>(null);
  const [walletFailed, setWalletFailed] = useState(false);
  const [custody, setCustody] = useState<CustodyMovement[] | null>(null);
  const [custodyFailed, setCustodyFailed] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleItem[] | null>(null);
  const [scheduleFailed, setScheduleFailed] = useState(false);
  const [scheduleAttempt, setScheduleAttempt] = useState(0);
  const [showsPerformance, setShowsPerformance] = useState(false);
  const [goalsSettled, setGoalsSettled] = useState(false);

  const today = useMemo(() => istanbulDate(), []);
  const canOpenOperations = canAccessPage('operations');
  const canOpenWallet = canAccessPage('wallet');
  const canOpenCustody = canAccessPage('custody');
  // Customer names, so this follows the pages that already show them.
  const canSeeSchedule = canOpenOperations || canAccessPage('bookings');

  useEffect(() => {
    let cancelled = false;
    getMyTasks('active', TASK_LIMIT)
      .then(rows => { if (!cancelled) setTasks(rows); })
      .catch(() => { if (!cancelled) setTasksFailed(true); });
    return () => { cancelled = true; };
  }, [tasksVersion]);

  // Re-read when the badge moves, so the list and the number agree.
  useEffect(() => {
    let cancelled = false;
    getMyNotifications(LIST_LIMIT).then(rows => { if (!cancelled) setNotifications(rows); });
    return () => { cancelled = true; };
  }, [unreadCount]);

  useEffect(() => {
    if (!userId || !canOpenWallet) return;
    let cancelled = false;
    getMyWalletEntries(userId)
      .then(rows => { if (!cancelled) setWallet(rows); })
      .catch(() => { if (!cancelled) setWalletFailed(true); });
    return () => { cancelled = true; };
  }, [userId, canOpenWallet]);

  useEffect(() => {
    if (!userId || !canOpenCustody) return;
    let cancelled = false;
    getMyCustodyMovements(userId)
      .then(rows => { if (!cancelled) setCustody(rows); })
      .catch(() => { if (!cancelled) setCustodyFailed(true); });
    return () => { cancelled = true; };
  }, [userId, canOpenCustody]);

  useEffect(() => {
    if (!canSeeSchedule) return;
    let cancelled = false;
    setScheduleFailed(false);
    getTodaySchedule(today)
      .then(rows => { if (!cancelled) setSchedule(rows); })
      .catch(() => { if (!cancelled) setScheduleFailed(true); });
    return () => { cancelled = true; };
  }, [canSeeSchedule, today, scheduleAttempt]);

  const retrySchedule = useCallback(() => setScheduleAttempt(n => n + 1), []);
  const onGoalsSettled = useCallback(() => setGoalsSettled(true), []);

  // The layout depends on whether there is a performance card, so drawing before that
  // is known shows the wrong arrangement and then rearranges it. The splash stays until
  // this page can be drawn once, with its numbers in it.
  const releaseSplash = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    releaseSplash.current = holdBootSplash();
    return () => releaseSplash.current();
  }, []);

  const firstAnswersIn = goalsSettled
    && (tasks !== null || tasksFailed)
    && notifications !== null
    && (!canOpenWallet || wallet !== null || walletFailed)
    && (!canOpenCustody || custody !== null || custodyFailed)
    && (!canSeeSchedule || schedule !== null || scheduleFailed);

  useEffect(() => {
    if (firstAnswersIn) releaseSplash.current();
  }, [firstAnswersIn]);

  const counts = tasks ? countTasks(tasks) : null;
  const deliveries = schedule?.filter(item => item.kind === 'delivery').length ?? 0;
  const pickups = schedule?.filter(item => item.kind === 'pickup').length ?? 0;
  const balance = wallet ? walletBalance(wallet) : null;
  const heldInCustody = custody ? custodyBalance(custody) : null;
  const thisMonth = today.slice(0, 7);
  const cardCount = [canAccessPage('tasks'), canOpenOperations, canOpenWallet, canOpenCustody, true].filter(Boolean).length;

  const part = dayPart(istanbulHour());
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const dateLine = new Date().toLocaleDateString(dateLocale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: BUSINESS_TIME_ZONE,
  });

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:gap-8 lg:p-10">
      <header>
        <p className="text-[13px] text-gray-500">{dateLine}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#0f1117] sm:text-[28px]">
          {firstName ? t(`greeting.${part}`, { name: firstName }) : t(`greetingPlain.${part}`)}
        </h1>
        <p className="mt-1 min-h-5 text-sm text-gray-500">
          {counts && `${t('summary.tasks', { count: counts.today })} · ${t('summary.unread', { count: unreadCount })}`}
        </p>
      </header>

      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${showsPerformance ? `xl:grid-cols-4 ${LEFTOVER_CARD[cardCount] ?? ''}` : cardCount === 5 ? FIVE_CARDS : 'xl:grid-cols-4'}`}>
        <GoalsPanel onPresence={setShowsPerformance} onSettled={onGoalsSettled} />

        {canAccessPage('tasks') && (
          <StatCard
            title={t('cards.tasks.title')}
            color="var(--accent-strong)"
            art="tasks"
            eager
            value={tasksFailed ? '—' : counts?.today ?? null}
            sub={tasksFailed ? t('cards.unavailable') : counts && (counts.overdue > 0
              ? <span className="font-medium text-red-600">{t('cards.tasks.overdue', { count: counts.overdue })}</span>
              : t('cards.tasks.noOverdue'))}
            action={<Link to="/dashboard/tasks" aria-label={t('cards.open', { title: t('cards.tasks.title') })} className={arrowClass}><ArrowIcon /></Link>}
          />
        )}

        {canOpenCustody && (
          <StatCard
            title={t('cards.custody.title')}
            color="#0d9488"
            art="custody"
            eager
            valueClass={heldInCustody !== null && heldInCustody < 0 ? '!text-red-600' : undefined}
            value={custodyFailed ? '—' : heldInCustody === null ? null : `${heldInCustody < 0 ? '−' : ''}${formatTRY(heldInCustody)}`}
            sub={custodyFailed ? t('cards.unavailable') : custody && t('cards.custody.received', { amount: formatTRY(custodyTotals(custody, thisMonth).received) })}
            action={<Link to="/dashboard/custody" aria-label={t('cards.open', { title: t('cards.custody.title') })} className={arrowClass}><ArrowIcon /></Link>}
          />
        )}

        {canOpenOperations && (
          <StatCard
            title={t('cards.operations.title')}
            color="#059669"
            art="operations"
            value={scheduleFailed ? '—' : schedule ? deliveries + pickups : null}
            sub={scheduleFailed ? t('cards.unavailable') : schedule && t('cards.operations.sub', { deliveries, pickups })}
            action={<Link to="/dashboard/operations" aria-label={t('cards.open', { title: t('cards.operations.title') })} className={arrowClass}><ArrowIcon /></Link>}
          />
        )}

        {canOpenWallet && (
          <StatCard
            title={t('cards.wallet.title')}
            color="#d97706"
            art="wallet"
            valueClass={balance !== null && balance < 0 ? '!text-red-600' : undefined}
            value={walletFailed ? '—' : balance === null ? null : `${balance < 0 ? '−' : ''}${formatTRY(balance)}`}
            sub={walletFailed ? t('cards.unavailable') : wallet && t('cards.wallet.earned', { amount: formatTRY(walletTotals(wallet, thisMonth).earned) })}
            action={<Link to="/dashboard/wallet" aria-label={t('cards.open', { title: t('cards.wallet.title') })} className={arrowClass}><ArrowIcon /></Link>}
          />
        )}

        <StatCard
          title={t('cards.notifications.title')}
          color="#7c3aed"
          art="notifications"
          value={unreadCount}
          sub={unreadCount > 0 ? t('cards.notifications.unread') : t('cards.notifications.allRead')}
          action={(
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label={t('cards.open', { title: t('cards.notifications.title') })}
              className={arrowClass}
            >
              <ArrowIcon />
            </button>
          )}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Section
            title={t('sections.tasks')}
            action={<Link to="/dashboard/tasks" className="flex min-h-11 items-center text-[13px] font-semibold text-[var(--accent-strong)] no-underline">{t('sections.viewAll')}</Link>}
          >
            <TaskList tasks={tasks} failed={tasksFailed} />
          </Section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {canSeeSchedule && (
            <Section title={t('sections.schedule')} art="schedule">
              <ScheduleList items={schedule} failed={scheduleFailed} onRetry={retrySchedule} />
            </Section>
          )}
          <Section title={t('sections.notifications')}>
            {!notifications ? <RowsLoading /> : notifications.length === 0 ? <Empty>{tn('bell.empty')}</Empty> : (
              <div className="[&>button:last-child]:!border-b-0">
                {notifications.map(n => <NotificationRow key={n.id} notification={n} onOpen={openNotification} />)}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
