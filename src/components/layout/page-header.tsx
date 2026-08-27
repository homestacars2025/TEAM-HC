import * as React from 'react';
import { cn } from '../../lib/utils';

interface PageHeaderProps {
  /** Max three words, rendered uppercase. */
  eyebrow: string;
  title: string;
  subtitle: string;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className="size-1.5 rounded-full bg-primary" />
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">{eyebrow}</span>
      </div>
      <h1 className="text-[24px] font-semibold tracking-[-0.022em] text-foreground">{title}</h1>
      <p className="mt-1 text-[13.5px] tracking-[-0.005em] text-muted-foreground">{subtitle}</p>
    </div>
  );
}
