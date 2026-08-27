import * as React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarRange, Lightbulb, Megaphone } from 'lucide-react';
import { cn } from '../../../lib/utils';

const SECTIONS = [
  { title: 'Ideas', href: '/dashboard/media/ideas', icon: Lightbulb },
  { title: 'Calendar', href: '/dashboard/media/calendar', icon: CalendarRange },
  { title: 'Influencers', href: '/dashboard/media/influencers', icon: Megaphone },
] as const;

/** The segmented sub-nav shared by all three Media pages. */
export function MediaNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Media sections"
      className="inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-black/[0.06] bg-black/[0.02] p-1"
    >
      {SECTIONS.map(({ title, href, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            to={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] tracking-[-0.006em] transition-all duration-150',
              isActive
                ? 'bg-white font-semibold text-[#6ea4e7] shadow-[0_1px_2px_rgb(0_0_0/0.06)] ring-1 ring-black/[0.05]'
                : 'font-medium text-black/55 hover:bg-white/70 hover:text-black/80',
            )}
          >
            <Icon size={14} strokeWidth={isActive ? 2 : 1.6} />
            {title}
          </Link>
        );
      })}
    </nav>
  );
}
