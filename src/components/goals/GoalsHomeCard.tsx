import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGoals } from '../../hooks/useGoals';
import { istanbulDate } from '../../lib/istanbulTime';
import { firstOfMonth } from '../../lib/queries/goals';
import GoalRing from './GoalRing';

/** Compact rings for Home. Nothing at all for someone with no goals this month. */
const GoalsHomeCard: React.FC = () => {
  const { t } = useTranslation('goals');
  const { t: tc } = useTranslation('common');
  const month = useMemo(() => firstOfMonth(istanbulDate()), []);
  const { metrics, failed, retry } = useGoals(month);

  if (!failed && (!metrics || metrics.length === 0)) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5">
        <h2 className="text-[15px] font-semibold text-[#0f1117]">{t('homeTitle')}</h2>
        <Link to="/dashboard/tasks" className="flex min-h-11 items-center text-[13px] font-semibold text-[var(--accent-strong)] no-underline">
          {t('viewDetails')}
        </Link>
      </header>
      {failed ? (
        <div className="px-5 py-6 text-center text-[13px] text-gray-500">
          <p role="alert">{t('failed')}</p>
          <button type="button" onClick={retry} className="mt-2 min-h-11 cursor-pointer font-semibold text-[var(--accent-strong)] lg:min-h-0">
            {tc('actions.tryAgain')}
          </button>
        </div>
      ) : (
        <Link to="/dashboard/tasks" className="grid grid-cols-2 gap-2 p-3 no-underline sm:flex sm:flex-wrap sm:justify-around">
          {metrics!.map(metric => <GoalRing key={metric.metric_key} metric={metric} size={72} compact />)}
        </Link>
      )}
    </section>
  );
};

export default GoalsHomeCard;
