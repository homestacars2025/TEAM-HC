import type { CSSProperties } from 'react';
import type { Tone } from '../types/media';

/**
 * Goal and format colours come straight from the database and the column is
 * free-form, so everything is derived with `color-mix(in oklab, …)`: the surface
 * is a soft tint, the text is pulled toward black. That keeps both a pale pastel
 * and a near-black input legible without anyone curating per-colour overrides.
 */

const NEUTRAL: CSSProperties = {
  backgroundColor: 'rgb(0 0 0 / 0.05)',
  color: 'rgb(0 0 0 / 0.62)',
  borderColor: 'rgb(0 0 0 / 0.08)',
};

function isUsable(color: string | null | undefined): color is string {
  return typeof color === 'string' && color.trim().length > 0;
}

/** Soft tinted pill — the default badge treatment. */
export function tintedStyle(color: string | null | undefined): CSSProperties {
  if (!isUsable(color)) return NEUTRAL;
  const c = color.trim();
  return {
    backgroundColor: `color-mix(in oklab, ${c} 13%, transparent)`,
    color: `color-mix(in oklab, ${c} 78%, #0a0a0a)`,
    borderColor: `color-mix(in oklab, ${c} 22%, transparent)`,
  };
}

/** Calendar chip — tint plus a solid leading rail so the goal reads at a glance. */
export function chipStyle(color: string | null | undefined): CSSProperties {
  if (!isUsable(color)) {
    return { ...NEUTRAL, borderInlineStartColor: 'rgb(0 0 0 / 0.25)' };
  }
  const c = color.trim();
  return {
    backgroundColor: `color-mix(in oklab, ${c} 10%, transparent)`,
    color: `color-mix(in oklab, ${c} 80%, #0a0a0a)`,
    borderInlineStartColor: c,
  };
}

/** Just the raw colour, for dots and legends. */
export function dotStyle(color: string | null | undefined): CSSProperties {
  return { backgroundColor: isUsable(color) ? color.trim() : 'rgb(0 0 0 / 0.25)' };
}

export const TONE_CLASSES: Record<Tone, string> = {
  slate: 'bg-slate-500/[0.09] text-slate-700 border-slate-500/15',
  sky: 'bg-sky-500/[0.09] text-sky-700 border-sky-500/15',
  violet: 'bg-violet-500/[0.09] text-violet-700 border-violet-500/15',
  amber: 'bg-amber-500/[0.11] text-amber-700 border-amber-500/20',
  rose: 'bg-rose-500/[0.09] text-rose-700 border-rose-500/15',
  emerald: 'bg-emerald-500/[0.1] text-emerald-700 border-emerald-500/18',
};

export const TONE_DOTS: Record<Tone, string> = {
  slate: 'bg-slate-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
};

/** Maps an enum value to its static tone; unknown or null falls back to slate. */
export function toneFor(
  options: readonly { value: string; tone: Tone }[],
  value: string | null | undefined,
): Tone {
  if (!value) return 'slate';
  return options.find((o) => o.value === value)?.tone ?? 'slate';
}
