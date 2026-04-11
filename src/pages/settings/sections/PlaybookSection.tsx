import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Plus, Trash2, AlertTriangle, Lightbulb, Target, MessageCircle, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

interface ObjectionRule {
  trigger: string
  response: string
}

const METHODOLOGIES = [
  { value: 'hormozi', label: 'Alex Hormozi', desc: 'Focus valeur, urgence, closing direct' },
  { value: 'spin', label: 'SPIN Selling', desc: 'Situation, Probleme, Implication, Need-Payoff' },
  { value: 'challenger', label: 'Challenger Sale', desc: 'Enseigner, adapter, prendre le controle' },
  { value: 'custom', label: 'Personnalise', desc: 'Votre propre methodologie' },
]

const OBJECTION_TRIGGERS = [
  { value: 'trop_cher', label: 'Trop cher' },
  { value: 'pas_budget', label: 'Pas de budget' },
  { value: 'reflechir', label: 'Veut reflechir' },
  { value: 'concurrent', label: 'Va voir un concurrent' },
  { value: 'pas_maintenant', label: 'Pas maintenant' },
  { value: 'conjoint', label: 'Doit en parler au conjoint' },
  { value: 'photos', label: 'Veut des photos' },
  { value: 'localisation', label: 'Probleme de localisation' },
]

export function PlaybookSection() {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()

  const { data: playbook, isLoading } = useQuery({
    queryKey: ['sale-playbook-edit', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('sale_playbooks').select('*').eq('tenant_id', tenantId!).eq('is_active', true).limit(1).maybeSingle()
      return data as {
        id: string; methodology: string; objective: string; tone: string;
        closing_phrases: string[]; objection_rules: ObjectionRule[];
        custom_instructions: string
      } | null
    },
    enabled: !!tenantId,
  })

  const [methodology, setMethodology] = useState('custom')
  const [objective, setObjective] = useState('')
  const [tone, setTone] = useState('')
  const [closingPhrases, setClosingPhrases] = useState<string[]>([])
  const [objectionRules, setObjectionRules] = useState<ObjectionRule[]>([])
  const [customInstructions, setCustomInstructions] = useState('')
  const [newClosing, setNewClosing] = useState('')

  useEffect(() => {
    if (playbook) {
      setMethodology(playbook.methodology ?? 'custom')
      setObjective(playbook.objective ?? '')
      setTone(playbook.tone ?? '')
      setClosingPhrases(playbook.closing_phrases ?? [])
      setObjectionRules(playbook.objection_rules ?? [])
      setCustomInstructions(playbook.custom_instructions ?? '')
    }
  }, [playbook])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: tenantId,
        name: 'Playbook principal',
        methodology, objective, tone,
        closing_phrases: closingPhrases,
        objection_rules: objectionRules,
        custom_instructions: customInstructions,
        is_active: true,
        updated_at: new Date().toISOString(),
      }
      if (playbook?.id) {
        const { error } = await supabase.from('sale_playbooks').update(payload as never).eq('id', playbook.id)
        if (error) { handleSupabaseError(error); throw error }
      } else {
        const { error } = await supabase.from('sale_playbooks').insert(payload as never)
        if (error) { handleSupabaseError(error); throw error }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sale-playbook'] })
      toast.success('Playbook sauvegarde')
    },
  })

  function addObjection() {
    const available = OBJECTION_TRIGGERS.find(t => !objectionRules.some(r => r.trigger === t.value))
    if (available) setObjectionRules([...objectionRules, { trigger: available.value, response: '' }])
  }

  if (isLoading) return <div className="py-8 text-center text-sm text-immo-text-muted">Chargement...</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-immo-text-primary">Playbook de vente</h2>
        <p className="text-sm text-immo-text-secondary">Configurez la methodologie que l'IA utilisera pour generer les scripts d'appel.</p>
      </div>

      {/* Methodology */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-4 w-4 text-immo-accent-green" />
          <h3 className="text-sm font-semibold text-immo-text-primary">Methodologie</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {METHODOLOGIES.map(m => (
            <button key={m.value} onClick={() => setMethodology(m.value)}
              className={`rounded-lg border p-3 text-left transition-all ${methodology === m.value ? 'border-immo-accent-green bg-immo-accent-green/5' : 'border-immo-border-default hover:border-immo-accent-green/30'}`}>
              <p className="text-xs font-bold text-immo-text-primary">{m.label}</p>
              <p className="text-[10px] text-immo-text-muted mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Objective + Tone */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <Label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-immo-text-primary">
            <Target className="h-3.5 w-3.5 text-immo-accent-blue" /> Objectif principal
          </Label>
          <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={4} placeholder="Ex: Chaque appel doit aboutir a une visite. Si le client hesite, proposer une visite sans engagement..."
            className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary placeholder:text-immo-text-muted" />
        </div>
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <Label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-immo-text-primary">
            <MessageCircle className="h-3.5 w-3.5 text-[#7C3AED]" /> Ton de voix
          </Label>
          <textarea value={tone} onChange={e => setTone(e.target.value)} rows={4} placeholder="Ex: Professionnel mais chaleureux. Vouvoiement au premier contact. Tutoiement apres la 2eme interaction..."
            className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary placeholder:text-immo-text-muted" />
        </div>
      </div>

      {/* Objection Rules */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-immo-status-orange" />
            <h3 className="text-sm font-semibold text-immo-text-primary">Regles d'objection</h3>
          </div>
          <Button onClick={addObjection} size="sm" disabled={objectionRules.length >= OBJECTION_TRIGGERS.length} className="h-7 bg-immo-accent-green text-[10px] text-white">
            <Plus className="mr-1 h-3 w-3" /> Ajouter
          </Button>
        </div>
        <p className="mb-4 text-[11px] text-immo-text-muted">Quand le client fait une objection, l'agent voit la reponse suggeree en temps reel pendant l'appel.</p>

        <div className="space-y-3">
          {objectionRules.map((rule, idx) => (
            <div key={idx} className="rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
              <div className="mb-2 flex items-center justify-between">
                <select value={rule.trigger} onChange={e => {
                  const next = [...objectionRules]; next[idx] = { ...next[idx], trigger: e.target.value }; setObjectionRules(next)
                }} className="h-8 rounded-md border border-immo-border-default bg-immo-bg-card px-2 text-xs text-immo-text-primary">
                  {OBJECTION_TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button onClick={() => setObjectionRules(objectionRules.filter((_, i) => i !== idx))} className="rounded p-1 text-immo-text-muted hover:text-immo-status-red">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea value={rule.response} onChange={e => {
                const next = [...objectionRules]; next[idx] = { ...next[idx], response: e.target.value }; setObjectionRules(next)
              }} rows={3} placeholder="Comment repondre a cette objection..." className="w-full rounded-md border border-immo-border-default bg-immo-bg-card p-2 text-xs text-immo-text-primary" />
            </div>
          ))}
          {objectionRules.length === 0 && <p className="py-4 text-center text-xs text-immo-text-muted">Aucune regle. Cliquez "Ajouter" pour definir comment gerer les objections.</p>}
        </div>
      </div>

      {/* Closing phrases */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-[#7C3AED]" />
          <h3 className="text-sm font-semibold text-immo-text-primary">Phrases de closing</h3>
        </div>
        <p className="mb-3 text-[11px] text-immo-text-muted">Phrases que l'agent peut utiliser pour conclure l'appel et obtenir un rendez-vous.</p>
        <div className="space-y-2 mb-3">
          {closingPhrases.map((phrase, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-1 text-xs text-[#7C3AED]">→</span>
              <Input value={phrase} onChange={e => {
                const next = [...closingPhrases]; next[i] = e.target.value; setClosingPhrases(next)
              }} className="flex-1 text-xs border-immo-border-default" />
              <button onClick={() => setClosingPhrases(closingPhrases.filter((_, j) => j !== i))} className="mt-1 text-immo-text-muted hover:text-immo-status-red">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newClosing} onChange={e => setNewClosing(e.target.value)} placeholder="Ex: Mardi ou jeudi, quel jour vous arrange ?" className="flex-1 text-xs border-immo-border-default" />
          <Button onClick={() => { if (newClosing) { setClosingPhrases([...closingPhrases, newClosing]); setNewClosing('') } }} size="sm" className="h-9 bg-immo-accent-green text-xs text-white">
            <Plus className="mr-1 h-3 w-3" /> Ajouter
          </Button>
        </div>
      </div>

      {/* Custom instructions */}
      <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
        <Label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-immo-text-primary">
          <Sparkles className="h-3.5 w-3.5 text-immo-accent-green" /> Instructions supplementaires pour l'IA
        </Label>
        <p className="mb-3 text-[11px] text-immo-text-muted">Ces instructions seront incluses dans le prompt IA a chaque generation de script. Soyez precis.</p>
        <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} rows={6} placeholder="Ex: Toujours qualifier le client avant de parler prix. Ne jamais donner le prix exact par telephone. Si le client demande des photos, proposer une visite 3D..."
          className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary placeholder:text-immo-text-muted" />
      </div>

      {/* Save */}
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90">
        {save.isPending ? <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save className="mr-1.5 h-4 w-4" />}
        Sauvegarder le playbook
      </Button>
    </div>
  )
}
