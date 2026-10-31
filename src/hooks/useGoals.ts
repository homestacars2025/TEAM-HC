import { useCallback, useEffect, useState } from 'react';
import { getGoalGaps, getGoalProgress, type GoalGap, type GoalMetric } from '../lib/queries/goals';

interface GoalsState {
  /** `null` while loading. */
  metrics: GoalMetric[] | null;
  /** `null` while loading, or when only this half failed: the rings still show. */
  gaps: GoalGap[] | null;
  failed: boolean;
}

const LOADING: GoalsState = { metrics: null, gaps: null, failed: false };

export function useGoals(month: string): GoalsState & { retry: () => void } {
  const [state, setState] = useState<GoalsState>(LOADING);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState(LOADING);
    Promise.all([getGoalProgress(month), getGoalGaps(month).catch(() => null)])
      .then(([metrics, gaps]) => { if (!cancelled) setState({ metrics, gaps, failed: false }); })
      .catch(() => { if (!cancelled) setState({ metrics: null, gaps: null, failed: true }); });
    return () => { cancelled = true; };
  }, [month, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);

  return { ...state, retry };
}
