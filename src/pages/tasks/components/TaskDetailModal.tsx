import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, MessageCircle, Phone, Mail, Copy, ExternalLink, Sparkles,
  CheckCircle, XCircle, User, Building2, GitBranch, Clock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
// import { Button } from '@/components/ui/button'
import { PIPELINE_STAGES } from '@/types'
import { calculateUrgencyScore, suggestNextAction } from '@/hooks/useTaskScoring'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

interface ClientTask {
  id: string; title: string; stage: string; status: string; priority: string
  channel: string; scheduled_at: string | null; created_at: string
  client_id: string; agent_id: string | null; tenant_id: string
  client?: { full_name: string; phone: string; pipeline_stage: string } | null
  agent?: { first_name: string; last_name: string } | null
}

const CHANNEL_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  whatsapp: { label: 'WhatsApp', color: 'text-[#25D366]', bg: 'bg-[#25D366]/10' },
  sms: { label: 'SMS', color: 'text-immo-status-orange', bg: 'bg-immo-status-orange/10' },
  call: { label: 'Appel', color: 'text-immo-accent-blue', bg: 'bg-immo-accent-blue/10' },
  email: { label: 'Email', color: 'text-immo-accent-blue', bg: 'bg-immo-accent-blue/10' },
  system: { label: 'Systeme', color: 'text-immo-text-muted', bg: 'bg-immo-bg-primary' },
}

const TONES = [
  { value: 'professional', label: 'Professionnel' },
  { value: 'friendly', label: 'Amical' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'formal', label: 'Formel' },
]

interface Props {
  task: ClientTask
  isOpen: boolean
  onClose: () => void
}

export function TaskDetailModal({ task, isOpen, onClose }: Props) {
  const navigate = useNavigate()
  const userId = useAuthStore(s => s.session?.user?.id)
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()

  const [tone, setTone] = useState('professional')
  const [generatingAI, setGeneratingAI] = useState(false)
  const [clientResponse, setClientResponse] = useState('')
  const [reminderDays, setReminderDays] = useState('')
  const urgencyScore = calculateUrgencyScore(task)
  const nextAction = task.client ? suggestNextAction({ pipeline_stage: task.client.pipeline_stage, last_contact_at: null, confirmed_budget: null, visit_note: null }) : ''

  // Fetch agent + tenant info
  const { data: context } = useQuery({
    queryKey: ['task-detail-context', userId, tenantId],
    queryFn: async () => {
      const [agentRes, tenantRes] = await Promise.all([
        supabase.from('users').select('first_name, last_name, phone').eq('id', userId!).single(),
        supabase.from('tenants').select('name, phone, email').eq('id', tenantId!).single(),
      ])
      const a = agentRes.data as Record<string, string> | null
      const t = tenantRes.data as Record<string, string> | null
      return { agentName: `${a?.first_name ?? ''} ${a?.last_name ?? ''}`.trim(), agentPrenom: a?.first_name ?? '', agentPhone: a?.phone ?? '', agence: t?.name ?? '' }
    },
    enabled: isOpen && !!userId && !!tenantId,
  })

  // Fetch message template
  const { data: msgTemplate } = useQuery({
    queryKey: ['task-msg-tpl', task.stage, task.channel, tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('message_templates').select('body').eq('tenant_id', tenantId!).eq('stage', task.stage).limit(1).maybeSingle()
      return (data as { body: string } | null)?.body ?? null
    },
    enabled: isOpen && !!tenantId,
  })

  // Build message with variables replaced
  function buildMessage(template?: string | null): string {
    const base = template ?? msgTemplate ?? `Bonjour {client_prenom},\n\nJe suis {agent_prenom} de {agence}.\n\n${task.title}\n\nCordialement,\n{agent_prenom}\n{agent_phone}`
    const clientName = task.client?.full_name ?? ''
    const parts = clientName.split(' ')
    return base
      .replace(/\\n/g, '\n')
      .replace(/\{client_nom\}/g, clientName)
      .replace(/\{client_prenom\}/g, parts[0] ?? '')
      .replace(/\{client_phone\}/g, task.client?.phone ?? '')
      .replace(/\{agent_nom\}/g, context?.agentName ?? '')
      .replace(/\{agent_prenom\}/g, context?.agentPrenom ?? '')
      .replace(/\{agent_phone\}/g, context?.agentPhone ?? '')
      .replace(/\{agence\}/g, context?.agence ?? '')
      .replace(/\{projet\}/g, '')
      .replace(/\{prix_min\}/g, '')
      .replace(/\{date_visite\}/g, '')
      .replace(/\{heure_visite\}/g, '')
      .replace(/\{adresse_projet\}/g, '')
  }

  const [message, setMessage] = useState('')

  // Init message when modal opens
  useState(() => {
    if (isOpen) setMessage(buildMessage())
  })

  // If message is empty, build it
  if (!message && isOpen && context) {
    setMessage(buildMessage())
  }

  const completeTask = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const { error } = await supabase.from('tasks').update({
        status: 'done',
        completed_at: now,
        executed_at: now,
        message_sent: message,
        client_response: clientResponse || null,
      }).eq('id', task.id)
      // Log sent message
      await supabase.from('sent_messages_log').insert({ tenant_id: task.tenant_id, client_id: task.client_id, agent_id: userId, task_id: task.id, channel: task.channel, message } as never)
      if (error) { handleSupabaseError(error); throw error }
      await supabase.from('history').insert({ tenant_id: task.tenant_id, client_id: task.client_id, agent_id: userId, type: task.channel === 'whatsapp' ? 'whatsapp_message' : task.channel === 'sms' ? 'sms' : 'call', title: `Tache executee: ${task.title}` } as never)
      await supabase.from('clients').update({ last_contact_at: new Date().toISOString() }).eq('id', task.client_id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-tasks'] }); toast.success('Tâche marquée comme exécutée'); onClose() },
  })

  const rejectTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tasks').update({ status: 'ignored' }).eq('id', task.id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-tasks'] }); toast.success('Tâche rejetée'); onClose() },
  })

  function openWhatsApp() {
    const phone = (task.client?.phone ?? '').replace(/\s+/g, '').replace(/^0/, '213')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  function openSMS() {
    window.open(`sms:${task.client?.phone ?? ''}?body=${encodeURIComponent(message)}`, '_blank')
  }

  function openCall() {
    window.open(`tel:${task.client?.phone ?? ''}`, '_blank')
  }

  function copyMessage() {
    navigator.clipboard.writeText(message)
    toast.success('Message copié')
  }

  async function generateWithAI() {
    setGeneratingAI(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Session expirée'); return }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-call-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ client_id: task.client_id }),
      })

      if (res.ok) {
        const data = await res.json()
        const intro = data.intro ?? ''
        const outro = data.outro ?? ''
        setMessage(`${intro}\n\n${outro}`)
        toast.success('Message généré par IA')
      } else {
        toast.error('Erreur génération IA')
      }
    } catch { toast.error('Erreur génération IA') }
    finally { setGeneratingAI(false) }
  }

  if (!isOpen) return null

  const ch = CHANNEL_BADGE[task.channel] ?? CHANNEL_BADGE.system
  const stageInfo = PIPELINE_STAGES[task.stage as keyof typeof PIPELINE_STAGES]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-immo-border-default bg-immo-bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-immo-border-default px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-immo-text-primary">{task.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ch.bg} ${ch.color}`}>
                <MessageCircle className="h-2.5 w-2.5" /> {ch.label}
              </span>
              {stageInfo && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: stageInfo.color + '15', color: stageInfo.color }}>{stageInfo.label}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${task.priority === 'high' || task.priority === 'urgent' ? 'bg-immo-status-red/10 text-immo-status-red' : 'bg-immo-bg-primary text-immo-text-muted'}`}>
                Priorite: {task.priority}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${urgencyScore >= 70 ? 'bg-immo-status-red/10 text-immo-status-red' : urgencyScore >= 40 ? 'bg-immo-status-orange/10 text-immo-status-orange' : 'bg-immo-accent-green/10 text-immo-accent-green'}`}>
                Urgence: {urgencyScore}/100
              </span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {/* Client info */}
          <div className="rounded-xl border border-immo-border-default bg-immo-bg-primary p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-immo-text-primary">
              <User className="h-3.5 w-3.5" /> Informations Client
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-immo-text-muted">Nom:</span> <span className="font-medium text-immo-text-primary">{task.client?.full_name ?? '-'}</span></div>
              <div><span className="text-immo-text-muted">Telephone:</span> <span className="font-medium text-immo-text-primary">{task.client?.phone ?? '-'}</span></div>
              <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-immo-text-muted" /><span className="text-immo-text-muted">Agent:</span> <span className="font-medium text-immo-text-primary">{context?.agentName ?? '-'} · {context?.agentPhone ?? ''}</span></div>
              <div className="flex items-center gap-1"><GitBranch className="h-3 w-3 text-immo-text-muted" /><span className="text-immo-text-muted">Etape:</span> {stageInfo && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ backgroundColor: stageInfo.color + '15', color: stageInfo.color }}>{stageInfo.label}</span>}</div>
            </div>
            {task.scheduled_at && (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-immo-text-muted">
                <Clock className="h-3 w-3" /> Programmee: {format(new Date(task.scheduled_at), 'dd/MM/yyyy HH:mm')}
              </div>
            )}
          </div>

          {/* Actions rapides */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">Actions rapides</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={copyMessage} className="flex items-center gap-1.5 rounded-lg border border-immo-border-default px-3 py-2 text-xs font-medium text-immo-text-primary hover:bg-immo-bg-card-hover transition-colors">
                <Copy className="h-3.5 w-3.5 text-immo-text-muted" /> Copier le message
              </button>
              <button onClick={() => navigate(`/pipeline/clients/${task.client_id}?tab=auto_tasks`)} className="flex items-center gap-1.5 rounded-lg border border-immo-border-default px-3 py-2 text-xs font-medium text-immo-text-primary hover:bg-immo-bg-card-hover transition-colors">
                <ExternalLink className="h-3.5 w-3.5 text-immo-text-muted" /> Voir Dossier Client
              </button>
              <button onClick={openWhatsApp} className="flex items-center gap-1.5 rounded-lg border border-[#25D366]/30 bg-[#25D366]/5 px-3 py-2 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/10 transition-colors">
                <MessageCircle className="h-3.5 w-3.5" /> Ouvrir WhatsApp
              </button>
              <button onClick={openCall} className="flex items-center gap-1.5 rounded-lg border border-immo-accent-blue/30 bg-immo-accent-blue/5 px-3 py-2 text-xs font-medium text-immo-accent-blue hover:bg-immo-accent-blue/10 transition-colors">
                <Phone className="h-3.5 w-3.5" /> Appeler
              </button>
              <button onClick={openSMS} className="flex items-center gap-1.5 rounded-lg border border-immo-status-orange/30 bg-immo-status-orange/5 px-3 py-2 text-xs font-medium text-immo-status-orange hover:bg-immo-status-orange/10 transition-colors">
                <Mail className="h-3.5 w-3.5" /> Envoyer SMS
              </button>
            </div>
          </div>

          {/* Message editable */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-immo-text-primary">Message (modifiable)</p>
              <div className="flex items-center gap-2">
                <select value={tone} onChange={e => setTone(e.target.value)} className="h-7 rounded-md border border-immo-border-default bg-immo-bg-primary px-2 text-[10px] text-immo-text-primary">
                  {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button onClick={generateWithAI} disabled={generatingAI}
                  className="flex items-center gap-1 rounded-lg bg-purple-50 border border-purple-200 px-2.5 py-1 text-[10px] font-semibold text-purple-600 hover:bg-purple-100 transition-colors disabled:opacity-50">
                  {generatingAI ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" /> : <Sparkles className="h-3 w-3" />}
                  Generer IA
                </button>
              </div>
            </div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={6}
              className="w-full rounded-xl border border-immo-border-default bg-immo-bg-primary p-4 text-sm text-immo-text-primary leading-relaxed focus:border-immo-accent-green focus:outline-none" />
          </div>

          {/* Suggestion */}
          {nextAction && (
            <div className="rounded-lg border border-immo-accent-blue/20 bg-immo-accent-blue/5 px-3 py-2">
              <p className="text-[10px] font-semibold text-immo-accent-blue">Prochaine action suggeree</p>
              <p className="text-xs text-immo-text-primary">{nextAction}</p>
            </div>
          )}

          {/* Client response */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-immo-text-muted">Reponse du client (apres execution)</label>
            <textarea value={clientResponse} onChange={e => setClientResponse(e.target.value)} rows={2} placeholder="Ex: Interesse, veut visiter samedi..."
              className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-xs text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:outline-none" />
          </div>

          {/* Reminder */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-semibold text-immo-text-muted">Rappel dans</label>
            <select value={reminderDays} onChange={e => setReminderDays(e.target.value)}
              className="h-7 rounded-md border border-immo-border-default bg-immo-bg-primary px-2 text-xs text-immo-text-primary">
              <option value="">Pas de rappel</option>
              <option value="1">1 jour</option>
              <option value="2">2 jours</option>
              <option value="3">3 jours</option>
              <option value="5">5 jours</option>
              <option value="7">1 semaine</option>
              <option value="14">2 semaines</option>
              <option value="30">1 mois</option>
            </select>
            {reminderDays && <span className="text-[10px] text-immo-accent-green">Un rappel sera cree automatiquement</span>}
          </div>

          {/* Client phone */}
          <div className="flex items-center gap-2 rounded-lg bg-immo-bg-primary px-3 py-2 text-xs">
            <Phone className="h-3.5 w-3.5 text-immo-text-muted" />
            <span className="text-immo-text-muted">Telephone:</span>
            <span className="font-medium text-immo-text-primary">{task.client?.phone ?? '-'}</span>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-immo-border-default px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-immo-border-default px-4 py-2 text-xs font-medium text-immo-text-secondary hover:bg-immo-bg-card-hover">
            Fermer
          </button>
          <div className="flex gap-2">
            <button onClick={() => rejectTask.mutate()} disabled={rejectTask.isPending}
              className="rounded-lg border border-immo-status-red/30 bg-immo-status-red/5 px-4 py-2 text-xs font-semibold text-immo-status-red hover:bg-immo-status-red/10 transition-colors">
              <XCircle className="mr-1 inline h-3.5 w-3.5" /> Rejeter
            </button>
            <button onClick={() => completeTask.mutate()} disabled={completeTask.isPending}
              className="rounded-lg border border-immo-accent-green/30 bg-immo-accent-green/5 px-4 py-2 text-xs font-semibold text-immo-accent-green hover:bg-immo-accent-green/10 transition-colors">
              <CheckCircle className="mr-1 inline h-3.5 w-3.5" /> Marquer executee
            </button>
            <button onClick={() => { openWhatsApp(); completeTask.mutate() }} disabled={completeTask.isPending}
              className="rounded-lg bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#20BD5A] transition-colors">
              <MessageCircle className="mr-1 inline h-3.5 w-3.5" /> Ouvrir WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
