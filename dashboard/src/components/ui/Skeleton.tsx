import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-border/60", className)} />;
}

export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-surface-border bg-surface p-5 shadow-card"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-surface-border bg-surface shadow-card">
      <div className="border-b border-surface-border bg-surface-muted px-4 py-3">
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-surface-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid items-center gap-4 px-4 py-3.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-4", c === 0 ? "w-4/5" : "w-3/5")}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardListSkeleton({
  count = 4,
  columns = 2,
}: {
  count?: number;
  columns?: 1 | 2;
}) {
  return (
    <div className={cn("grid gap-4", columns === 2 ? "md:grid-cols-2" : "grid-cols-1")}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="space-y-3 rounded-lg border border-surface-border bg-surface p-5 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}
