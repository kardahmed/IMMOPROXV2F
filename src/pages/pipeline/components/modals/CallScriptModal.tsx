import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Phone, Clock, Sparkles, CheckCircle, Lightbulb, ArrowRight, Calendar, AlertTriangle, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PIPELINE_STAGES } from '@/types'
import type { PipelineStage } from '@/types'
import toast from 'react-hot-toast'

interface ScriptCondition {
  if?: string
  if_default?: boolean
  then_say: string
  then_next?: string
}

interface ScriptQuestion {
  id: string
  question: string
  intro?: string
  type: 'text' | 'number' | 'select' | 'radio' | 'checkbox' | 'date'
  options?: string[]
  maps_to?: string
  conditions?: ScriptCondition[]
}

interface ObjectionRule {
  trigger: string
  response: string
}

interface CallScriptModalProps {
  isOpen: boolean
  onClose: () => void
  clientId: string
  clientName: string
  clientPhone: string
  clientStage: PipelineStage
  tenantId: string
  agentId: string
}

export function CallScriptModal({
  isOpen, onClose, clientId, clientName, clientPhone, clientStage, tenantId, agentId,
}: CallScriptModalProps) {
  const qc = useQueryClient()
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [checkedQuestions, setCheckedQuestions] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<'qualified' | 'callback' | 'not_interested'>('qualified')
  const [clientQA, setClientQA] = useState<Array<{ question: string; answer: string; loading: boolean }>>([])
  const [newQuestion, setNewQuestion] = useState('')
  const [saving, setSaving] = useState(false)
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined)

  // AI answer for client questions (via Edge Function to avoid CORS)
  async function handleClientQuestion(question: string) {
    const idx = clientQA.length
    setClientQA(prev => [...prev, { question, answer: '', loading: true }])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No session')

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/answer-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ question, client_stage: clientStage, client_name: clientName, agent_id: agentId, tenant_id: tenantId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur')

      setClientQA(prev => prev.map((item, j) => j === idx ? { ...item, answer: data.answer, loading: false } : item))
    } catch {
      setClientQA(prev => prev.map((item, j) => j === idx ? { ...item, answer: 'Erreur de generation. Repondez manuellement.', loading: false } : item))
    }
  }

  // Timer
  useEffect(() => {
    if (isOpen) {
      setTimer(0)
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isOpen])

  // Fetch agent + tenant names for template variable replacement
  const { data: contextNames } = useQuery({
    queryKey: ['script-context', agentId, tenantId],
    queryFn: async () => {
      const [agentRes, tenantRes] = await Promise.all([
        supabase.from('users').select('first_name, last_name').eq('id', agentId).single(),
        supabase.from('tenants').select('name, phone').eq('id', tenantId).single(),
      ])
      return {
        agentName: agentRes.data ? `${agentRes.data.first_name} ${agentRes.data.last_name}` : 'Agent',
        agencyName: tenantRes.data?.name ?? 'Agence',
        agencyPhone: tenantRes.data?.phone ?? '',
      }
    },
    enabled: isOpen,
    staleTime: 300_000,
  })

  const replaceVars = (text: string) => text
    .replace(/\[nom\]/g, clientName)
    .replace(/\[agent\]/g, contextNames?.agentName ?? 'Agent')
    .replace(/\[agence\]/g, contextNames?.agencyName ?? 'Agence')
    .replace(/\[localisation\]/g, 'notre projet')
    .replace(/\[telephone\]/g, clientPhone)

  // Fetch script (AI or template)
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
        // Fallback: load default script from DB
        const { data } = await supabase.from('call_scripts')
          .select('*').eq('tenant_id', tenantId).eq('pipeline_stage', clientStage).eq('is_active', true).maybeSingle()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any
        if (d) return {
          mode: 'template' as const,
          intro: replaceVars(d.intro_text ?? ''),
          questions: d.questions as ScriptQuestion[],
          talking_points: [] as string[],
          outro: replaceVars(d.outro_text ?? ''),
          suggested_action: null as string | null,
          script_id: d.id as string | null,
        }

        return null
      }

      const result = await response.json() as {
        mode: 'ai' | 'template'
        intro: string
        questions: ScriptQuestion[]
        talking_points: string[]
        outro: string
        suggested_action: string | null
        script_id: string | null
      }

      // Replace any remaining placeholders in template mode
      if (result.mode === 'template') {
        result.intro = replaceVars(result.intro)
        result.outro = replaceVars(result.outro)
      }

      return result
    },
    enabled: isOpen,
  })

  // Fetch playbook for objection handling
  const { data: playbook } = useQuery({
    queryKey: ['sale-playbook', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('sale_playbooks').select('*').eq('tenant_id', tenantId).eq('is_active', true).limit(1).maybeSingle()
      return data as { objective: string; tone: string; closing_phrases: string[]; objection_rules: ObjectionRule[]; custom_instructions: string } | null
    },
    enabled: isOpen && !!tenantId,
  })

  const [showVisitForm, setShowVisitForm] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [activeObjection, setActiveObjection] = useState<string | null>(null)

  // Create visit from call script
  const createVisit = useMutation({
    mutationFn: async () => {
      if (!visitDate || !visitTime) return
      const { error } = await supabase.from('visits').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: agentId,
        scheduled_at: `${visitDate}T${visitTime}:00`,
        visit_type: 'on_site', status: 'planned',
      } as never)
      if (error) { handleSupabaseError(error); throw error }
      await supabase.from('history').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: agentId,
        type: 'visit_planned', title: `Visite planifiee depuis appel — ${visitDate} ${visitTime}`,
      } as never)
      // Move to visite_a_gerer if in accueil
      if (clientStage === 'accueil') {
        await supabase.from('clients').update({ pipeline_stage: 'visite_a_gerer' } as never).eq('id', clientId)
      }
    },
    onSuccess: () => {
      toast.success('Visite planifiée !')
      setShowVisitForm(false)
      qc.invalidateQueries({ queryKey: ['client-visits'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    },
  })

  // Get conditional response for a question based on answer
  function getConditionalResponse(q: ScriptQuestion, answer: string | string[]): string | null {
    if (!q.conditions?.length) return null
    const val = Array.isArray(answer) ? answer[0] : answer
    const match = q.conditions.find(c => c.if === val)
    if (match) return replaceVars(match.then_say)
    const fallback = q.conditions.find(c => c.if_default)
    return fallback ? replaceVars(fallback.then_say) : null
  }

  // Map negative answers to objection triggers
  const OBJECTION_KEYWORDS: Record<string, string[]> = {
    trop_cher: ['trop cher', 'cher', 'budget', 'pas le budget', 'pas de budget', 'hors budget'],
    pas_budget: ['pas de budget', 'pas le budget', 'budget', 'moyen'],
    reflechir: ['reflechis', 'reflechir', 'reflech', 'pas maintenant', 'plus tard', 'veille', 'pas presse', 'pas encore', 'hesite'],
    concurrent: ['concurrent', 'ailleurs', 'achete ailleurs', 'autre promoteur', 'moins cher ailleurs'],
    pas_maintenant: ['pas maintenant', 'pas pour le moment', 'pas interesse', 'pas presse', 'reporte', 'plus tard'],
  }

  function detectObjection(value: string | string[]): string | null {
    const text = (Array.isArray(value) ? value.join(' ') : value).toLowerCase()
    for (const [trigger, keywords] of Object.entries(OBJECTION_KEYWORDS)) {
      if (keywords.some(kw => text.includes(kw))) return trigger
    }
    // Also detect negative options
    if (text.includes('non') || text.includes('decu') || text.includes('mitige')) return 'reflechir'
    return null
  }

  const [detectedObjection, setDetectedObjection] = useState<string | null>(null)

  function setAnswer(qId: string, value: string | string[]) {
    setAnswers(prev => ({ ...prev, [qId]: value }))
    setCheckedQuestions(prev => new Set([...prev, qId]))

    // Auto-detect objection from answer
    const objection = detectObjection(value)
    if (objection) {
      setActiveObjection(objection)
      setDetectedObjection(objection)
      // Auto-clear highlight after 10s
      setTimeout(() => setDetectedObjection(null), 10000)
    }
  }

  function toggleCheckbox(qId: string, option: string) {
    const current = (answers[qId] as string[]) ?? []
    const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option]
    setAnswer(qId, next)
  }

  async function handleSave() {
    setSaving(true)
    if (timerRef.current) clearInterval(timerRef.current)

    try {
      // 1. Save call response
      await supabase.from('call_responses').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: agentId,
        script_id: script?.script_id ?? null,
        responses: { ...answers, _client_qa: clientQA.map(q => ({ q: q.question, a: q.answer })) },
        duration_seconds: timer,
        result,
        ai_summary: notes || null,
        ai_suggestion: script?.suggested_action ?? null,
      } as never)

      // 2. Update client fields from mapped answers
      const clientUpdate: Record<string, unknown> = {}
      for (const q of script?.questions ?? []) {
        if (q.maps_to && answers[q.id]) {
          const val = answers[q.id]
          if (q.maps_to === 'confirmed_budget') clientUpdate.confirmed_budget = Number(val) || null
          else if (q.maps_to === 'desired_unit_types') clientUpdate.desired_unit_types = Array.isArray(val) ? val : [val]
          else if (q.maps_to === 'interest_level') {
            const map: Record<string, string> = { 'Oui, urgent': 'high', 'Oui, pas presse': 'medium', 'Juste en veille': 'low', 'Chaud': 'high', 'Tiede': 'medium', 'Froid': 'low' }
            clientUpdate.interest_level = map[val as string] ?? val
          } else if (q.maps_to === 'payment_method') {
            const map: Record<string, string> = { 'Comptant': 'cash', 'Credit bancaire': 'bank_loan', 'Mixte': 'mixed' }
            clientUpdate.payment_method = map[val as string] ?? 'installments'
          }
        }
      }

      // Add notes + client questions
      const qaText = clientQA.length > 0 ? clientQA.map(q => `Q: ${q.question} → R: ${q.answer}`).join(' | ') : ''
      const fullNotes = [notes, qaText].filter(Boolean).join('\n')
      if (fullNotes) {
        const { data: currentClient } = await supabase.from('clients').select('notes').eq('id', clientId).single()
        const existingNotes = (currentClient as { notes: string | null } | null)?.notes ?? ''
        clientUpdate.notes = existingNotes ? `${existingNotes}\n\n[Appel ${new Date().toLocaleDateString('fr')}] ${fullNotes}` : `[Appel ${new Date().toLocaleDateString('fr')}] ${fullNotes}`
      }

      if (Object.keys(clientUpdate).length > 0) {
        await supabase.from('clients').update(clientUpdate as never).eq('id', clientId)
      }

      // 3. Log in history
      const answeredCount = Object.keys(answers).length
      const totalQuestions = script?.questions?.length ?? 0
      await supabase.from('history').insert({
        tenant_id: tenantId, client_id: clientId, agent_id: agentId,
        type: 'call',
        title: `Appel guide ${Math.floor(timer / 60)}min — ${result === 'qualified' ? 'Qualifie' : result === 'callback' ? 'A rappeler' : 'Pas interesse'} (${answeredCount}/${totalQuestions} questions)`,
        metadata: { duration: timer, result, answers_count: answeredCount, mode: script?.mode },
      } as never)

      toast.success('Appel enregistré et fiche client mise à jour')
      qc.invalidateQueries({ queryKey: ['client-detail'] })
      qc.invalidateQueries({ queryKey: ['client-history'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      onClose()
    } catch (err) {
      console.error(err)
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const stage = PIPELINE_STAGES[clientStage]
  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="fixed inset-0 z-50 flex h-screen flex-col overflow-hidden bg-immo-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-immo-border-default bg-immo-bg-card px-6 py-3">
        <div className="flex items-center gap-4">
          <Phone className="h-5 w-5 text-immo-accent-green" />
          <div>
            <h2 className="text-sm font-bold text-immo-text-primary">{clientName}</h2>
            <div className="flex items-center gap-2 text-xs text-immo-text-muted">
              <span>{clientPhone}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: stage.color + '15', color: stage.color }}>{stage.label}</span>
              {script?.mode === 'ai' && <span className="flex items-center gap-1 text-purple-500"><Sparkles className="h-3 w-3" /> IA</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 rounded-lg bg-immo-accent-green/10 px-3 py-1.5">
            <Clock className="h-4 w-4 text-immo-accent-green" />
            <span className="font-mono text-sm font-bold text-immo-accent-green">{formatTime(timer)}</span>
          </div>
          <button onClick={onClose} aria-label="Fermer l'appel" className="rounded-md p-1.5 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row overflow-hidden">
        {/* Left: Script */}
        <div className="flex-[3] overflow-y-auto border-b md:border-b-0 md:border-r border-immo-border-default p-3 md:p-6">
          {loadingScript ? (
            <div className="flex items-center gap-3 py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
              <span className="text-sm text-immo-text-muted">Generation du script...</span>
            </div>
          ) : !script ? (
            <p className="py-8 text-center text-sm text-immo-text-muted">Aucun script disponible pour cette etape</p>
          ) : (
            <div className="space-y-6">
              {/* Intro */}
              {script.intro && (
                <div className="rounded-xl border border-immo-accent-green/20 bg-immo-accent-green/5 p-4">
                  <p className="text-sm leading-relaxed text-immo-text-primary">{script.intro}</p>
                </div>
              )}

              {/* Questions */}
              <div className="space-y-4">
                {script.questions.map((q, i) => {
                  const answered = checkedQuestions.has(q.id)
                  return (
                    <div key={q.id} className={`rounded-xl border p-4 transition-all ${answered ? 'border-immo-accent-green/30 bg-immo-accent-green/5' : 'border-immo-border-default'}`}>
                      {/* Transition phrase before question */}
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

                      {/* Input based on type */}
                      {q.type === 'text' && (
                        <Input value={(answers[q.id] as string) ?? ''} onChange={e => setAnswer(q.id, e.target.value)} placeholder="Reponse..." className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary text-sm" />
                      )}
                      {q.type === 'number' && (
                        <Input type="number" value={(answers[q.id] as string) ?? ''} onChange={e => setAnswer(q.id, e.target.value)} placeholder="0" className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary text-sm" />
                      )}
                      {q.type === 'date' && (
                        <Input type="date" value={(answers[q.id] as string) ?? ''} onChange={e => setAnswer(q.id, e.target.value)} className="border-immo-border-default bg-immo-bg-primary text-immo-text-primary text-sm" />
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
                                  {checked && <span className="block text-[8px] text-white text-center">✓</span>}
                                </span>
                                {opt}
                              </button>
                            )
                          })}
                        </div>
                      )}

                      {/* Conditional response */}
                      {answers[q.id] && getConditionalResponse(q, answers[q.id]) && (
                        <div className="mt-3 rounded-lg border border-immo-accent-green/20 bg-immo-accent-green/5 p-3">
                          <div className="flex items-start gap-2">
                            <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-immo-accent-green" />
                            <p className="text-xs leading-relaxed text-immo-accent-green">{getConditionalResponse(q, answers[q.id])}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Talking points */}
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

              {/* Client questions with AI-generated answers */}
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
                            <span className="text-immo-status-orange">Q:</span> {qa.question}
                          </p>
                          <button onClick={() => setClientQA(prev => prev.filter((_, j) => j !== i))} className="shrink-0 text-immo-text-muted hover:text-immo-status-red text-[10px]">✕</button>
                        </div>
                        {qa.loading ? (
                          <div className="mt-2 space-y-2">
                            <div className="rounded-md bg-immo-accent-blue/5 border border-immo-accent-blue/20 p-2">
                              <p className="text-[10px] font-semibold text-immo-accent-blue mb-1">Dites au client :</p>
                              <p className="text-xs italic leading-relaxed text-immo-accent-blue">
                                {['C\'est une tres bonne question. Laissez-moi verifier ca pour vous...', 'Excellente question. Je consulte les details pour vous donner une reponse precise...', 'Bonne question ! Attendez un instant, je verifie les informations...'][i % 3]}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-400 border-t-transparent" />
                              <span className="text-[10px] text-purple-400">Reponse en cours de generation...</span>
                            </div>
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
                    placeholder="Le client pose une question ? Tapez-la ici..."
                    className="h-8 flex-1 border-immo-status-orange/30 bg-white text-xs"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newQuestion.trim()) {
                        handleClientQuestion(newQuestion.trim())
                        setNewQuestion('')
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!newQuestion.trim()}
                    onClick={() => {
                      if (!newQuestion.trim()) return
                      handleClientQuestion(newQuestion.trim())
                      setNewQuestion('')
                    }}
                    className="h-8 bg-immo-status-orange/80 text-[10px] text-white hover:bg-immo-status-orange"
                  >
                    Repondre
                  </Button>
                </div>
                {clientQA.length === 0 && (
                  <p className="mt-2 text-[10px] italic text-immo-text-muted">Tapez la question du client → l'IA genere instantanement une reponse que vous pouvez lire.</p>
                )}
              </div>

              {/* Outro */}
              {script.outro && (
                <div className="rounded-xl border border-immo-border-default bg-immo-bg-card-hover p-4">
                  <p className="text-sm text-immo-text-secondary">{script.outro}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Responses summary */}
        <div className="flex w-full md:w-[380px] shrink-0 flex-col overflow-hidden bg-immo-bg-card">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <h3 className="mb-4 text-sm font-bold text-immo-text-primary">Recapitulatif</h3>

          {/* Answers summary */}
          <div className="mb-4 space-y-2">
            {script?.questions.filter(q => answers[q.id]).map(q => (
              <div key={q.id} className="rounded-lg bg-immo-bg-primary p-2.5">
                <p className="text-[10px] text-immo-text-muted">{q.question}</p>
                <p className="text-xs font-medium text-immo-text-primary">
                  {Array.isArray(answers[q.id]) ? (answers[q.id] as string[]).join(', ') : answers[q.id]}
                </p>
              </div>
            )) ?? null}
            {Object.keys(answers).length === 0 && (
              <p className="py-4 text-center text-xs text-immo-text-muted">Les reponses apparaitront ici</p>
            )}
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="mb-1 block text-[10px] font-medium text-immo-text-muted">Notes supplementaires</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Impressions, remarques..."
              className="w-full resize-none rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-xs text-immo-text-primary placeholder:text-immo-text-muted focus:border-immo-accent-green focus:outline-none" />
          </div>

          {/* Result */}
          <div className="mb-4">
            <label className="mb-2 block text-[10px] font-medium text-immo-text-muted">Resultat de l'appel</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'qualified' as const, label: 'Qualifie', color: 'text-immo-accent-green border-immo-accent-green/30 bg-immo-accent-green/5' },
                { value: 'callback' as const, label: 'A rappeler', color: 'text-immo-status-orange border-immo-status-orange/30 bg-immo-status-orange/5' },
                { value: 'not_interested' as const, label: 'Pas interesse', color: 'text-immo-status-red border-immo-status-red/30 bg-immo-status-red/5' },
              ]).map(r => (
                <button key={r.value} onClick={() => setResult(r.value)}
                  className={`rounded-lg border px-2 py-2 text-[11px] font-medium transition-all ${result === r.value ? r.color : 'border-immo-border-default text-immo-text-muted'}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mini availability calendar */}
          <AvailabilityMini agentId={agentId} tenantId={tenantId} />
          <div className="mb-4">
            {!showVisitForm ? (
              <Button onClick={() => setShowVisitForm(true)} className="w-full border border-immo-accent-blue/30 bg-immo-accent-blue/5 text-xs font-semibold text-immo-accent-blue hover:bg-immo-accent-blue/10">
                <Calendar className="mr-1.5 h-3.5 w-3.5" /> Proposer une visite
              </Button>
            ) : (
              <div className="rounded-lg border border-immo-accent-blue/30 bg-immo-accent-blue/5 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-immo-accent-blue">Planifier une visite</p>
                <Input type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} className="h-8 text-xs border-immo-border-default" />
                <select value={visitTime} onChange={e => setVisitTime(e.target.value)} className="h-8 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-2 text-xs text-immo-text-primary">
                  <option value="">Heure</option>
                  {['09:00','10:00','11:00','12:00','14:00','15:00','16:00','17:00'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="flex gap-2">
                  <Button onClick={() => createVisit.mutate()} disabled={!visitDate || !visitTime || createVisit.isPending} className="flex-1 h-7 bg-immo-accent-blue text-[10px] text-white">
                    {createVisit.isPending ? '...' : 'Confirmer visite'}
                  </Button>
                  <Button onClick={() => setShowVisitForm(false)} className="h-7 border border-immo-border-default bg-transparent text-[10px] text-immo-text-muted">Annuler</Button>
                </div>
              </div>
            )}
          </div>

          {/* Objection handling — auto-detected from answers */}
          {playbook?.objection_rules && playbook.objection_rules.length > 0 && (
            <div className={`mb-4 rounded-lg p-3 transition-all duration-500 ${detectedObjection ? 'bg-immo-status-red/5 border border-immo-status-red/30 ring-2 ring-immo-status-red/20' : ''}`}>
              {detectedObjection && (
                <div className="mb-2 flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle className="h-3.5 w-3.5 text-immo-status-red" />
                  <span className="text-[10px] font-bold text-immo-status-red">Objection detectee !</span>
                </div>
              )}
              <label className="mb-2 block text-[10px] font-medium text-immo-text-muted">Objection du client ?</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {playbook.objection_rules.map(rule => (
                  <button key={rule.trigger} onClick={() => setActiveObjection(activeObjection === rule.trigger ? null : rule.trigger)}
                    className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${activeObjection === rule.trigger ? 'border-immo-status-orange/50 bg-immo-status-orange/10 text-immo-status-orange' : 'border-immo-border-default text-immo-text-muted hover:border-immo-status-orange/30'} ${detectedObjection === rule.trigger ? 'ring-2 ring-immo-status-red/40 scale-105' : ''}`}>
                    <AlertTriangle className="mr-1 inline h-2.5 w-2.5" />
                    {rule.trigger === 'trop_cher' ? 'Trop cher' : rule.trigger === 'pas_budget' ? 'Pas de budget' : rule.trigger === 'reflechir' ? 'Veut reflechir' : rule.trigger === 'concurrent' ? 'Concurrent' : rule.trigger === 'pas_maintenant' ? 'Pas maintenant' : rule.trigger}
                  </button>
                ))}
              </div>
              {activeObjection && (
                <div className={`rounded-lg border p-3 transition-all ${detectedObjection === activeObjection ? 'border-immo-status-red/30 bg-immo-status-red/5' : 'border-immo-status-orange/20 bg-immo-status-orange/5'}`}>
                  <p className="text-[10px] font-semibold text-immo-status-orange mb-1">
                    {detectedObjection === activeObjection ? 'Lisez cette reponse au client :' : 'Reponse suggeree :'}
                  </p>
                  <p className="text-xs leading-relaxed text-immo-text-primary">{playbook.objection_rules.find(r => r.trigger === activeObjection)?.response}</p>
                  {/* Client reaction after objection handling */}
                  <div className="mt-2 pt-2 border-t border-immo-border-default">
                    <p className="text-[9px] text-immo-text-muted mb-1.5">Reaction du client :</p>
                    <div className="flex gap-1.5">
                      {[
                        { key: 'convinced', label: 'Convaincu', color: 'text-immo-accent-green border-immo-accent-green/30 bg-immo-accent-green/5' },
                        { key: 'hesitant', label: 'Hesite encore', color: 'text-immo-status-orange border-immo-status-orange/30 bg-immo-status-orange/5' },
                        { key: 'refused', label: 'Refuse', color: 'text-immo-status-red border-immo-status-red/30 bg-immo-status-red/5' },
                      ].map(r => (
                        <button key={r.key}
                          onClick={() => {
                            setAnswers(prev => ({ ...prev, [`_objection_${activeObjection}`]: r.key }))
                            if (r.key === 'convinced') {
                              setDetectedObjection(null)
                              setActiveObjection(null)
                            }
                          }}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-all ${
                            answers[`_objection_${activeObjection}`] === r.key ? r.color + ' ring-1' : 'border-immo-border-default text-immo-text-muted hover:bg-immo-bg-card-hover'
                          }`}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                    {answers[`_objection_${activeObjection}`] === 'hesitant' && (
                      <p className="mt-1.5 text-[10px] italic text-immo-accent-blue">Insistez doucement : proposez d'envoyer les details par WhatsApp et de rappeler dans 2 jours.</p>
                    )}
                    {answers[`_objection_${activeObjection}`] === 'refused' && (
                      <p className="mt-1.5 text-[10px] italic text-immo-status-red">Ne forcez pas. Remerciez et proposez de rester en contact pour les futures opportunites.</p>
                    )}
                    {answers[`_objection_${activeObjection}`] === 'convinced' && (
                      <p className="mt-1.5 text-[10px] italic text-immo-accent-green">Parfait ! Enchainez vers la conclusion et proposez la prochaine etape.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Closing phrases */}
          {playbook?.closing_phrases && playbook.closing_phrases.length > 0 && (
            <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3">
              <p className="text-[10px] font-semibold text-purple-600 mb-2">Phrases de closing</p>
              {playbook.closing_phrases.map((phrase, i) => (
                <p key={i} className="text-xs text-purple-700 mb-1 flex items-start gap-1.5">
                  <span className="text-purple-400 mt-0.5">→</span> {phrase}
                </p>
              ))}
            </div>
          )}

          {/* AI suggestion */}
          {script?.suggested_action && (
            <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3">
              <p className="text-[10px] font-medium text-purple-500">Suggestion IA</p>
              <p className="text-xs font-medium text-purple-700">{script.suggested_action}</p>
            </div>
          )}

          </div>{/* end scrollable area */}

          {/* Save button — sticky bottom */}
          <div className="shrink-0 border-t border-immo-border-default bg-immo-bg-card p-4">
            <Button onClick={handleSave} disabled={saving} className="w-full bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90">
              {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> :
                <><CheckCircle className="mr-1.5 h-4 w-4" /> Sauvegarder et fermer</>
              }
            </Button>
          </div>
        </div>{/* end right panel */}
      </div>
    </div>
  )
}

// Mini availability calendar — reads tenant visit settings
function AvailabilityMini({ agentId, tenantId }: { agentId: string; tenantId: string }) {
  // Load tenant visit settings
  const { data: visitSettings } = useQuery({
    queryKey: ['tenant-visit-settings', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('tenant_settings').select('work_days, visit_slots, visit_duration_minutes').eq('tenant_id', tenantId).single()
      return data as { work_days: number[] | null; visit_slots: string[] | null; visit_duration_minutes: number | null } | null
    },
    staleTime: 300_000,
  })

  // Load existing visits
  const { data: existingVisits } = useQuery({
    queryKey: ['agent-availability', agentId],
    queryFn: async () => {
      const now = new Date()
      const nextWeek = new Date(now.getTime() + 7 * 86400000)
      const { data } = await supabase
        .from('visits')
        .select('scheduled_at')
        .eq('agent_id', agentId)
        .eq('tenant_id', tenantId)
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', nextWeek.toISOString())
        .in('status', ['planned', 'confirmed'])
        .order('scheduled_at')
      return (data ?? []) as Array<{ scheduled_at: string }>
    },
    staleTime: 60_000,
  })

  const workDays = visitSettings?.work_days ?? [0, 1, 2, 3, 4]
  const timeSlots = visitSettings?.visit_slots ?? ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']
  const duration = visitSettings?.visit_duration_minutes ?? 45
  const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']

  // Build next 5 working days based on tenant settings
  const days: Array<{ label: string; shortDay: string; slots: string[]; occupiedSlots: string[] }> = []
  let d = new Date()
  d.setHours(0, 0, 0, 0)
  let count = 0
  while (count < 5) {
    d = new Date(d.getTime() + 86400000)
    const dow = d.getDay()
    if (!workDays.includes(dow)) continue
    const dateStr = d.toISOString().split('T')[0]
    const occupied = (existingVisits ?? [])
      .filter(s => s.scheduled_at.startsWith(dateStr))
      .map(s => { const h = new Date(s.scheduled_at); return `${h.getHours().toString().padStart(2, '0')}:${h.getMinutes().toString().padStart(2, '0')}` })
    days.push({
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      shortDay: DAY_NAMES[dow],
      slots: timeSlots,
      occupiedSlots: occupied,
    })
    count++
  }

  return (
    <div className="mb-4 rounded-lg border border-immo-accent-blue/20 bg-immo-accent-blue/5 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-immo-accent-blue">Disponibilites</p>
        <span className="text-[8px] text-immo-text-muted">Visite: {duration} min</span>
      </div>
      <div className="flex gap-1">
        {days.map(day => (
          <div key={day.label} className="flex-1 text-center">
            <p className="text-[8px] font-bold text-immo-text-muted">{day.shortDay}</p>
            <p className="text-[9px] text-immo-text-secondary mb-1">{day.label}</p>
            <div className="space-y-0.5">
              {day.slots.map(slot => {
                const isOccupied = day.occupiedSlots.includes(slot)
                return (
                  <div
                    key={slot}
                    className={`rounded px-0.5 py-0.5 text-[7px] font-medium ${
                      isOccupied
                        ? 'bg-immo-status-red/10 text-immo-status-red line-through'
                        : 'bg-immo-accent-green/10 text-immo-accent-green'
                    }`}
                  >
                    {slot}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[8px] text-immo-text-muted text-center">Vert = libre | Rouge = occupe</p>
    </div>
  )
}
