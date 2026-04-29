// Full-screen "Mode Appel" overlay — opens when an agent starts a CALL
// task. Designed for the field-agent workflow: read the AI-generated
// script while talking to the client, take notes in parallel, then
// log the outcome in one tap when the call ends.
//
// Triggered from TaskDetailModal's primary CTA when task.channel ===
// 'call'. The script is fetched from generate-call-script via the
// same react-query key the modal uses, so the cache is shared and
// opening the overlay doesn't cost an extra Anthropic call.
//
// Outcomes mapped to the existing tasks columns:
//   ✓ Appel réussi  → status='done', completed_at=NOW(), client_response=notes,
//                     executed_at=NOW(); insert history line.
//   ⏰ Pas répondu   → status='pending', executed_at=NOW(),
//                     client_response=notes. The check-tasks-no-reply
//                     cron picks it up at +48h to schedule a relance.
//   📅 Replanifier   → due_at + scheduled_at = chosen datetime,
//                     executed_at=NULL, client_response=notes prefix.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  X, Phone, Sparkles, CheckCircle, Clock, CalendarClock, Loader2, User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import toast from 'react-hot-toast'

interface Task {
  id: string
  tenant_id: string
  client_id: string | null
  agent_id: string | null
  title: string
  channel: string
  stage: string
  client?: { full_name?: string | null; phone?: string | null } | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  task: Task
}

export function CallModeOverlay({ isOpen, onClose, task }: Props) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [reschedAt, setReschedAt] = useState('')
  const [reschedOpen, setReschedOpen] = useState(false)

  // Same react-query key as TaskDetailModal so the script payload is
  // shared from the cache when the overlay opens.
  const { data: callScript, isLoading: scriptLoading, refetch: refetchScript } = useQuery({
    queryKey: ['ai-call-script', task.client_id, task.id],
    enabled: isOpen && !!task.client_id,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Session expirée')
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-call-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ client_id: task.client_id }),
      })
      if (!res.ok) {
        if (res.status === 403) return null
        throw new Error(`Script generation failed (${res.status})`)
      }
      return await res.json() as {
        intro?: string
        talking_points?: string[]
        outro?: string
        suggested_action?: string | null
        questions?: Array<{ id: string; question: string; type: string }>
      }
    },
  })

  function refreshTasks() {
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['all-tasks'] })
    qc.invalidateQueries({ queryKey: ['client-tasks', task.client_id] })
  }

  const success = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'done',
          completed_at: now,
          executed_at: now,
          client_response: notes.trim() || null,
        } as never)
        .eq('id', task.id)
      if (error) throw new Error(handleSupabaseError(error))

      // History line so the client detail page reflects the outcome.
      await supabase.from('history').insert({
        tenant_id: task.tenant_id,
        client_id: task.client_id,
        agent_id: task.agent_id,
        type: 'call',
        title: `Appel réussi: ${task.title}`,
        description: notes.trim() || null,
      } as never)
    },
    onSuccess: () => {
      toast.success('Appel marqué comme réussi')
      refreshTasks()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const noAnswer = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('tasks')
        .update({
          executed_at: now,
          client_response: notes.trim() || null,
        } as never)
        .eq('id', task.id)
      if (error) throw new Error(handleSupabaseError(error))

      await supabase.from('history').insert({
        tenant_id: task.tenant_id,
        client_id: task.client_id,
        agent_id: task.agent_id,
        type: 'call',
        title: `Appel sans réponse: ${task.title}`,
        description: notes.trim() || null,
      } as never)
    },
    onSuccess: () => {
      toast.success('Marqué "pas de réponse" — relance auto dans 48h')
      refreshTasks()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const reschedule = useMutation({
    mutationFn: async () => {
      if (!reschedAt) throw new Error('Choisissez une nouvelle date')
      const newAt = new Date(reschedAt).toISOString()
      const { error } = await supabase
        .from('tasks')
        .update({
          due_at: newAt,
          scheduled_at: newAt,
          executed_at: null,
          client_response: notes.trim()
            ? `Replanifié: ${notes.trim()}`
            : 'Replanifié',
        } as never)
        .eq('id', task.id)
      if (error) throw new Error(handleSupabaseError(error))
    },
    onSuccess: () => {
      toast.success(`Replanifié à ${new Date(reschedAt).toLocaleString('fr-FR')}`)
      refreshTasks()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  if (!isOpen) return null

  const phone = task.client?.phone ?? null
  const phoneTel = phone ? phone.replace(/[\s()-]/g, '') : null
  const clientName = task.client?.full_name ?? 'Client'

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-immo-border-default px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-immo-accent-blue">
            <Phone className="h-3.5 w-3.5" /> Mode Appel
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold text-immo-text-primary">{task.title}</h1>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* Client + script (scrollable middle) */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {/* Client card */}
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-immo-border-default bg-immo-bg-page p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-immo-accent-blue/10 text-immo-accent-blue">
            <User className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-immo-text-primary">{clientName}</p>
            <p className="truncate text-xs text-immo-text-secondary">{phone ?? 'Numéro indisponible'}</p>
          </div>
        </div>

        {/* AI Script */}
        <section className="rounded-xl border border-immo-accent-blue/30 bg-immo-accent-blue/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-immo-accent-blue">
              <Sparkles className="h-4 w-4" />
              Script d'appel personnalisé
            </h2>
            <button
              onClick={() => refetchScript()}
              disabled={scriptLoading}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-immo-accent-blue hover:bg-immo-accent-blue/10 disabled:opacity-50"
            >
              {scriptLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Régénérer
            </button>
          </div>

          {scriptLoading && !callScript && (
            <div className="flex items-center gap-2 py-6 text-sm text-immo-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              L'IA prépare votre script...
            </div>
          )}

          {callScript === null && (
            <p className="text-sm italic text-immo-text-secondary">
              Les scripts d'appel IA ne sont pas inclus dans votre plan.
            </p>
          )}

          {callScript && (
            <div className="space-y-4 text-sm text-immo-text-primary">
              {callScript.intro && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">📝 Introduction</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-white/70 p-3 leading-relaxed">{callScript.intro}</p>
                </div>
              )}
              {callScript.talking_points && callScript.talking_points.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">🎯 Points à aborder</p>
                  <ol className="list-inside list-decimal space-y-1.5 rounded-lg bg-white/70 p-3 leading-relaxed">
                    {callScript.talking_points.map((p, i) => (<li key={i}>{p}</li>))}
                  </ol>
                </div>
              )}
              {callScript.questions && callScript.questions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">❓ Questions à poser</p>
                  <ol className="list-inside list-decimal space-y-1.5 rounded-lg bg-white/70 p-3 leading-relaxed">
                    {callScript.questions.map((q) => (<li key={q.id}>{q.question}</li>))}
                  </ol>
                </div>
              )}
              {callScript.outro && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">🎯 Closing</p>
                  <p className="whitespace-pre-wrap rounded-lg bg-white/70 p-3 leading-relaxed">{callScript.outro}</p>
                </div>
              )}
              {callScript.suggested_action && (
                <div className="rounded-lg border border-immo-accent-green/30 bg-immo-accent-green/10 p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-immo-accent-green">⭐ Action recommandée</p>
                  <p>{callScript.suggested_action}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Notes */}
        <section className="mt-4">
          <label htmlFor="call-notes" className="mb-1.5 block text-xs font-semibold text-immo-text-primary">
            📝 Notes pendant l'appel
          </label>
          <textarea
            id="call-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tapez les points importants pendant que vous parlez au client..."
            rows={4}
            className="w-full rounded-lg border border-immo-border-default bg-white p-3 text-sm text-immo-text-primary placeholder:text-immo-text-tertiary focus:border-immo-accent-blue focus:outline-none focus:ring-1 focus:ring-immo-accent-blue"
          />
        </section>

        {/* Reschedule sub-form */}
        {reschedOpen && (
          <section className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <p className="mb-2 text-xs font-semibold text-orange-900">Choisissez une nouvelle date pour rappeler ce client :</p>
            <input
              type="datetime-local"
              value={reschedAt}
              onChange={(e) => setReschedAt(e.target.value)}
              className="w-full rounded-lg border border-orange-300 bg-white p-2 text-sm focus:border-orange-500 focus:outline-none"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => reschedule.mutate()}
                disabled={!reschedAt || reschedule.isPending}
                className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {reschedule.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Confirmer la nouvelle date'}
              </button>
              <button
                onClick={() => { setReschedOpen(false); setReschedAt('') }}
                className="rounded-lg border border-immo-border-default px-3 py-2 text-sm font-medium text-immo-text-secondary hover:bg-immo-bg-card-hover"
              >
                Annuler
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Footer — sticky action bar */}
      <footer className="shrink-0 border-t border-immo-border-default bg-white px-4 py-3 sm:px-6">
        {/* Big tel: button — primary CTA */}
        {phoneTel ? (
          <a
            href={`tel:${phoneTel}`}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-immo-accent-blue px-4 py-3.5 text-base font-semibold text-white shadow-md transition-colors hover:bg-immo-accent-blue/90"
          >
            <Phone className="h-5 w-5" />
            Composer {phone}
          </a>
        ) : (
          <p className="mb-3 rounded-xl bg-immo-bg-page p-3 text-center text-sm italic text-immo-text-secondary">
            Aucun numéro renseigné pour ce client
          </p>
        )}

        {/* Outcome buttons */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => success.mutate()}
            disabled={success.isPending}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-green-300 bg-green-50 px-2 py-2.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            Appel réussi
          </button>
          <button
            onClick={() => noAnswer.mutate()}
            disabled={noAnswer.isPending}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2 py-2.5 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50"
          >
            <Clock className="h-4 w-4" />
            Pas répondu
          </button>
          <button
            onClick={() => setReschedOpen(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-lg border border-immo-border-default bg-immo-bg-page px-2 py-2.5 text-xs font-semibold text-immo-text-primary transition-colors hover:bg-immo-bg-card-hover"
          >
            <CalendarClock className="h-4 w-4" />
            Replanifier
          </button>
        </div>
      </footer>
    </div>
  )
}
