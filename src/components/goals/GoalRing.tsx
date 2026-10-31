import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../lib/LanguageContext';
import { formatGoalValue, ringFraction, type GoalMetric, type GoalStatus } from '../../lib/queries/goals';

export const GOAL_COLORS: Record<GoalStatus, string> = {
  green: '#16A34A',
  amber: '#F59E0B',
  red: '#DC2626',
  progress: '#6EA4E7',
  none: '#D4D4D4',
};

const RADIUS = 42;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Longer readings step down so "36.4%" clears the ring as easily as "30" does. */
const centreFontSize = (text: string, size: number): number => {
  const scale = text.length >= 5 ? 0.17 : text.length === 4 ? 0.195 : 0.235;
  return Math.round(size * scale);
};

export const useMetricText = () => {
  const { lang } = useLanguage();
  return (metric: GoalMetric) => ({
    label: lang === 'ar' ? metric.label_ar : metric.label_en,
    description: lang === 'ar' ? metric.description_ar : metric.description_en,
  });
};

/** The ring on its own: colour from the status, fill from value over target. */
export const RingArc: React.FC<{ metric: GoalMetric; size: number }> = ({ metric, size }) => {
  // Starts empty and fills after first paint, which is what gives it the sweep.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const color = GOAL_COLORS[metric.status] ?? GOAL_COLORS.none;
  const fraction = drawn ? ringFraction(metric) : 0;
  const reading = formatGoalValue(metric);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r={RADIUS} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={STROKE} />
        <circle
          className="hc-ring-fill"
          cx="50" cy="50" r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          // A round cap paints a dot even at zero length.
          opacity={fraction > 0 ? 1 : 0}
        />
      </svg>
      <bdi
        dir="ltr"
        className="absolute inset-0 flex items-center justify-center font-semibold text-[#0f1117]"
        style={{ fontSize: centreFontSize(reading, size) }}
      >
        {reading}
      </bdi>
    </div>
  );
};

interface GoalRingProps {
  metric: GoalMetric;
  size: number;
  onOpen?: (metric: GoalMetric) => void;
  /** Label only, for the Home card. */
  compact?: boolean;
}

const GoalRing: React.FC<GoalRingProps> = ({ metric, size, onOpen, compact }) => {
  const { t } = useTranslation('goals');
  const text = useMetricText()(metric);

  const sub = metric.kind === 'percent'
    ? `${metric.numerator ?? 0} / ${metric.denominator ?? 0}`
    : t('target', { target: metric.target });

  const body = (
    <>
      <RingArc metric={metric} size={size} />
      <span className={`mt-2 block max-w-full text-center font-medium leading-snug text-gray-700 ${compact ? 'text-xs' : 'text-[13px]'}`}>
        {text.label}
      </span>
      {!compact && (
        <bdi dir="ltr" className="mt-0.5 block text-xs text-gray-500">{sub}</bdi>
      )}
    </>
  );

  const shell = 'flex min-w-0 flex-col items-center rounded-2xl p-2';
  if (!onOpen) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      onClick={() => onOpen(metric)}
      aria-label={`${text.label}: ${formatGoalValue(metric)}. ${t(`status.${metric.status}`)}`}
      className={`${shell} cursor-pointer transition-colors hover:bg-black/[0.03]`}
    >
      {body}
    </button>
  );
};

export default GoalRing;
