import * as React from 'react';
import { Skeleton } from '../../../components/ui/skeleton';

/** Mirrors the month grid so the page does not reflow when data lands. */
export function CalendarLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <Skeleton className="h-10 w-72 rounded-full" />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-[68px] rounded-lg" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-[172px] rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
          <div className="grid grid-cols-7 border-b border-black/[0.06] bg-black/[0.015]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex justify-center px-3 py-2.5">
                <Skeleton className="h-2.5 w-8" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="flex min-h-[124px] flex-col gap-1.5 border-b border-r border-black/[0.05] p-2 [&:nth-child(7n)]:border-r-0"
              >
                <Skeleton className="size-[22px] rounded-full" />
                {i % 3 === 0 && <Skeleton className="h-9 w-full rounded-md" />}
                {i % 5 === 0 && <Skeleton className="h-9 w-full rounded-md" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
