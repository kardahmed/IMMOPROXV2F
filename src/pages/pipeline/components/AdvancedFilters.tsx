import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { SlidersHorizontal, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SOURCE_LABELS, INTEREST_LEVEL_LABELS } from '@/types'

export interface AdvancedFilterValues {
  agentId: string
  source: string
  interestLevel: string
  budgetMin: string
  budgetMax: string
  isPriority: string
}

const EMPTY_FILTERS: AdvancedFilterValues = {
  agentId: '', source: '', interestLevel: '', budgetMin: '', budgetMax: '', isPriority: '',
}

interface AdvancedFiltersProps {
  filters: AdvancedFilterValues
  onChange: (filters: AdvancedFilterValues) => void
  onClear: () => void
}

export function AdvancedFilters({ filters, onChange, onClear }: AdvancedFiltersProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const tenantId = useAuthStore(s => s.tenantId)

  const { data: agents = [] } = useQuery({
    queryKey: ['filter-agents', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name').eq('tenant_id', tenantId!).in('role', ['agent', 'admin']).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>
    },
    enabled: !!tenantId,
    staleTime: 300_000,
  })

  const activeCount = Object.values(filters).filter(v => v !== '').length

  function update(key: keyof AdvancedFilterValues, value: string) {
    onChange({ ...filters, [key]: value })
  }

  const selectClass = 'h-8 w-full rounded-md border border-immo-border-default bg-immo-bg-card px-2 text-xs text-immo-text-primary'
  const inputClass = 'h-8 text-xs'

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className={`border text-xs ${
          activeCount > 0
            ? 'border-immo-accent-green/30 bg-immo-accent-green/5 text-immo-accent-green'
            : 'border-immo-border-default text-immo-text-secondary hover:bg-immo-bg-card-hover'
        }`}
      >
        <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
        {t('pipeline_filters.button')}{activeCount > 0 ? ` (${activeCount})` : ''}
      </Button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-[400px] rounded-xl border border-immo-border-default bg-immo-bg-card p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-immo-text-primary">{t('pipeline_filters.title')}</h4>
            <button onClick={() => setOpen(false)} className="text-immo-text-muted hover:text-immo-text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Agent */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">{t('pipeline_filters.agent')}</label>
              <select value={filters.agentId} onChange={e => update('agentId', e.target.value)} className={selectClass}>
                <option value="">{t('pipeline_filters.all')}</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
              </select>
            </div>

            {/* Source */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">{t('pipeline_filters.source')}</label>
              <select value={filters.source} onChange={e => update('source', e.target.value)} className={selectClass}>
                <option value="">{t('pipeline_filters.all_sources')}</option>
                {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {/* Interest level */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">{t('pipeline_filters.interest_level')}</label>
              <select value={filters.interestLevel} onChange={e => update('interestLevel', e.target.value)} className={selectClass}>
                <option value="">{t('pipeline_filters.all')}</option>
                {Object.entries(INTEREST_LEVEL_LABELS).map(([v, meta]) => <option key={v} value={v}>{(meta as { label: string }).label}</option>)}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">{t('pipeline_filters.priority')}</label>
              <select value={filters.isPriority} onChange={e => update('isPriority', e.target.value)} className={selectClass}>
                <option value="">{t('pipeline_filters.all')}</option>
                <option value="true">{t('pipeline_filters.priority_high')}</option>
                <option value="false">{t('pipeline_filters.priority_normal')}</option>
              </select>
            </div>

            {/* Budget range */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">{t('pipeline_filters.budget_min')}</label>
              <Input type="number" value={filters.budgetMin} onChange={e => update('budgetMin', e.target.value)} placeholder="0" className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">{t('pipeline_filters.budget_max')}</label>
              <Input type="number" value={filters.budgetMax} onChange={e => update('budgetMax', e.target.value)} placeholder={t('pipeline_filters.unlimited')} className={inputClass} />
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { onClear(); setOpen(false) }} className="text-xs text-immo-text-muted">
              {t('pipeline_filters.reset')}
            </Button>
            <Button size="sm" onClick={() => setOpen(false)} className="bg-immo-accent-green text-xs font-semibold text-white hover:bg-immo-accent-green/90">
              {t('pipeline_filters.apply')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { EMPTY_FILTERS }
