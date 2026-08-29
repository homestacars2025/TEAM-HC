import type { MediaFormat, MediaGoal, MediaLookup } from '../types/media';

/**
 * Which taxonomy drives the accent colour across the Media section.
 *
 * The colours themselves are never chosen here — they come from `media.goals`
 * and `media.formats`, and are derived by the helpers in `badge-color.ts`. This
 * only decides *which* of the two rows gets handed to them.
 */

export type ColorMode = 'goal' | 'format';

/** Goal first, and the default: it is the section's original behaviour. */
export const COLOR_MODES: readonly { value: ColorMode; label: string }[] = [
  { value: 'goal', label: 'Goal' },
  { value: 'format', label: 'Format' },
];

export const DEFAULT_COLOR_MODE: ColorMode = 'goal';

/** Narrows an unknown (a stored string, a URL param) back to a mode. */
export function isColorMode(value: unknown): value is ColorMode {
  return value === 'goal' || value === 'format';
}

/**
 * The lookup row that colours a post or an idea — the whole row, not just the
 * colour, because the calendar chip also prints its label.
 *
 * `undefined` when the record has nothing set in the active dimension. Callers
 * pass that straight through to `chipStyle`/`tintedStyle`, which already render
 * a neutral surface, so an unclassified item stays legible instead of vanishing.
 */
export function accentFor(
  mode: ColorMode,
  goal: MediaGoal | undefined,
  format: MediaFormat | undefined,
): MediaLookup | undefined {
  return mode === 'format' ? format : goal;
}
