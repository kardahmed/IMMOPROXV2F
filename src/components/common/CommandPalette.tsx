import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Search, User, Building2, Home, ArrowRight, Command } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'

type ResultType = 'client' | 'project' | 'unit'

interface SearchResult {
  type: ResultType
  id: string
  title: string
  subtitle: string
}

const ICONS: Record<ResultType, typeof User> = {
  client: User,
  project: Building2,
  unit: Home,
}

const ROUTES: Record<ResultType, (id: string) => string> = {
  client: (id) => `/pipeline/clients/${id}`,
  project: (id) => `/projects/${id}`,
  unit: () => '/projects',
}

interface Props {
  open: boolean
  onClose: () => void
}

// Tenant-side global search palette. Opens on Cmd+K (⌘K) or Ctrl+K
// from anywhere in the app. Searches clients, projects, units in the
// current tenant scope (RLS handles isolation).
export function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tenantId = useAuthStore(s => s.tenantId)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  // Auto-focus input on open + reset state on close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  // Reset highlight when results change
  useEffect(() => { setActiveIndex(0) }, [query])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['command-palette', tenantId, query],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!tenantId || query.length < 2) return []
      const s = `%${query}%`
      const all: SearchResult[] = []

      const [clientsRes, projectsRes, unitsRes] = await Promise.all([
        supabase.from('clients').select('id, full_name, phone').eq('tenant_id', tenantId).ilike('full_name', s).limit(6),
        supabase.from('projects').select('id, name, code').eq('tenant_id', tenantId).ilike('name', s).limit(4),
        supabase.from('units').select('id, code, type').eq('tenant_id', tenantId).ilike('code', s).limit(4),
      ])

      for (const c of (clientsRes.data ?? []) as Array<{ id: string; full_name: string; phone: string | null }>) {
        all.push({ type: 'client', id: c.id, title: c.full_name, subtitle: c.phone ?? '' })
      }
      for (const p of (projectsRes.data ?? []) as Array<{ id: string; name: string; code: string | null }>) {
        all.push({ type: 'project', id: p.id, title: p.name, subtitle: p.code ?? '' })
      }
      for (const u of (unitsRes.data ?? []) as Array<{ id: string; code: string; type: string }>) {
        all.push({ type: 'unit', id: u.id, title: u.code, subtitle: u.type })
      }
      return all
    },
    enabled: open && query.length >= 2 && !!tenantId,
    staleTime: 30_000,
  })

  const grouped = useMemo(() => {
    const map: Record<ResultType, SearchResult[]> = { client: [], project: [], unit: [] }
    for (const r of results) map[r.type].push(r)
    return map
  }, [results])

  const flatList = results

  function handleSelect(r: SearchResult) {
    onClose()
    navigate(ROUTES[r.type](r.id))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, flatList.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatList[activeIndex]) {
      e.preventDefault()
      handleSelect(flatList[activeIndex])
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('command_palette.title')}
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 px-4 pt-[15vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-immo-border-default px-4">
          <Search className="h-4 w-4 text-immo-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('command_palette.placeholder')}
            aria-label={t('command_palette.search_label')}
            className="h-12 flex-1 bg-transparent text-sm text-immo-text-primary placeholder:text-immo-text-muted outline-none"
          />
          <span className="rounded-md border border-immo-border-default bg-immo-bg-primary px-1.5 py-0.5 text-[10px] text-immo-text-muted">
            ESC
          </span>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {query.length < 2 && (
            <div className="px-4 py-8 text-center text-xs text-immo-text-muted">
              {t('command_palette.hint')}
            </div>
          )}
          {query.length >= 2 && isFetching && (
            <div className="px-4 py-6 text-center text-xs text-immo-text-muted">
              {t('command_palette.searching')}
            </div>
          )}
          {query.length >= 2 && !isFetching && flatList.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-immo-text-muted">
              {t('command_palette.no_results', { query })}
            </div>
          )}
          {flatList.length > 0 && (
            <>
              {(['client', 'project', 'unit'] as const).map((group) => {
                const items = grouped[group]
                if (items.length === 0) return null
                return (
                  <div key={group}>
                    <div className="border-t border-immo-border-default bg-immo-bg-primary/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">
                      {t(`command_palette.group_${group}`)}
                    </div>
                    {items.map((r) => {
                      const flatIdx = flatList.indexOf(r)
                      const isActive = flatIdx === activeIndex
                      const Icon = ICONS[r.type]
                      return (
                        <button
                          key={`${r.type}-${r.id}`}
                          onClick={() => handleSelect(r)}
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors ${
                            isActive
                              ? 'bg-immo-accent-green/10 text-immo-accent-green'
                              : 'text-immo-text-primary hover:bg-immo-bg-card-hover'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0 opacity-70" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{r.title}</p>
                            {r.subtitle && (
                              <p className="truncate text-[11px] text-immo-text-muted">{r.subtitle}</p>
                            )}
                          </div>
                          {isActive && <ArrowRight className="h-3.5 w-3.5 text-immo-accent-green" />}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-immo-border-default bg-immo-bg-primary/30 px-4 py-2 text-[10px] text-immo-text-muted">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="rounded bg-immo-bg-card px-1 py-0.5">↑↓</kbd> {t('command_palette.navigate')}</span>
            <span className="flex items-center gap-1"><kbd className="rounded bg-immo-bg-card px-1 py-0.5">↵</kbd> {t('command_palette.open')}</span>
          </div>
          <span className="flex items-center gap-1">
            <Command className="h-3 w-3" /> + K
          </span>
        </div>
      </div>
    </div>
  )
}
