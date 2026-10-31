import React, { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ringLaps, type GoalMetric } from '../../lib/queries/goals';

/**
 * Drawn on a canvas because each ring's gradient has to follow its own arc, which
 * SVG strokes cannot do. There is nothing but rings in here: the numbers are in the
 * legend and the card header.
 */

type RingColors = readonly [start: string, end: string];

const RING_COLORS: Record<string, RingColors> = {
  operations_count: ['#FA114F', '#FF5E9E'],
  delivery_docs: ['#78E40F', '#C6FF3A'],
  pickup_docs: ['#00C7E6', '#3BF5D2'],
  custody_receipts: ['#FF9500', '#FFD60A'],
};

/** For a metric added to the database before this map catches up. */
const FALLBACK_COLORS: RingColors = ['#9CA3AF', '#D1D5DB'];

export const ringColor = (metricKey: string): string => (RING_COLORS[metricKey] ?? FALLBACK_COLORS)[0];

const WIDE_DIAMETER = 240;
const NARROW_DIAMETER = 210;
const MAX_STROKE_RATIO = 0.11;
const HOLE_RATIO = 0.22;
const GAP = 3;
/** The hex alpha for the 14% track. */
const TRACK_ALPHA = '24';

const SWEEP_MS = 1100;
const STAGGER_MS = 90;
const TAU = Math.PI * 2;
/** 12 o'clock. */
const START_ANGLE = -Math.PI / 2;

export interface RingShape {
  radius: number;
  stroke: number;
}

/**
 * Outer ring first. The hole is fixed and the strokes share what is left, up to a
 * maximum, so with fewer rings they stop growing and the hole opens up instead.
 */
export function ringShapes(diameter: number, count: number): RingShape[] {
  const gaps = 2 * (count - 1) * GAP;
  const fitted = ((1 - HOLE_RATIO) * diameter - gaps) / (2 * count);
  const stroke = Math.min(fitted, diameter * MAX_STROKE_RATIO);
  return Array.from({ length: count }, (_, index) => ({
    radius: diameter / 2 - stroke / 2 - index * (stroke + GAP),
    stroke,
  }));
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

function strokeRing(ctx: CanvasRenderingContext2D, centre: number, ring: RingShape, style: string | CanvasGradient, from: number, to: number) {
  ctx.beginPath();
  ctx.arc(centre, centre, ring.radius, from, to);
  ctx.lineWidth = ring.stroke;
  ctx.lineCap = 'round';
  ctx.strokeStyle = style;
  ctx.stroke();
}

function arcGradient(ctx: CanvasRenderingContext2D, centre: number, from: number, colors: RingColors, span: number) {
  // Safari before 16.1 has no conic gradient. A flat ring beats no ring.
  if (!ctx.createConicGradient) return colors[0];
  const gradient = ctx.createConicGradient(from, centre, centre);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(span, colors[1]);
  gradient.addColorStop(1, colors[1]);
  return gradient;
}

function drawRing(ctx: CanvasRenderingContext2D, centre: number, ring: RingShape, colors: RingColors, laps: number, scale: number) {
  ctx.lineCap = 'butt';
  strokeRing(ctx, centre, ring, `${colors[0]}${TRACK_ALPHA}`, 0, TAU);
  if (laps <= 0) return;

  const tip = START_ANGLE + TAU * laps;

  if (laps < 1) {
    strokeRing(ctx, centre, ring, arcGradient(ctx, centre, START_ANGLE, colors, laps), START_ANGLE, tip);
    // The gradient's tail would otherwise tint the rounded start of the ring.
    ctx.beginPath();
    ctx.arc(centre + ring.radius * Math.cos(START_ANGLE), centre + ring.radius * Math.sin(START_ANGLE), ring.stroke / 2, 0, TAU);
    ctx.fillStyle = colors[0];
    ctx.fill();
  } else {
    // Full circle and beyond: the colour runs one whole turn ending at the tip, so
    // the seam between its two ends sits underneath the tip, out of sight.
    strokeRing(ctx, centre, ring, arcGradient(ctx, centre, tip, colors, 1), 0, TAU);
  }

  // The tip, lifted off the ring by a shadow falling ahead of it. Kept inside the
  // ring so that it never smudges the neighbours.
  const inner = ring.radius - ring.stroke / 2;
  const outer = ring.radius + ring.stroke / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centre, centre, outer, 0, TAU);
  ctx.arc(centre, centre, inner, 0, TAU, true);
  ctx.clip();
  ctx.shadowColor = 'rgba(15, 17, 23, 0.45)';
  ctx.shadowBlur = 7 * scale;
  ctx.shadowOffsetX = -Math.sin(tip) * 3 * scale;
  ctx.shadowOffsetY = Math.cos(tip) * 3 * scale;
  ctx.beginPath();
  ctx.arc(centre + ring.radius * Math.cos(tip), centre + ring.radius * Math.sin(tip), ring.stroke / 2, 0, TAU);
  ctx.fillStyle = colors[1];
  ctx.fill();
  ctx.restore();
}

const ActivityRings: React.FC<{ metrics: GoalMetric[] }> = ({ metrics }) => {
  const wide = useMediaQuery('(min-width: 640px)');
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const diameter = wide ? WIDE_DIAMETER : NARROW_DIAMETER;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const scale = window.devicePixelRatio || 1;
    canvas.width = diameter * scale;
    canvas.height = diameter * scale;
    ctx.scale(scale, scale);

    const shapes = ringShapes(diameter, metrics.length);
    const targets = metrics.map(ringLaps);
    const colors = metrics.map(metric => RING_COLORS[metric.metric_key] ?? FALLBACK_COLORS);
    const total = SWEEP_MS + STAGGER_MS * metrics.length;

    const paint = (elapsed: number) => {
      ctx.clearRect(0, 0, diameter, diameter);
      shapes.forEach((shape, index) => {
        const progress = Math.min(Math.max((elapsed - index * STAGGER_MS) / SWEEP_MS, 0), 1);
        drawRing(ctx, diameter / 2, shape, colors[index], targets[index] * easeOut(progress), scale);
      });
    };

    if (still) {
      paint(total);
      return;
    }

    let frame = 0;
    const begun = performance.now();
    const tick = (now: number) => {
      paint(now - begun);
      if (now - begun < total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [metrics, diameter, still]);

  return <canvas ref={canvasRef} aria-hidden="true" className="shrink-0" style={{ width: diameter, height: diameter }} />;
};

export default ActivityRings;
