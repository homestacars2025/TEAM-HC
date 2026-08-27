import * as React from 'react';
import { CheckCircle2, CircleDashed, Lock, ShieldCheck } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';
import { TONE_CLASSES, TONE_DOTS, tintedStyle } from '../../../lib/media/badge-color';
import type { MediaFormat, MediaGoal, Tone } from '../../../lib/types/media';
import { cn } from '../../../lib/utils';

const PILL =
  'inline-flex h-[22px] w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium leading-none';

/**
 * `fallback` is the raw key. An inactive goal is filtered out of the options but
 * may still be referenced by an existing row, so the badge shows `marketing_push`
 * rather than rendering an empty pill.
 */
export function GoalBadge({
  goal, fallback, className,
}: { goal?: MediaGoal; fallback?: string | null; className?: string }) {
  const label = goal?.label ?? fallback;
  if (!label) return null;
  return (
    <span className={cn(PILL, className)} style={tintedStyle(goal?.color)}>
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: goal?.color ?? 'currentColor' }}
      />
      {label}
    </span>
  );
}

export function FormatBadge({
  format, fallback, className,
}: { format?: MediaFormat; fallback?: string | null; className?: string }) {
  const label = format?.label ?? fallback;
  if (!label) return null;
  return (
    <span className={cn(PILL, className)} style={tintedStyle(format?.color)}>
      {label}
    </span>
  );
}

/**
 * `posted` and `is_approved` are admin-only and rejected by a server trigger for
 * everyone else, so they render as state, never as a control. The trigger slots a
 * `<span>` — hoverable for the explanation, but not clickable.
 */
function AdminFlag({
  on, onLabel, offLabel, onClasses, icon, tooltip, className,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClasses: string;
  icon: React.ReactNode;
  tooltip: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              PILL,
              'cursor-default select-none',
              on ? onClasses : 'border-black/[0.07] bg-black/[0.035] text-black/45',
              className,
            )}
          />
        }
      >
        {icon}
        {on ? onLabel : offLabel}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <span className="inline-flex items-center gap-1.5">
          <Lock size={11} />
          {tooltip}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

export function PostedBadge({ posted, className }: { posted: boolean; className?: string }) {
  return (
    <AdminFlag
      on={posted}
      onLabel="Posted"
      offLabel="Not posted"
      onClasses="border-emerald-500/18 bg-emerald-500/[0.1] text-emerald-700"
      icon={posted ? <CheckCircle2 size={12} strokeWidth={2} /> : <CircleDashed size={12} />}
      tooltip="Marked by an admin"
      className={className}
    />
  );
}

export function ApprovedBadge({ approved, className }: { approved: boolean; className?: string }) {
  return (
    <AdminFlag
      on={approved}
      onLabel="Approved"
      offLabel="Pending approval"
      onClasses="border-[#6ea4e7]/20 bg-[#6ea4e7]/[0.09] text-[#1f64bb]"
      icon={<ShieldCheck size={12} />}
      tooltip="Approved by an admin"
      className={className}
    />
  );
}

export function ToneBadge({
  label, tone, dot = true, className,
}: { label: string; tone: Tone; dot?: boolean; className?: string }) {
  return (
    <span className={cn(PILL, TONE_CLASSES[tone], className)}>
      {dot && <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONE_DOTS[tone])} />}
      {label}
    </span>
  );
}
