import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGoals } from '../../hooks/useGoals';
import { istanbulDate } from '../../lib/istanbulTime';
import {
  GOAL_MONTHS_BACK, allGreen, firstOfMonth, redHints, shiftMonth,
  type GoalHint, type GoalMetric,
} from '../../lib/queries/goals';
import { useDateLocale } from '../../pages/AccountingPage';
import Confetti from '../Confetti';
import GoalRing, { useMetricText } from './GoalRing';
import GoalSheet, { useMissingLabel } from './GoalSheet';

const CONFETTI_KEY = 'hc_goal_confetti';

/** Once per session: seeing it on every visit to Tasks would stop meaning anything. */
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
    <div role="status" className="relative mt-4 overflow-hidden rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
      {burst && <Confetti pieces={26} />}
      {current ? t('celebration.current') : t('celebration.past', { month: monthLabel })}
    </div>
  );
};

const RedHint: React.FC<{ hint: GoalHint; metric: GoalMetric; onOpen: (metric: GoalMetric) => void }> = ({ hint, metric, onOpen }) => {
  const { t } = useTranslation('goals');
  const missingLabel = useMissingLabel();
  const { label } = useMetricText()(metric);

  const message = hint.item
    ? t(`hint.${hint.metricKey}`, {
      count: hint.count,
      item: missingLabel(hint.item).toLocaleLowerCase('en'),
      defaultValue: t('hint.generic', { label }),
    })
    : t('hint.generic', { label });

  return (
    <button
      type="button"
      onClick={() => onOpen(metric)}
      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-start text-sm font-medium text-red-700 transition-colors hover:border-red-200"
    >
      <span className="min-w-0">{message}</span>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden="true">
        <path className="hc-flip-path" d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
};

const MonthButton: React.FC<{ label: string; disabled: boolean; onClick: () => void; path: string }> = ({ label, disabled, onClick, path }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-black/[0.04] disabled:cursor-default disabled:opacity-30 sm:size-9"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path className="hc-flip-path" d={path} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </button>
);

const GoalsPanel: React.FC = () => {
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
  const hints = useMemo(() => (metrics ? redHints(metrics, gaps ?? []) : []), [metrics, gaps]);
  const openMetric = metrics?.find(m => m.metric_key === openKey) ?? null;
  const closeSheet = useCallback(() => setOpenKey(null), []);

  // This sits right under the greeting, so someone with no goals must not see a
  // placeholder appear and vanish: nothing shows until there is a ring to show.
  // Once there has been one, the section stays, so a month with no goals keeps the
  // switcher that leads back.
  const hasGoals = useRef(false);
  if (metrics && metrics.length > 0) hasGoals.current = true;
  if (!hasGoals.current && !failed) return null;

  return (
    <section className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[#0f1117]">{t(isCurrent ? 'title' : 'titlePast')}</h2>
        <div className="flex items-center gap-1">
          <MonthButton label={t('previousMonth')} disabled={month <= oldestMonth} onClick={() => setMonth(m => shiftMonth(m, -1))} path="M15 18l-6-6 6-6" />
          <span className="min-w-[116px] text-center text-[13px] font-semibold text-gray-700">{monthLabel}</span>
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
        <div aria-busy className="mt-4 grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-around">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex flex-col items-center gap-2 p-2">
              <div className="size-[104px] animate-pulse rounded-full bg-black/[0.05]" />
              <div className="h-4 w-20 animate-pulse rounded bg-black/[0.05]" />
            </div>
          ))}
        </div>
      ) : metrics.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-gray-500">{t('emptyMonth')}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-2 gap-y-3 sm:flex sm:flex-wrap sm:justify-around">
            {metrics.map(metric => (
              <GoalRing key={metric.metric_key} metric={metric} size={104} onOpen={m => setOpenKey(m.metric_key)} />
            ))}
          </div>

          {allGreen(metrics) && <Celebration current={isCurrent} monthLabel={monthLabel} />}

          {hints.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {hints.map(hint => {
                const metric = metrics.find(m => m.metric_key === hint.metricKey);
                return metric && <RedHint key={hint.metricKey} hint={hint} metric={metric} onOpen={m => setOpenKey(m.metric_key)} />;
              })}
            </div>
          )}
        </>
      )}

      {openMetric && <GoalSheet metric={openMetric} gaps={gaps} onClose={closeSheet} />}
    </section>
  );
};

export default GoalsPanel;
