import * as React from 'react';
import { Skeleton } from '../../../components/ui/skeleton';

const TAB_WIDTHS = [64, 78, 84, 80, 72, 62, 82];

/** Mirrors the real Ideas layout so the page does not reflow when data lands. */
export function IdeasLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-8 w-32" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <Skeleton className="h-10 w-72 rounded-full" />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
          <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
        </div>

        <div className="flex items-center gap-1">
          {TAB_WIDTHS.map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-full" style={{ width: w }} />
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3.5 rounded-2xl border border-black/[0.07] bg-white p-5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-2/3" />
              <div className="flex gap-1.5">
                <Skeleton className="h-[22px] w-20 rounded-full" />
                <Skeleton className="h-[22px] w-16 rounded-full" />
              </div>
              <div className="flex gap-1.5">
                <Skeleton className="h-[22px] w-24 rounded-full" />
                <Skeleton className="h-[22px] w-28 rounded-full" />
              </div>
              <Skeleton className="mt-1 h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
