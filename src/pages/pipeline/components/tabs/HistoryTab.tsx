import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Clock, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// native <select> used instead of base-ui Select
import { EmptyState, Modal } from '@/components/common'
import { HISTORY_TYPE_LABELS } from '@/types'
import type { HistoryType } from '@/types'
import { format } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale'
import { ar as arLocale } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { inputClass } from './shared'

export function HistoryTab({ clientId }: { clientId: string }) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language === 'ar' ? arLocale : frLocale
  const [filter, setFilter] = useState<string>('all')
  const [limit, setLimit] = useState(20)
  const userId = useAuthStore((s) => s.session?.user?.id)
  const qc = useQueryClient()
  const tenantId = useAuthStore((s) => s.tenantId)
  const [showAdd, setShowAdd] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addType, setAddType] = useState<string>('note')

  const { data: entries = [] } = useQuery({
    queryKey: ['client-history', clientId, filter, limit],
    queryFn: async () => {
      let q = supabase
        .from('history')
        .select('*, users!history_agent_id_fkey(first_name, last_name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (filter !== 'all') q = q.eq('type', filter as HistoryType)
      const { data, error } = await q
      if (error) { handleSupabaseError(error); throw error }
      return data as unknown as Array<Record<string, unknown>>
    },
  })

  const addEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('history').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: userId, type: addType, title: addTitle,
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-history', clientId] })
      setShowAdd(false); setAddTitle('')
      toast.success(t('success.created'))
    },
  })

  const FILTERS = [
    { key: 'all', label: t('common.all') },
    { key: 'call', label: t('history_type.call') },
    { key: 'whatsapp_message', label: 'WhatsApp' },
    { key: 'email', label: t('history_type.email') },
    { key: 'stage_change', label: t('history_type.stage_change') },
    { key: 'visit_planned', label: t('tab.visits') },
    { key: 'sale', label: t('kpi.sales') },
    { key: 'payment', label: t('history_type.payment') },
  ]

  const grouped = useMemo(() => {
    const groups = new Map<string, Array<Record<string, unknown>>>()
    for (const e of entries) {
      const day = format(new Date(e.created_at as string), 'yyyy-MM-dd')
      if (!groups.has(day)) groups.set(day, [])
      groups.get(day)!.push(e)
    }
    return groups
  }, [entries])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-immo-bg-card-hover px-2 py-0.5 text-[11px] font-semibold text-immo-text-muted">{entries.length}</span>
        </div>
        <Button onClick={() => setShowAdd(true)} variant="ghost" className="border border-immo-border-default text-xs text-immo-text-secondary hover:bg-immo-bg-card-hover">
          <Plus className="mr-1 h-3.5 w-3.5" /> {t('action.add')}
        </Button>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] transition-colors ${filter === f.key ? 'bg-immo-accent-green/10 font-medium text-immo-accent-green' : 'text-immo-text-muted hover:bg-immo-bg-card-hover'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={<Clock className="h-10 w-10" />} title={t('common.no_data')} />
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([day, items]) => (
            <div key={day}>
              <p className="mb-2 text-[11px] font-semibold text-immo-text-muted">
                {format(new Date(day), 'EEEE d MMMM yyyy', { locale: dateLocale })}
              </p>
              <div className="space-y-1.5">
                {items.map((e) => {
                  const meta = HISTORY_TYPE_LABELS[(e.type as HistoryType)]
                  const agent = e.users as { first_name: string; last_name: string } | null
                  return (
                    <div key={e.id as string} className="flex items-center gap-3 rounded-lg border border-immo-border-default bg-immo-bg-card px-4 py-2.5">
                      <div className="h-2 w-2 shrink-0 rounded-full bg-immo-accent-green" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-immo-text-primary">{meta?.label ?? (e.title as string)}</span>
                        {agent && <span className="ml-2 text-[11px] text-immo-text-muted">{agent.first_name}</span>}
                      </div>
                      <span className="shrink-0 text-[11px] text-immo-text-muted">{format(new Date(e.created_at as string), 'HH:mm')}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {entries.length >= limit && (
            <button onClick={() => setLimit((l) => l + 20)} className="w-full rounded-lg border border-immo-border-default py-2 text-xs text-immo-text-muted hover:bg-immo-bg-card-hover">
              {t('common.loading')}
            </button>
          )}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title={t('action.add')} size="sm">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-immo-text-secondary">{t('field.type')}</Label>
            <select value={addType} onChange={(e) => setAddType(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
              {['note', 'call', 'sms', 'email', 'whatsapp_message'].map((tp) => (
                <option key={tp} value={tp}>{HISTORY_TYPE_LABELS[tp as HistoryType]?.label ?? tp}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-xs text-immo-text-secondary">{t('field.description')} *</Label>
            <Input value={addTitle} onChange={(e) => setAddTitle(e.target.value)} placeholder="..." className={inputClass} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)} className="text-immo-text-secondary">{t('action.cancel')}</Button>
            <Button onClick={() => addEntry.mutate()} disabled={!addTitle || addEntry.isPending} className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
              {t('action.add')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
