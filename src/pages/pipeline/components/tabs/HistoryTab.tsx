import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Clock, Plus, Phone, MessageCircle, Mail, GitBranch, Calendar,
  CheckCircle, Bookmark, DollarSign, CreditCard, FileText, StickyNote, Sparkles,
} from 'lucide-react'
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

// Per-type visual metadata. Drives the timeline icon + colored
// outline so an agent skimming the history can identify the kind
// of entry at a glance instead of reading every label.
const TYPE_VISUAL: Record<string, { icon: typeof Clock; color: string; bg: string }> = {
  call:              { icon: Phone,        color: '#0579DA', bg: '#0579DA15' },
  whatsapp_call:     { icon: Phone,        color: '#25D366', bg: '#25D36615' },
  whatsapp_message:  { icon: MessageCircle, color: '#25D366', bg: '#25D36615' },
  sms:               { icon: MessageCircle, color: '#3782FF', bg: '#3782FF15' },
  email:             { icon: Mail,         color: '#A855F7', bg: '#A855F715' },
  stage_change:      { icon: GitBranch,    color: '#FF9A1E', bg: '#FF9A1E15' },
  visit_planned:     { icon: Calendar,     color: '#FF9A1E', bg: '#FF9A1E15' },
  visit_confirmed:   { icon: Calendar,     color: '#3782FF', bg: '#3782FF15' },
  visit_completed:   { icon: CheckCircle,  color: '#A855F7', bg: '#A855F715' },
  reservation:       { icon: Bookmark,     color: '#06B6D4', bg: '#06B6D415' },
  sale:              { icon: DollarSign,   color: '#00D4A0', bg: '#00D4A015' },
  payment:           { icon: CreditCard,   color: '#00D4A0', bg: '#00D4A015' },
  document:          { icon: FileText,     color: '#7F96B7', bg: '#7F96B715' },
  note:              { icon: StickyNote,   color: '#7F96B7', bg: '#7F96B715' },
  ai_task:           { icon: Sparkles,     color: '#A855F7', bg: '#A855F715' },
}

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
          <Plus className="me-1 h-3.5 w-3.5" /> {t('action.add')}
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
        <div className="space-y-5">
          {Array.from(grouped.entries()).map(([day, items]) => (
            <div key={day}>
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">
                {format(new Date(day), 'EEEE d MMMM yyyy', { locale: dateLocale })}
              </p>
              {/* Vertical timeline. Each row gets a colored circle
                  icon, a dashed connector line down to the next, the
                  type label + description + agent + time. */}
              <div className="relative space-y-3 ps-2">
                {items.map((e, idx) => {
                  const type = e.type as HistoryType
                  const meta = HISTORY_TYPE_LABELS[type]
                  const visual = TYPE_VISUAL[type] ?? TYPE_VISUAL.note
                  const Icon = visual.icon
                  const agent = e.users as { first_name: string; last_name: string } | null
                  const title = (e.title as string) ?? meta?.label ?? type
                  const description = e.description as string | null
                  const isLast = idx === items.length - 1
                  return (
                    <div key={e.id as string} className="relative flex gap-3">
                      {/* Vertical line connecting timeline dots */}
                      {!isLast && (
                        <span
                          className="absolute left-[15px] top-8 bottom-[-12px] w-px bg-immo-border-default"
                          aria-hidden
                        />
                      )}
                      {/* Icon disc */}
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: visual.bg, color: visual.color }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      {/* Body */}
                      <div className="min-w-0 flex-1 rounded-lg border border-immo-border-default bg-immo-bg-card px-3 py-2">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="text-sm font-medium text-immo-text-primary">
                            {meta?.label ?? type}
                          </span>
                          <span className="text-[11px] text-immo-text-muted">
                            {format(new Date(e.created_at as string), 'HH:mm')}
                          </span>
                          {agent && (
                            <span className="text-[11px] text-immo-text-muted">
                              · {agent.first_name} {agent.last_name}
                            </span>
                          )}
                        </div>
                        {/* Title (the free-text description from the
                            history row) + optional description body.
                            whitespace-pre-line so multi-line metadata
                            (e.g. visit feedback) renders properly. */}
                        {title && title !== meta?.label && (
                          <p className="mt-1 whitespace-pre-line text-sm text-immo-text-secondary">
                            {title}
                          </p>
                        )}
                        {description && (
                          <p className="mt-1 whitespace-pre-line text-xs text-immo-text-muted">
                            {description}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {entries.length >= limit && (
            <button onClick={() => setLimit((l) => l + 20)} className="w-full rounded-lg border border-immo-border-default py-2 text-xs text-immo-text-muted hover:bg-immo-bg-card-hover">
              Voir plus
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
