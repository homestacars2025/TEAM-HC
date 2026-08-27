import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface MediaEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

/** The single empty state for the whole section. */
export function MediaEmptyState({
  icon: Icon, title, description, action, className,
}: MediaEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-2xl',
        'border border-dashed border-black/[0.09] bg-black/[0.012] px-6 py-16 text-center',
        className,
      )}
    >
      <div className="relative flex size-14 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[#6ea4e7]/[0.12] to-[#6ea4e7]/[0.03]"
        />
        <Icon size={22} strokeWidth={1.5} className="relative text-[#6ea4e7]" />
      </div>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-[15px] font-semibold tracking-[-0.014em] text-black/85">{title}</p>
        <p className="text-[13px] leading-relaxed text-black/45">{description}</p>
      </div>
      {action}
    </div>
  );
}
