import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Building2, User, Home, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSuperAdminStore } from '@/store/superAdminStore'

type ResultType = 'tenant' | 'client' | 'unit'

interface SearchResult {
  type: ResultType
  id: string
  title: string
  subtitle: string
  tenant_id: string
  tenant_name: string
}

const ICONS: Record<ResultType, typeof Building2> = {
  tenant: Building2,
  client: User,
  unit: Home,
}

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { enterTenant } = useSuperAdminStore()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keyboard shortcut: Ctrl+K
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['super-admin-global-search', query],
    queryFn: async (): Promise<SearchResult[]> => {
      if (query.length < 2) return []

      const s = `%${query}%`
      const all: SearchResult[] = []

      // Search tenants
      const { data: tenants } = await supabase.from('tenants').select('id, name, email, wilaya').ilike('name', s).limit(5)
      for (const t of tenants ?? []) {
        all.push({ type: 'tenant', id: t.id, title: t.name, subtitle: `${t.email ?? ''} · ${t.wilaya ?? ''}`, tenant_id: t.id, tenant_name: t.name })
      }

      // Build tenant name lookup from already fetched tenants
      const tenantNameMap = new Map<string, string>()
      for (const t of tenants ?? []) tenantNameMap.set(t.id, t.name)

      // Search clients
      const { data: clients } = await supabase.from('clients').select('id, full_name, phone, tenant_id').ilike('full_name', s).limit(5)
      for (const c of (clients ?? []) as Array<{ id: string; full_name: string; phone: string | null; tenant_id: string }>) {
        all.push({ type: 'client', id: c.id, title: c.full_name, subtitle: c.phone ?? '', tenant_id: c.tenant_id, tenant_name: tenantNameMap.get(c.tenant_id) ?? '' })
      }

      // Search units
      const { data: units } = await supabase.from('units').select('id, code, type, tenant_id').ilike('code', s).limit(5)
      for (const u of (units ?? []) as Array<{ id: string; code: string; type: string; tenant_id: string }>) {
        all.push({ type: 'unit', id: u.id, title: u.code, subtitle: u.type, tenant_id: u.tenant_id, tenant_name: tenantNameMap.get(u.tenant_id) ?? '' })
      }

      return all
    },
    enabled: query.length >= 2 && open,
  })

  function handleSelect(r: SearchResult) {
    setOpen(false)
    setQuery('')
    if (r.type === 'tenant') {
      navigate(`/admin/tenants/${r.id}`)
    } else {
      // Enter tenant then navigate to the relevant page
      enterTenant(r.tenant_id, r.tenant_name)
      if (r.type === 'client') navigate(`/pipeline/clients/${r.id}`)
      else navigate('/projects')
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-immo-text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          aria-label="Recherche globale"
          placeholder="Recherche globale... (Ctrl+K)"
          className="h-9 w-[320px] rounded-lg border border-immo-border-default bg-immo-bg-primary ps-9 pe-8 text-sm text-immo-text-primary placeholder-immo-text-muted outline-none focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/20"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setOpen(false) }}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-immo-text-muted transition-colors hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0579DA]/40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {open && query.length >= 2 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[400px] rounded-xl border border-immo-border-default bg-immo-bg-card shadow-2xl shadow-black/10">
          {isFetching && (
            <div className="px-4 py-3 text-center text-xs text-immo-text-secondary">Recherche...</div>
          )}
          {!isFetching && results.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-immo-text-secondary">Aucun resultat pour "{query}"</div>
          )}
          {!isFetching && results.length > 0 && (
            <div className="max-h-[400px] divide-y divide-immo-border-default overflow-y-auto">
              {results.map((r, i) => {
                const Icon = ICONS[r.type]
                return (
                  <button
                    key={`${r.type}-${r.id}-${i}`}
                    onClick={() => handleSelect(r)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-immo-bg-card-hover"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0579DA]/10">
                      <Icon className="h-4 w-4 text-[#0579DA]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-immo-text-primary">{r.title}</p>
                      <p className="truncate text-[11px] text-immo-text-secondary">{r.subtitle}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-immo-bg-primary px-2 py-0.5 text-[9px] uppercase text-immo-text-secondary">
                      {r.type}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
