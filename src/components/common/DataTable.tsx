import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './EmptyState'
import { Button } from '@/components/ui/button'
import { Inbox, ChevronLeft, ChevronRight } from 'lucide-react'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyMessage?: string
  emptyIcon?: ReactNode
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  pageSize?: number
  /** If provided, use server-side pagination (totalCount + onPageChange) */
  totalCount?: number
  onPageChange?: (page: number) => void
  currentPage?: number
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyMessage,
  emptyIcon,
  rowKey,
  onRowClick,
  pageSize = 25,
  totalCount,
  onPageChange,
  currentPage,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const [localPage, setLocalPage] = useState(0)

  // Server-side pagination vs client-side pagination
  const isServerPaginated = totalCount !== undefined && onPageChange !== undefined
  const page = isServerPaginated ? (currentPage ?? 0) : localPage

  const displayData = useMemo(() => {
    if (isServerPaginated) return data // already paginated server-side
    const start = page * pageSize
    return data.slice(start, start + pageSize)
  }, [data, page, pageSize, isServerPaginated])

  const total = isServerPaginated ? totalCount : data.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const showPagination = total > pageSize

  function goToPage(p: number) {
    if (isServerPaginated) {
      onPageChange!(p)
    } else {
      setLocalPage(p)
    }
  }

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-immo-border-default">
        <div className="flex gap-4 bg-immo-bg-card-hover px-4 py-3">
          {columns.map((col) => (
            <Skeleton key={col.key} className="h-3 w-24 bg-immo-border-default" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-t border-immo-border-default bg-immo-bg-card px-4 py-4"
          >
            {columns.map((col) => (
              <Skeleton key={col.key} className="h-4 w-28 bg-immo-border-default/50" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card">
        <EmptyState
          icon={emptyIcon ?? <Inbox className="h-10 w-10" />}
          title={emptyMessage ?? t('common.no_data')}
          description={t('common.no_match')}
        />
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-immo-border-default">
      <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="bg-immo-bg-card-hover">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayData.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={() => onRowClick?.(row)}
              className={`border-t border-immo-border-default bg-immo-bg-card transition-colors hover:bg-immo-bg-card-hover ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-4 py-3.5 text-sm text-immo-text-primary ${col.className ?? ''}`}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* Pagination */}
      {showPagination && (
        <div className="flex flex-col items-center gap-2 border-t border-immo-border-default bg-immo-bg-card px-4 py-2.5 sm:flex-row sm:justify-between">
          <span className="text-xs text-immo-text-muted">
            {t('common.showing', { count: total })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
              className="h-7 w-7 p-0 text-immo-text-muted hover:bg-immo-bg-card-hover"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-immo-text-secondary">
              {t('common.page_of', { current: page + 1, total: totalPages })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages - 1}
              className="h-7 w-7 p-0 text-immo-text-muted hover:bg-immo-bg-card-hover"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
