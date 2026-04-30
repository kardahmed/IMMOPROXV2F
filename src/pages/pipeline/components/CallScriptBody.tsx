// CallScriptBody — shared "main panel" for any call surface.
//
// Both the pipeline CallScriptModal and the tasks CallModeOverlay used
// to render their own variant: the pipeline one had questions with
// conditional responses + an objection AI panel, the tasks one had a
// flat read-only script. Two divergent surfaces meant two scripts to
// maintain and a confusingly different UX depending on where the agent
// started the call from.
//
// This component renders the rich UX (intro → questions with branching
// follow-ups → AI objection handler → talking points → outro) and is
// reused by both consumers. State is lifted to the parent so each
// outer shell owns its own outcome flow (qualified/callback/... vs
// success/no_answer/reschedule).

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, MessageCircle, AlertTriangle, Lightbulb, ArrowRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PipelineStage } from '@/types'

export interface ScriptCondition {
  if?: string
  if_default?: boolean
  then_say: string
  then_next?: string
}

export interface ScriptQuestion {
  id: string
  question: string
  intro?: string
  type: 'text' | 'number' | 'select' | 'radio' | 'checkbox' | 'date'
  options?: string[]
  maps_to?: string
  conditions?: ScriptCondition[]
}

export interface CallScript {
  mode: 'ai' | 'template'
  intro: string
  questions: ScriptQuestion[]
  talking_points: string[]
  outro: string
  suggested_action: string | null
  script_id: string | null
}

export interface ClientQA {
  question: string
  answer: string
  loading: boolean
}

interface Props {
  clientId: string
  clientName: string
  clientStage: PipelineStage
  tenantId: string
  agentId: string
  /** Notes (controlled by parent so it can save them on submit). */
  notes: string
  onNotesChange: (n: string) => void
  /** Q-id → answer (controlled). */
  answers: Record<string, string | string[]>
  onAnswersChange: (next: Record<string, string | string[]>) => void
  /** Client objections + AI answers (controlled). */
  clientQA: ClientQA[]
  onClientQAChange: (next: ClientQA[]) => void
  /** Bubble the loaded script up so the parent can read script_id, suggested_action, etc. */
  onScriptLoaded?: (script: CallScript | null) => void
  /** Hide the notes textarea when the parent renders one elsewhere (overlay layout). */
  hideNotes?: boolean
}

export function CallScriptBody({
  clientId, clientName, clientStage, tenantId, agentId,
  notes, onNotesChange,
  answers, onAnswersChange,
  clientQA, onClientQAChange,
  onScriptLoaded,
  hideNotes = false,
}: Props) {
  const [newQuestion, setNewQuestion] = useState('')

  // Fetch agent + tenant names so we can substitute [nom]/[agent]/[agence]
  // in template strings before rendering them.
  const { data: contextNames } = useQuery({
    queryKey: ['script-context', agentId, tenantId],
    queryFn: async () => {
      const [agentRes, tenantRes] = await Promise.all([
        supabase.from('users').select('first_name, last_name').eq('id', agentId).single(),
        supabase.from('tenants').select('name, phone').eq('id', tenantId).single(),
      ])
      const a = agentRes.data as { first_name?: string; last_name?: string } | null
      const t = tenantRes.data as { name?: string } | null
      return {
        agentName: a ? `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() : 'Agent',
        agencyName: t?.name ?? 'Agence',
      }
    },
    staleTime: 300_000,
  })

  const replaceVars = (text: string) => text
    .replace(/\[nom\]/g, clientName)
    .replace(/\[agent\]/g, contextNames?.agentName ?? 'Agent')
    .replace(/\[agence\]/g, contextNames?.agencyName ?? 'Agence')
    .replace(/\[localisation\]/g, 'notre projet')

  // Fetch the script (AI when feature on, template fallback otherwise).
  const { data: script, isLoading: loadingScript } = useQuery({
    queryKey: ['call-script', clientId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session')

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-call-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ client_id: clientId }),
      })

      if (!response.ok) {
        // DB fallback: a tenant-curated template for the same stage.
        const { data } = await supabase.from('call_scripts')
          .select('*').eq('tenant_id', tenantId).eq('pipeline_stage', clientStage).eq('is_active', true).maybeSingle()

        const d = data as Record<string, unknown> | null
        if (d) return {
          mode: 'template',
          intro: replaceVars((d.intro_text as string) ?? ''),
          questions: (d.questions as ScriptQuestion[]) ?? [],
          talking_points: [],
          outro: replaceVars((d.outro_text as string) ?? ''),
          suggested_action: null,
          script_id: (d.id as string) ?? null,
        } satisfies CallScript

        return null
      }

      const result = await response.json() as CallScript
      if (result.mode === 'template') {
        result.intro = replaceVars(result.intro)
        result.outro = replaceVars(result.outro)
      }
      return result
    },
    enabled: !!clientId,
  })

  // Bubble the script up to the parent so it can grab script_id /
  // suggested_action. Audit (HIGH): the previous version called
  // queueMicrotask in render — if the parent setState in
  // onScriptLoaded triggered a re-render, we re-queued the same
  // microtask in a loop. useEffect with [script] as dep runs once
  // per actual change.
  useEffect(() => {
    if (onScriptLoaded && script !== undefined) {
      onScriptLoaded(script)
    }
    // onScriptLoaded is intentionally stable from the parent's setState;
    // re-running solely on script change keeps the contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script])

  function setAnswer(qId: string, value: string | string[]) {
    onAnswersChange({ ...answers, [qId]: value })
  }

  function toggleCheckbox(qId: string, option: string) {
    const current = (answers[qId] as string[]) ?? []
    const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option]
    setAnswer(qId, next)
  }

  function getConditionalResponse(q: ScriptQuestion, answer: string | string[]): string | null {
    if (!q.conditions?.length) return null
    const val = Array.isArray(answer) ? answer[0] : answer
    const match = q.conditions.find(c => c.if === val)
    if (match) return replaceVars(match.then_say)
    const fallback = q.conditions.find(c => c.if_default)
    return fallback ? replaceVars(fallback.then_say) : null
  }

  async function askAI(question: string) {
    const idx = clientQA.length
    const next = [...clientQA, { question, answer: '', loading: true }]
    onClientQAChange(next)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session')

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/answer-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ question, client_stage: clientStage, client_name: clientName }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur')

      onClientQAChange(next.map((item, j) => j === idx ? { ...item, answer: data.answer, loading: false } : item))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur de génération'
      onClientQAChange(next.map((item, j) => j === idx ? { ...item, answer: msg, loading: false } : item))
    }
  }

  if (loadingScript) {
    return (
      <div className="flex items-center gap-3 py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
        <span className="text-sm text-immo-text-muted">Génération du script…</span>
      </div>
    )
  }

  if (!script) {
    return <p className="py-8 text-center text-sm text-immo-text-muted">Aucun script disponible pour cette étape</p>
  }

  return (
    <div className="space-y-6">
      {/* Intro */}
      {script.intro && (
        <div className="rounded-xl border border-immo-accent-green/20 bg-immo-accent-green/5 p-4">
          <p className="text-sm leading-relaxed text-immo-text-primary">{script.intro}</p>
        </div>
      )}

      {/* Questions with branching responses */}
      {script.questions.length > 0 && (
        <div className="space-y-4">
          {script.questions.map((q, i) => {
            const answered = answers[q.id] != null && answers[q.id] !== ''
            const conditional = answers[q.id] ? getConditionalResponse(q, answers[q.id]) : null
            return (
              <div key={q.id} className={`rounded-xl border p-4 transition-all ${answered ? 'border-immo-accent-green/30 bg-immo-accent-green/5' : 'border-immo-border-default'}`}>
                {q.intro && (
                  <p className="mb-2 text-xs italic leading-relaxed text-immo-accent-blue">
                    {replaceVars(q.intro)}
                  </p>
                )}
                <div className="mb-3 flex items-start gap-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${answered ? 'bg-immo-accent-green text-white' : 'bg-immo-bg-card-hover text-immo-text-muted'}`}>
                    {answered ? '✓' : i + 1}
                  </span>
                  <p className="text-sm font-medium text-immo-text-primary">{q.question}</p>
                </div>

                {q.type === 'text' && (
                  <Input value={(answers[q.id] as string) ?? ''} onChange={e => setAnswer(q.id, e.target.value)} placeholder="Réponse…" className="border-immo-border-default bg-immo-bg-primary text-sm text-immo-text-primary" />
                )}
                {q.type === 'number' && (
                  <Input type="number" value={(answers[q.id] as string) ?? ''} onChange={e => setAnswer(q.id, e.target.value)} placeholder="0" className="border-immo-border-default bg-immo-bg-primary text-sm text-immo-text-primary" />
                )}
                {q.type === 'date' && (
                  <Input type="date" value={(answers[q.id] as string) ?? ''} onChange={e => setAnswer(q.id, e.target.value)} className="border-immo-border-default bg-immo-bg-primary text-sm text-immo-text-primary" />
                )}
                {(q.type === 'select' || q.type === 'radio') && q.options && (
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => (
                      <button key={opt} onClick={() => setAnswer(q.id, opt)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                          answers[q.id] === opt
                            ? 'border-immo-accent-green bg-immo-accent-green/10 text-immo-accent-green'
                            : 'border-immo-border-default text-immo-text-secondary hover:border-immo-text-muted'
                        }`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
                {q.type === 'checkbox' && q.options && (
                  <div className="flex flex-wrap gap-2">
                    {q.options.map(opt => {
                      const checked = ((answers[q.id] as string[]) ?? []).includes(opt)
                      return (
                        <button key={opt} onClick={() => toggleCheckbox(q.id, opt)}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                            checked
                              ? 'border-immo-accent-green bg-immo-accent-green/10 text-immo-accent-green'
                              : 'border-immo-border-default text-immo-text-secondary hover:border-immo-text-muted'
                          }`}>
                          <span className={`h-3 w-3 rounded border ${checked ? 'border-immo-accent-green bg-immo-accent-green' : 'border-immo-border-default'}`}>
                            {checked && <span className="block text-center text-[8px] text-white">✓</span>}
                          </span>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                )}

                {conditional && (
                  <div className="mt-3 rounded-lg border border-immo-accent-green/20 bg-immo-accent-green/5 p-3">
                    <div className="flex items-start gap-2">
                      <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-immo-accent-green" />
                      <p className="text-xs leading-relaxed text-immo-accent-green">{conditional}</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* AI talking points */}
      {script.talking_points.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-purple-500" />
            <span className="text-xs font-semibold text-purple-700">Arguments de vente IA</span>
          </div>
          <ul className="space-y-1">
            {script.talking_points.map((tp, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-purple-600">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" /> {tp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* AI objection handler — agent types client objection, AI answers */}
      <div className="rounded-xl border border-immo-status-orange/20 bg-immo-status-orange/5 p-4">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-immo-status-orange" />
          <span className="text-xs font-semibold text-immo-status-orange">Questions du client</span>
          <Sparkles className="h-3 w-3 text-purple-400" />
        </div>
        {clientQA.length > 0 && (
          <div className="mb-3 space-y-2">
            {clientQA.map((qa, i) => (
              <div key={i} className="rounded-lg bg-white/80 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-immo-text-primary">
                    <span className="text-immo-status-orange">Q :</span> {qa.question}
                  </p>
                  <button
                    onClick={() => onClientQAChange(clientQA.filter((_, j) => j !== i))}
                    className="shrink-0 text-[10px] text-immo-text-muted hover:text-immo-status-red"
                  >✕</button>
                </div>
                {qa.loading ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                    <span className="text-[10px] text-purple-400">Réponse en cours de génération…</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-purple-50 p-2">
                    <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-purple-500" />
                    <p className="text-xs leading-relaxed text-purple-700">{qa.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newQuestion}
            onChange={e => setNewQuestion(e.target.value)}
            placeholder="Le client dit « c'est cher » / « je vais réfléchir »…"
            className="h-8 flex-1 border-immo-status-orange/30 bg-white text-xs"
            onKeyDown={e => {
              if (e.key === 'Enter' && newQuestion.trim()) {
                askAI(newQuestion.trim())
                setNewQuestion('')
              }
            }}
          />
          <Button
            size="sm"
            disabled={!newQuestion.trim()}
            onClick={() => {
              if (!newQuestion.trim()) return
              askAI(newQuestion.trim())
              setNewQuestion('')
            }}
            className="h-8 bg-immo-status-orange/80 text-[10px] text-white hover:bg-immo-status-orange"
          >
            Répondre
          </Button>
        </div>
        {clientQA.length === 0 && (
          <p className="mt-2 text-[10px] italic text-immo-text-muted">
            Tapez l'objection du client → l'IA génère la réponse à lire.
          </p>
        )}
      </div>

      {/* Outro */}
      {script.outro && (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card-hover p-4">
          <p className="text-sm text-immo-text-secondary">{script.outro}</p>
        </div>
      )}

      {/* Optional inline notes (overlay variant hides this) */}
      {!hideNotes && (
        <div>
          <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">Notes pendant l'appel</label>
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            rows={4}
            placeholder="Impressions, remarques…"
            className="w-full resize-none rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-xs text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}
