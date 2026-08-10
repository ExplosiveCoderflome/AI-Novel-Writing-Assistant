export default function AppRouteFallback() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`route-skeleton-card-${index}`} className="rounded-xl border p-4">
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
            <div className="mt-3 h-8 w-16 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-3 w-32 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-6 flex gap-2">
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
          <div className="h-10 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
