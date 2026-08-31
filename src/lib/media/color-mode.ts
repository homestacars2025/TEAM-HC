import type { MediaFormat, MediaGoal, MediaLookup } from '../types/media';

/**
 * Which taxonomy drives the accent colour across the Media section.
 *
 * The colours themselves are never chosen here — they come from `media.goals`
 * and `media.formats`, and are derived by the helpers in `badge-color.ts`. This
 * only decides *which* of the two rows gets handed to them.
 */

export type ColorMode = 'goal' | 'format';

/**
 * Goal first, and the default: it is the section's original behaviour.
 *
 * There is no label here on purpose. `value` is the stable key the toggle reads
 * back out of localStorage *and* the i18n key it renders under
 * (`media:colorMode.goal` / `media:colorMode.format`), so the wording lives in
 * one place and cannot drift out of sync with the legend beside it.
 */
export const COLOR_MODES: readonly { value: ColorMode }[] = [
  { value: 'goal' },
  { value: 'format' },
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
