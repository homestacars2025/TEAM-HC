import * as React from 'react';
import { motion } from 'motion/react';
import {
  COLOR_MODES, DEFAULT_COLOR_MODE, isColorMode, type ColorMode,
} from '../../../lib/media/color-mode';
import { cn } from '../../../lib/utils';

/**
 * "Color by: Goal / Format" — the segmented control that picks which taxonomy
 * tints the cards, chips and legend.
 *
 * Deliberately the same geometry as the Calendar's List/Month switch, one size
 * down: this chooses a *view treatment*, so it must not compete with the primary
 * controls beside it.
 */

/**
 * Remembers the choice per page, following the project's storage convention
 * (`sidebar_collapsed`, `hc_currency`): a lazy initialiser and a write effect,
 * both wrapped — private mode throws on access, and a colour preference is never
 * worth taking the page down for.
 */
export function useColorMode(storageKey: string): [ColorMode, (next: ColorMode) => void] {
  const [mode, setMode] = React.useState<ColorMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return isColorMode(stored) ? stored : DEFAULT_COLOR_MODE;
    } catch {
      return DEFAULT_COLOR_MODE;
    }
  });

  React.useEffect(() => {
    try { localStorage.setItem(storageKey, mode); } catch { /* private mode */ }
  }, [storageKey, mode]);

  return [mode, setMode];
}

interface ColorModeToggleProps {
  value: ColorMode;
  onChange: (next: ColorMode) => void;
  /**
   * Must be unique among mounted toggles — the sliding pill is a shared layout
   * animation, and a duplicate id would make one control's pill fly to another.
   */
  layoutId: string;
  className?: string;
}

export function ColorModeToggle({ value, onChange, layoutId, className }: ColorModeToggleProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="whitespace-nowrap text-[11.5px] font-medium text-black/40">Color by</span>
      <div
        role="group"
        aria-label="Colour the board by"
        className="inline-flex items-center gap-0.5 rounded-lg border border-black/[0.07] bg-black/[0.02] p-0.5"
      >
        {COLOR_MODES.map((m) => {
          const isActive = value === m.value;
          return (
            <button
              key={m.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(m.value)}
              className={cn(
                'relative inline-flex h-[26px] items-center rounded-[6px] px-2.5 text-[12px] transition-colors duration-150',
                isActive ? 'font-semibold text-black/85' : 'font-medium text-black/45 hover:text-black/70',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={layoutId}
                  aria-hidden
                  className="absolute inset-0 rounded-[6px] bg-white shadow-[0_1px_2px_rgb(0_0_0/0.07)] ring-1 ring-black/[0.05]"
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                />
              )}
              <span className="relative">{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
