export function NovelListSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={`loading-${index}`} className="space-y-4 rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-7 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-16 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((__, metricIndex) => (
              <div key={`metric-${index}-${metricIndex}`} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-28 animate-pulse rounded bg-muted" />
            <div className="h-9 w-20 animate-pulse rounded bg-muted" />
            <div className="h-9 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
