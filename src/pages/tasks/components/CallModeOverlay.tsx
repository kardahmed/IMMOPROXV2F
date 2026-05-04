// Full-screen "Mode Appel" overlay — opens when an agent starts a CALL
// task. Shares the rich script body with the pipeline CallScriptModal
// (questions with branching responses, AI objection handler, talking
// points, outro) so an agent gets the same surface no matter where the
// call started.
//
// Outcomes mapped to the existing tasks columns:
//   ✓ Appel réussi  → status='done', completed_at=NOW(), client_response=notes,
//                     executed_at=NOW(); insert history line.
//   ⏰ Pas répondu   → status='pending', executed_at=NOW(),
//                     client_response=notes. The check-tasks-no-reply
//                     cron picks it up at +48h to schedule a relance.
//   📅 Replanifier   → due_at + scheduled_at = chosen datetime,
//                     executed_at=NULL, client_response=notes prefix.

import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  X, Phone, CheckCircle, Clock, CalendarClock, Loader2, User, Sparkles,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { appendClientNote } from '@/lib/clientNotes'
import toast from 'react-hot-toast'
import { CallScriptBody, type CallScript, type ClientQA } from '@/pages/pipeline/components/CallScriptBody'
import { formatSecondsAsMmss } from '@/lib/format'
import type { PipelineStage } from '@/types'

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
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [clientQA, setClientQA] = useState<ClientQA[]>([])
  const [script, setScript] = useState<CallScript | null>(null)
  const [reschedAt, setReschedAt] = useState('')
  const [reschedOpen, setReschedOpen] = useState(false)
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    if (isOpen) {
      setTimer(0)
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isOpen])

  function refreshTasks() {
    qc.invalidateQueries({ queryKey: ['tasks'] })
    qc.invalidateQueries({ queryKey: ['all-tasks'] })
    qc.invalidateQueries({ queryKey: ['client-tasks', task.client_id] })
    qc.invalidateQueries({ queryKey: ['client-notes', task.client_id] })
  }

  // Build the "full notes" string saved to history + clients.notes —
  // includes the agent notes, the Q&A pairs from the objection panel,
  // and any answered script questions. Same shape used by CallScriptModal.
  function buildNotesPayload(): string {
    const parts: string[] = []
    if (notes.trim()) parts.push(notes.trim())
    const answered = Object.entries(answers).filter(([, v]) => v != null && v !== '')
    if (answered.length > 0) {
      const lines = answered.map(([qId, v]) => {
        const q = script?.questions.find(x => x.id === qId)
        const label = q?.question ?? qId
        const value = Array.isArray(v) ? v.join(', ') : String(v)
        return `• ${label} : ${value}`
      })
      parts.push(`Réponses script :\n${lines.join('\n')}`)
    }
    if (clientQA.length > 0) {
      const lines = clientQA.map(qa => `Q : ${qa.question}\nR : ${qa.answer}`)
      parts.push(`Objections client :\n${lines.join('\n\n')}`)
    }
    return parts.join('\n\n')
  }

  const success = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString()
      const fullNotes = buildNotesPayload()
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'done',
          completed_at: now,
          executed_at: now,
          client_response: fullNotes || null,
        } as never)
        .eq('id', task.id)
      if (error) throw new Error(handleSupabaseError(error))

      await supabase.from('history').insert({
        tenant_id: task.tenant_id,
        client_id: task.client_id,
        agent_id: task.agent_id,
        type: 'call',
        title: `Appel réussi (${Math.floor(timer / 60)}min) : ${task.title}`,
        description: fullNotes || null,
        metadata: { duration: timer, mode: script?.mode },
      } as never)

      await appendClientNote(task.client_id, `✓ Appel réussi — ${task.title}`, fullNotes)
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
      const fullNotes = buildNotesPayload()
      const { error } = await supabase
        .from('tasks')
        .update({
          executed_at: now,
          client_response: fullNotes || null,
        } as never)
        .eq('id', task.id)
      if (error) throw new Error(handleSupabaseError(error))

      await supabase.from('history').insert({
        tenant_id: task.tenant_id,
        client_id: task.client_id,
        agent_id: task.agent_id,
        type: 'call',
        title: `Appel sans réponse: ${task.title}`,
        description: fullNotes || null,
      } as never)

      await appendClientNote(task.client_id, `⏰ Appel sans réponse — ${task.title}`, fullNotes)
    },
    onSuccess: () => {
      toast.success(t('toast.no_answer_relance'))
      refreshTasks()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const reschedule = useMutation({
    mutationFn: async () => {
      if (!reschedAt) throw new Error('Choisissez une nouvelle date')
      const newAt = new Date(reschedAt).toISOString()
      const fullNotes = buildNotesPayload()
      const { error } = await supabase
        .from('tasks')
        .update({
          due_at: newAt,
          scheduled_at: newAt,
          executed_at: null,
          client_response: fullNotes
            ? `Replanifié: ${fullNotes}`
            : 'Replanifié',
        } as never)
        .eq('id', task.id)
      if (error) throw new Error(handleSupabaseError(error))

      const niceDate = new Date(reschedAt).toLocaleString('fr-FR')
      await appendClientNote(
        task.client_id,
        `📅 Replanifié au ${niceDate} — ${task.title}`,
        fullNotes,
      )
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
  const formatTime = formatSecondsAsMmss

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-immo-border-default px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-immo-accent-blue">
            <Phone className="h-3.5 w-3.5" /> Mode Appel
            {script?.mode === 'ai' && <span className="ms-1 flex items-center gap-1 text-blue-500"><Sparkles className="h-3 w-3" /> IA</span>}
          </div>
          <h1 className="mt-1 truncate text-lg font-semibold text-immo-text-primary">{task.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-lg bg-immo-accent-blue/10 px-3 py-1.5">
            <Clock className="h-4 w-4 text-immo-accent-blue" />
            <span className="font-mono text-sm font-bold text-immo-accent-blue">{formatTime(timer)}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Body — client card + shared script */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-immo-border-default bg-immo-bg-page p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-immo-accent-blue/10 text-immo-accent-blue">
            <User className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-immo-text-primary">{clientName}</p>
            <p className="truncate text-xs text-immo-text-secondary">{phone ?? 'Numéro indisponible'}</p>
          </div>
        </div>

        {task.client_id && task.agent_id && (
          <CallScriptBody
            clientId={task.client_id}
            clientName={clientName}
            clientStage={task.stage as PipelineStage}
            tenantId={task.tenant_id}
            agentId={task.agent_id}
            notes={notes}
            onNotesChange={setNotes}
            answers={answers}
            onAnswersChange={setAnswers}
            clientQA={clientQA}
            onClientQAChange={setClientQA}
            onScriptLoaded={setScript}
            /* keep notes inline — overlay has no sidebar */
          />
        )}

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
