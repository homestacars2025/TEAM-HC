import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu';
import { TONE_CLASSES, TONE_DOTS, toneFor } from '../../../../lib/media/badge-color';
import type { Tone } from '../../../../lib/types/media';
import { cn } from '../../../../lib/utils';

interface StatusSelectProps {
  value: string | null;
  options: readonly { value: string; label: string; tone: Tone }[];
  placeholder: string;
  ariaLabel: string;
  onSelect: (next: string | null) => Promise<boolean>;
}

/**
 * A coloured pill that *is* its own dropdown.
 *
 * Unlike `posted` / `is_approved`, these two columns are team-editable, so the
 * control is deliberately interactive — the affordance matches what RLS allows.
 */
export function StatusSelect({ value, options, placeholder, ariaLabel, onSelect }: StatusSelectProps) {
  const [pending, setPending] = React.useState(false);
  /** `undefined` means "defer to the prop", which makes a rollback one assignment. */
  const [optimistic, setOptimistic] = React.useState<string | null | undefined>(undefined);

  const current = optimistic === undefined ? value : optimistic;
  const tone = toneFor(options, current);
  const label = options.find((o) => o.value === current)?.label ?? current;

  async function choose(next: string | null) {
    if (next === current) return;
    setOptimistic(next);
    setPending(true);
    const ok = await onSelect(next);
    setPending(false);
    if (!ok) setOptimistic(undefined);
    else toast.success('Status updated');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label={ariaLabel}
        render={
          <button
            type="button"
            className={cn(
              'inline-flex h-[26px] w-fit max-w-full items-center gap-1.5 rounded-full border px-2.5',
              'text-[11.5px] font-medium whitespace-nowrap transition-all duration-150',
              'hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[#6ea4e7]/35 disabled:opacity-60',
              // An unset status is a dashed, transparent slot waiting to be filled.
              current ? TONE_CLASSES[tone] : 'border-dashed border-black/[0.14] bg-transparent text-black/35',
            )}
          />
        }
      >
        {current && <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONE_DOTS[tone])} />}
        <span className="truncate">{label ?? placeholder}</span>
        <ChevronDown size={11} strokeWidth={2} className="shrink-0 opacity-50" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[172px]">
        <DropdownMenuItem onClick={() => choose(null)} className="text-black/45">
          {placeholder}
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} onClick={() => choose(o.value)}>
            <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TONE_DOTS[o.tone])} />
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
