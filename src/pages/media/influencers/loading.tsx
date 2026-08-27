import * as React from 'react';
import { Skeleton } from '../../../components/ui/skeleton';

export function InfluencersLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-8 w-44" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>

      <Skeleton className="h-10 w-72 rounded-full" />

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-9 w-full max-w-xs rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-36 rounded-lg" />
            <Skeleton className="h-9 w-32 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-36 shrink-0 rounded-lg" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex h-[62px] items-center gap-4 border-b border-black/[0.04] px-4 last:border-b-0">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex w-52 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-[22px] w-32 rounded-full" />
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-[26px] w-28 rounded-full" />
              <Skeleton className="h-[26px] w-24 rounded-full" />
              <Skeleton className="h-3 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
