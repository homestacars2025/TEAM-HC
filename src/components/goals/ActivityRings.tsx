import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ringLaps, type GoalMetric } from '../../lib/queries/goals';

/** Each ring's colour is its identity, so status never changes it. */
const RING_COLORS: Record<string, { color: string; deep: string }> = {
  operations_count: { color: '#6EA4E7', deep: '#3A74C2' },
  delivery_docs: { color: '#8B5CF6', deep: '#6D28D9' },
  pickup_docs: { color: '#14B8A6', deep: '#0F766E' },
  custody_receipts: { color: '#F59E0B', deep: '#B45309' },
};

/** For a metric added to the database before this map catches up. */
const FALLBACK_RING = { color: '#9CA3AF', deep: '#6B7280' };

export const ringColor = (metricKey: string): string => (RING_COLORS[metricKey] ?? FALLBACK_RING).color;

const GAP = 4;
const STAGGER_MS = 80;
/** Matches `.hc-ring-fill` in index.css, so a second lap starts as the first ends. */
const LAP_MS = 900;

interface RingProps {
  metric: GoalMetric;
  index: number;
  radius: number;
  stroke: number;
  centre: number;
  drawn: boolean;
}

const Ring: React.FC<RingProps> = ({ metric, index, radius, stroke, centre, drawn }) => {
  const { color, deep } = RING_COLORS[metric.metric_key] ?? FALLBACK_RING;
  const circumference = 2 * Math.PI * radius;
  const laps = ringLaps(metric);
  const firstLap = drawn ? Math.min(laps, 1) : 0;
  const secondLap = drawn ? Math.max(laps - 1, 0) : 0;
  const delay = index * STAGGER_MS;
  const tipAngle = 2 * Math.PI * Math.max(laps - 1, 0);

  const arc = (fraction: number, tone: string, extraDelay: number) => (
    <circle
      className="hc-ring-fill"
      cx={centre} cy={centre} r={radius}
      fill="none"
      stroke={tone}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeDasharray={circumference}
      strokeDashoffset={circumference * (1 - fraction)}
      // A round cap paints a dot even at zero length.
      opacity={laps > 0 ? 1 : 0}
      style={{ transitionDelay: `${delay + extraDelay}ms` }}
    />
  );

  return (
    <g data-ring={metric.metric_key} data-laps={laps.toFixed(2)}>
      <circle cx={centre} cy={centre} r={radius} fill="none" stroke={color} strokeOpacity={0.15} strokeWidth={stroke} />
      {arc(firstLap, color, 0)}
      {laps > 1 && arc(secondLap, deep, LAP_MS)}
      {laps > 1 && drawn && (
        <circle
          className="hc-ring-tip"
          cx={centre + radius * Math.cos(tipAngle)}
          cy={centre + radius * Math.sin(tipAngle)}
          r={stroke / 2}
          fill={deep}
          style={{ animationDelay: `${delay + LAP_MS * 2}ms` }}
        />
      )}
    </g>
  );
};

interface ActivityRingsProps {
  metrics: GoalMetric[];
  /** 0 to 100, or `null` when nothing can be measured yet. */
  score: number | null;
  allGreen: boolean;
}

const ActivityRings: React.FC<ActivityRingsProps> = ({ metrics, score, allGreen }) => {
  const { t } = useTranslation('goals');
  const wide = useMediaQuery('(min-width: 640px)');
  const stroke = wide ? 14 : 11;
  const hole = wide ? 46 : 40;
  const size = 2 * (hole + metrics.length * (stroke + GAP));
  const centre = size / 2;

  // Starts empty and fills after first paint, which is what gives it the sweep.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ transform: 'rotate(-90deg)' }}>
        {metrics.map((metric, index) => (
          <Ring
            key={metric.metric_key}
            metric={metric}
            index={index}
            radius={centre - stroke / 2 - index * (stroke + GAP)}
            stroke={stroke}
            centre={centre}
            drawn={drawn}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {allGreen ? (
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" role="img" aria-label={t('status.green')}>
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <>
            <bdi dir="ltr" className="text-[22px] font-semibold leading-none text-[#0f1117]">{score === null ? '—' : `${score}%`}</bdi>
            <span className="mt-1 text-[10.5px] font-medium text-gray-500">{t('score')}</span>
          </>
        )}
      </div>
    </div>
  );
};

export default ActivityRings;
