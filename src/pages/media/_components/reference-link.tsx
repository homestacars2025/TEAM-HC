import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../../components/ui/tooltip';
import { normalizeReferenceUrl, referenceLabel } from '../../../lib/media/reference-url';
import { cn } from '../../../lib/utils';

/**
 * The `reference_url` affordance, shared by Ideas and Posts.
 *
 * A secondary chip that sits beside the Goal and Format badges — same geometry,
 * brand tint — never a primary button. Nothing renders when the URL is unset:
 * an empty reference is an absence, not a disabled control.
 */

const CHIP =
  'inline-flex h-[22px] w-fit max-w-full shrink-0 items-center gap-1.5 rounded-full border ' +
  'border-[#6ea4e7]/20 bg-[#6ea4e7]/[0.08] px-2.5 text-[11.5px] font-medium leading-none text-[#1f64bb] ' +
  'transition-colors duration-150 hover:border-[#6ea4e7]/35 hover:bg-[#6ea4e7]/[0.16] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40';

/** Every reference link opens in a new tab and never leaks the referrer. */
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function ReferenceChip({
  url, label = 'Reference', className,
}: { url: string | null | undefined; label?: string; className?: string }) {
  const href = normalizeReferenceUrl(url);
  if (!href) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            {...EXTERNAL}
            aria-label={`Open the reference link ${referenceLabel(href)} in a new tab`}
            className={cn(CHIP, className)}
          />
        }
      >
        <ExternalLink size={11} strokeWidth={2} aria-hidden />
        {label}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        <span className="max-w-[280px] truncate">{referenceLabel(href)}</span>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Icon-only variant for places with no room for a label — a calendar day chip or
 * a dense table cell. Must never be nested inside a `<button>`: render it as a
 * sibling instead, or the markup is invalid and the drag handle swallows the tap.
 */
export function ReferenceIconLink({
  url, ariaLabel = 'Open the reference link in a new tab', className,
}: { url: string | null | undefined; ariaLabel?: string; className?: string }) {
  const href = normalizeReferenceUrl(url);
  if (!href) return null;

  return (
    <a
      href={href}
      {...EXTERNAL}
      aria-label={ariaLabel}
      title={referenceLabel(href)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md p-1 text-[#1f64bb]/60',
        'transition-colors duration-150 hover:bg-[#6ea4e7]/[0.16] hover:text-[#1f64bb]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6ea4e7]/40',
        className,
      )}
    >
      <ExternalLink size={11} strokeWidth={2} aria-hidden />
    </a>
  );
}

/**
 * The form control. `onChange` stays raw so typing is never fought with; the
 * value is normalised on blur, which is also where the scheme is added.
 */
export function ReferenceField({
  value, onChange, id,
}: { value: string; onChange: (next: string) => void; id?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        type="url"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          // Normalising here rather than on every keystroke: prefixing mid-typing
          // would fight the caret. An emptied field collapses to `""` = unset.
          const next = normalizeReferenceUrl(value);
          if (next !== value) onChange(next ?? '');
        }}
        placeholder="https://instagram.com/..."
        className="h-9 text-[13px]"
      />
      <ReferenceIconLink
        url={value}
        className="size-9 rounded-lg border border-[#6ea4e7]/20 bg-[#6ea4e7]/[0.08]"
      />
    </div>
  );
}
