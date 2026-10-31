import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGoals } from '../../hooks/useGoals';
import { istanbulDate } from '../../lib/istanbulTime';
import {
  GOAL_MONTHS_BACK, allGreen, firstOfMonth, formatGoalProgress, gapHints, performanceScore, scoreTone, shiftMonth,
  type GoalHint, type GoalMetric, type GoalStatus,
} from '../../lib/queries/goals';
import { useDateLocale } from '../../pages/AccountingPage';
import Confetti from '../Confetti';
import HomeArt from '../HomeArt';
import ActivityRings, { ringColor } from './ActivityRings';
import { useMetricText } from './GoalRing';
import GoalSheet, { useMissingLabel } from './GoalSheet';

const CONFETTI_KEY = 'hc_goal_confetti';

const SCORE_PILL: Record<ReturnType<typeof scoreTone>, string> = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
};

const VALUE_CLASS: Partial<Record<GoalStatus, string>> = { red: 'text-red-600', amber: 'text-amber-600' };

/** Once per session: seeing it on every visit would stop meaning anything. */
function claimConfetti(): boolean {
  try {
    if (sessionStorage.getItem(CONFETTI_KEY)) return false;
    sessionStorage.setItem(CONFETTI_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

const Celebration: React.FC<{ current: boolean; monthLabel: string }> = ({ current, monthLabel }) => {
  const { t } = useTranslation('goals');
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (current && claimConfetti()) setBurst(true);
  }, [current]);

  return (
    <div role="status" className="relative mt-4 flex items-center gap-3 overflow-hidden rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
      {burst && <Confetti pieces={26} />}
      <HomeArt name="trophy" className="h-16 w-auto shrink-0" />
      <span className="min-w-0">{current ? t('celebration.current') : t('celebration.past', { month: monthLabel })}</span>
    </div>
  );
};

const StatusMark: React.FC<{ status: GoalStatus }> = ({ status }) => {
  const { t } = useTranslation('goals');
  const label = t(`status.${status}`);

  if (status === 'green') {
    return (
      <span title={label} className="flex size-[22px] items-center justify-center rounded-full bg-green-100 text-green-700">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (status === 'amber' || status === 'red') {
    return (
      <span title={label} className={`flex size-[22px] items-center justify-center rounded-full text-[13px] font-bold ${status === 'red' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>!</span>
    );
  }
  if (status === 'progress') {
    return <span title={label} className="text-xs font-semibold text-[var(--accent-strong)]">{t('statusShort.progress')}</span>;
  }
  return <span title={label} className="text-sm text-gray-400">—</span>;
};

const LegendRow: React.FC<{ metric: GoalMetric; onOpen: (metric: GoalMetric) => void }> = ({ metric, onOpen }) => {
  const { t } = useTranslation('goals');
  const { label } = useMetricText()(metric);
  const progress = formatGoalProgress(metric);

  return (
    <button
      type="button"
      onClick={() => onOpen(metric)}
      aria-label={`${label}: ${progress}. ${t(`status.${metric.status}`)}`}
      className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-1.5 py-1.5 text-start transition-colors hover:bg-black/[0.03]"
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: ringColor(metric.metric_key) }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium leading-tight text-gray-600">{label}</span>
        {/* Inline, so the digits read left to right but the line still starts under the name. */}
        <span className={`block text-[15px] font-semibold leading-snug ${VALUE_CLASS[metric.status] ?? 'text-[#0f1117]'}`}>
          <bdi dir="ltr">{progress}</bdi>
        </span>
      </span>
      <span className="shrink-0"><StatusMark status={metric.status} /></span>
    </button>
  );
};

const HintLine: React.FC<{ hints: GoalHint[]; onOpen: (metricKey: string) => void }> = ({ hints, onOpen }) => {
  const { t } = useTranslation('goals');
  const missingLabel = useMissingLabel();

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-xl bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">
      {hints.map((hint, index) => (
        <React.Fragment key={hint.metricKey}>
          {index > 0 && <span aria-hidden className="text-red-300">·</span>}
          <button type="button" onClick={() => onOpen(hint.metricKey)} className="min-h-7 cursor-pointer text-start hover:underline">
            {t(`hint.${hint.metricKey}`, { count: hint.count, item: missingLabel(hint.item).toLocaleLowerCase('en'), defaultValue: missingLabel(hint.item) })}
          </button>
        </React.Fragment>
      ))}
    </p>
  );
};

const MonthButton: React.FC<{ label: string; disabled: boolean; onClick: () => void; path: string }> = ({ label, disabled, onClick, path }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-black/[0.04] disabled:cursor-default disabled:opacity-30 sm:size-8"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path className="hc-flip-path" d={path} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </button>
);

const Skeleton: React.FC = () => (
  <div aria-busy className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
    <div className="size-[210px] shrink-0 animate-pulse rounded-full bg-black/[0.05] sm:size-[240px]" />
    <div className="flex w-full flex-col gap-3">
      {[0, 1, 2, 3].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-black/[0.05]" />)}
    </div>
  </div>
);

interface GoalsPanelProps {
  onPresence: (shown: boolean) => void;
  /** The first answer is in, whatever it was. */
  onSettled: () => void;
}

const GoalsPanel: React.FC<GoalsPanelProps> = ({ onPresence, onSettled }) => {
  const { t } = useTranslation('goals');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();

  const currentMonth = useMemo(() => firstOfMonth(istanbulDate()), []);
  const oldestMonth = useMemo(() => shiftMonth(currentMonth, 1 - GOAL_MONTHS_BACK), [currentMonth]);
  const [month, setMonth] = useState(currentMonth);
  const { metrics, gaps, failed, retry } = useGoals(month);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const isCurrent = month === currentMonth;
  const monthLabel = new Date(`${month}T00:00:00`).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
  const hints = useMemo(() => (metrics ? gapHints(metrics, gaps ?? []) : []), [metrics, gaps]);
  const ordered = useMemo(() => (metrics ? [...metrics].sort((a, b) => a.sort_order - b.sort_order) : []), [metrics]);
  const openMetric = metrics?.find(m => m.metric_key === openKey) ?? null;
  const closeSheet = useCallback(() => setOpenKey(null), []);
  const openByMetric = useCallback((metric: GoalMetric) => setOpenKey(metric.metric_key), []);

  // Someone with no goals must not see a placeholder appear and vanish, so nothing
  // shows until there is a ring to show. Once there has been one, the card stays, so
  // a month with no goals keeps the switcher that leads back.
  const hasGoals = useRef(false);
  if (metrics && metrics.length > 0) hasGoals.current = true;
  const shown = hasGoals.current || failed;

  useEffect(() => { onPresence(shown); }, [shown, onPresence]);

  const settled = !!metrics || failed;
  useEffect(() => { if (settled) onSettled(); }, [settled, onSettled]);

  if (!shown) return null;

  const everythingGreen = !!metrics && allGreen(metrics);
  const score = metrics ? performanceScore(metrics) : null;

  return (
    <section className="flex flex-col rounded-[20px] border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:col-span-2 sm:p-5 xl:row-span-2">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[#0f1117]">{t(isCurrent ? 'title' : 'titlePast')}</h2>
        <div className="flex items-center gap-0.5">
          {score !== null && (
            <span aria-label={`${t('score')}: ${score}%`} className={`me-0.5 rounded-full px-2.5 text-[13px] font-bold leading-6 ${SCORE_PILL[scoreTone(score)]}`}>
              <bdi dir="ltr">{score}%</bdi>
            </span>
          )}
          <MonthButton label={t('previousMonth')} disabled={month <= oldestMonth} onClick={() => setMonth(m => shiftMonth(m, -1))} path="M15 18l-6-6 6-6" />
          <span className="min-w-[88px] text-center text-[13px] font-semibold text-gray-700">{monthLabel}</span>
          <MonthButton label={t('nextMonth')} disabled={isCurrent} onClick={() => setMonth(m => shiftMonth(m, 1))} path="M9 18l6-6-6-6" />
        </div>
      </header>

      {failed ? (
        <div className="py-8 text-center text-[13px] text-gray-500">
          <p role="alert">{t('failed')}</p>
          <button type="button" onClick={retry} className="mt-2 min-h-11 cursor-pointer font-semibold text-[var(--accent-strong)] lg:min-h-0">
            {tc('actions.tryAgain')}
          </button>
        </div>
      ) : !metrics ? (
        <Skeleton />
      ) : metrics.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-gray-500">{t('emptyMonth')}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-1 flex-col items-center gap-5 sm:flex-row sm:gap-4">
            {/* Keyed so that changing month sweeps the rings in again. */}
            <ActivityRings key={month} metrics={ordered} />
            <div className="flex w-full min-w-0 flex-col gap-0.5">
              {ordered.map(metric => <LegendRow key={metric.metric_key} metric={metric} onOpen={openByMetric} />)}
            </div>
          </div>

          {hints.length > 0 && <HintLine hints={hints} onOpen={setOpenKey} />}
          {everythingGreen && <Celebration current={isCurrent} monthLabel={monthLabel} />}
        </>
      )}

      {openMetric && <GoalSheet metric={openMetric} gaps={gaps} onClose={closeSheet} />}
    </section>
  );
};

export default GoalsPanel;
