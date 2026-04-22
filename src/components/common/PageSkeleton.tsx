import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton placeholder for a full Super Admin page during initial data load.
 * Mimics the typical layout: header row + KPI row + content block.
 */
export function PageSkeleton({ kpiCount = 4, hasTable = false }: { kpiCount?: number; hasTable?: boolean }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 bg-immo-border-default/60" />
          <Skeleton className="h-4 w-64 bg-immo-border-default/40" />
        </div>
        <Skeleton className="h-9 w-36 bg-immo-border-default/60" />
      </div>

      {/* KPIs */}
      {kpiCount > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: kpiCount }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card">
              <Skeleton className="h-[3px] w-full rounded-none bg-immo-border-default/40" />
              <div className="flex items-start justify-between p-5">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20 bg-immo-border-default/40" />
                  <Skeleton className="h-7 w-16 bg-immo-border-default/60" />
                </div>
                <Skeleton className="h-10 w-10 rounded-lg bg-immo-border-default/40" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table or content block */}
      {hasTable ? (
        <div className="overflow-hidden rounded-xl border border-immo-border-default">
          <div className="flex gap-4 bg-immo-bg-card-hover px-4 py-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-3 flex-1 bg-immo-border-default/40" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-t border-immo-border-default bg-immo-bg-card px-4 py-4">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1 bg-immo-border-default/30" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/3 bg-immo-border-default/50" />
            <Skeleton className="h-4 w-2/3 bg-immo-border-default/40" />
            <Skeleton className="h-4 w-1/2 bg-immo-border-default/40" />
          </div>
        </div>
      )}
    </div>
  )
}
