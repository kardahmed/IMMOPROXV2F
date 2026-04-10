import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Calendar, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// native <select> used instead of base-ui Select for pre-selected values
import { StatusBadge, EmptyState, Modal } from '@/components/common'
import { VISIT_STATUS_LABELS } from '@/types'
import type { VisitStatus } from '@/types'
import { format, isAfter } from 'date-fns'
import toast from 'react-hot-toast'
import { inputClass } from './shared'

export function VisitsTab({ clientId, tenantId }: { clientId: string; tenantId: string }) {
  const { t } = useTranslation()
  const [showCreate, setShowCreate] = useState(false)
  const userId = useAuthStore((s) => s.session?.user?.id)
  const qc = useQueryClient()

  const { data: visits = [], isLoading } = useQuery({
    queryKey: ['client-visits', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visits')
        .select('*, users!visits_agent_id_fkey(first_name, last_name)')
        .eq('client_id', clientId)
        .order('scheduled_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as unknown as Array<Record<string, unknown>>
    },
  })

  const createVisit = useMutation({
    mutationFn: async (input: { scheduled_at: string; visit_type: string; notes: string }) => {
      const { error } = await supabase.from('visits').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: userId!,
        scheduled_at: input.scheduled_at, visit_type: input.visit_type, notes: input.notes || null,
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-visits', clientId] })
      toast.success(t('success.created'))
      setShowCreate(false)
    },
  })

  const now = new Date()
  const upcoming = visits.filter((v) => isAfter(new Date(v.scheduled_at as string), now))
  const past = visits.filter((v) => !isAfter(new Date(v.scheduled_at as string), now))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-immo-text-secondary">
          {upcoming.length} {t('status.planned').toLowerCase()}, {past.length} {t('status.completed').toLowerCase()}
        </p>
        <Button onClick={() => setShowCreate(true)} className="bg-immo-accent-green text-xs font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
          <Plus className="mr-1 h-3.5 w-3.5" /> {t('tab.visits')}
        </Button>
      </div>

      {visits.length === 0 && !isLoading ? (
        <EmptyState icon={<Calendar className="h-10 w-10" />} title={t('common.no_data')} />
      ) : (
        <>
          {upcoming.length > 0 && <VisitList title={t('status.planned')} visits={upcoming} />}
          {past.length > 0 && <VisitList title={t('status.completed')} visits={past} />}
        </>
      )}

      <CreateVisitModal isOpen={showCreate} onClose={() => setShowCreate(false)} onSubmit={(d) => createVisit.mutate(d)} loading={createVisit.isPending} />
    </div>
  )
}

function VisitList({ title, visits }: { title: string; visits: Array<Record<string, unknown>> }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold text-immo-text-muted uppercase">{title}</h4>
      <div className="space-y-2">
        {visits.map((v) => {
          const st = VISIT_STATUS_LABELS[(v.status as VisitStatus)] ?? { label: v.status as string, color: '#7F96B7' }
          const agent = v.users as { first_name: string; last_name: string } | null
          return (
            <div key={v.id as string} className="flex items-center gap-4 rounded-lg border border-immo-border-default bg-immo-bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-immo-text-primary">{format(new Date(v.scheduled_at as string), 'dd/MM/yyyy HH:mm')}</p>
                <p className="text-[11px] text-immo-text-muted">{v.visit_type as string} {agent ? `· ${agent.first_name} ${agent.last_name}` : ''}</p>
              </div>
              <StatusBadge label={st.label} type={st.color === '#00D4A0' ? 'green' : st.color === '#FF4949' ? 'red' : st.color === '#FF9A1E' ? 'orange' : 'muted'} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CreateVisitModal({ isOpen, onClose, onSubmit, loading }: {
  isOpen: boolean; onClose: () => void; onSubmit: (d: { scheduled_at: string; visit_type: string; notes: string }) => void; loading: boolean
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('10:00')
  const [type, setType] = useState('on_site')
  const [notes, setNotes] = useState('')

  function handle() {
    if (!date) return
    onSubmit({ scheduled_at: `${date}T${time}:00`, visit_type: type, notes })
    setDate(''); setTime('10:00'); setNotes('')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('tab.visits')} size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs text-immo-text-secondary">{t('field.date')} *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></div>
          <div><Label className="text-xs text-immo-text-secondary">Heure</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} /></div>
        </div>
        <div>
          <Label className="text-xs text-immo-text-secondary">{t('field.type')}</Label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}
          >
            <option value="on_site">Sur site</option>
            <option value="office">Au bureau</option>
            <option value="virtual">Virtuelle</option>
          </select>
        </div>
        <div><Label className="text-xs text-immo-text-secondary">{t('field.notes')}</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes..." className={inputClass} /></div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary">{t('action.cancel')}</Button>
          <Button onClick={handle} disabled={!date || loading} className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
            {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" /> : t('action.create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
