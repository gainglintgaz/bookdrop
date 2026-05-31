/**
 * Content-shaped loading placeholder shown while a lazy page chunk loads.
 * Mirrors the common page layout (header + stat cards + table) so the first
 * paint reads as "content arriving" rather than a bare spinner. Rendered
 * inside AppShell's persistent sidebar/header via the Outlet Suspense boundary.
 */
function Block({ className }: { className?: string }) {
  return <div className={`rounded bg-gray-200 ${className ?? ''}`} />
}

export function PageSkeleton() {
  return (
    <div
      className="animate-pulse p-6 lg:p-8 max-w-7xl mx-auto"
      role="status"
      aria-label="Loading page"
    >
      {/* Header */}
      <div className="mb-6 space-y-2">
        <Block className="h-7 w-56" />
        <Block className="h-4 w-80 max-w-full" />
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4">
            <Block className="h-3 w-20" />
            <Block className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>

      {/* Table / list */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <Block className="h-4 w-32" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-gray-50 px-4 py-3.5 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <Block className="h-9 w-9 rounded-full" />
              <div className="space-y-1.5">
                <Block className="h-3.5 w-40" />
                <Block className="h-3 w-24" />
              </div>
            </div>
            <Block className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>

      <span className="sr-only">Loading…</span>
    </div>
  )
}
