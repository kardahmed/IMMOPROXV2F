import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Plus, Trash2, AlertTriangle, Lightbulb, Target, MessageCircle, Sparkles, Info } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Card, PageHeader } from '@/components/common'
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

export function PlaybookAdminPage() {
  const qc = useQueryClient()

  // Load ALL playbooks across ALL tenants
  const { data: playbooks = [], isLoading } = useQuery({
    queryKey: ['admin-playbooks'],
    queryFn: async () => {
      const { data } = await supabase.from('sale_playbooks').select('*, tenants(name)').order('created_at')
      return (data ?? []) as Array<Record<string, unknown>>
    },
  })

  // Load all tenants for creating new playbooks
  const { data: tenants = [] } = useQuery({
    queryKey: ['admin-tenants-list'],
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('id, name').order('name')
      return (data ?? []) as Array<{ id: string; name: string }>
    },
  })

  // Editable state
  const [editId, setEditId] = useState<string | null>(null)
  const [methodology, setMethodology] = useState('custom')
  const [objective, setObjective] = useState('')
  const [tone, setTone] = useState('')
  const [closingPhrases, setClosingPhrases] = useState<string[]>([])
  const [objectionRules, setObjectionRules] = useState<ObjectionRule[]>([])
  const [customInstructions, setCustomInstructions] = useState('')
  const [newClosing, setNewClosing] = useState('')

  function startEdit(pb: Record<string, unknown>) {
    setEditId(pb.id as string)
    setMethodology((pb.methodology as string) ?? 'custom')
    setObjective((pb.objective as string) ?? '')
    setTone((pb.tone as string) ?? '')
    setClosingPhrases((pb.closing_phrases as string[]) ?? [])
    setObjectionRules((pb.objection_rules as ObjectionRule[]) ?? [])
    setCustomInstructions((pb.custom_instructions as string) ?? '')
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!editId) return
      const { error } = await supabase.from('sale_playbooks').update({
        methodology, objective, tone,
        closing_phrases: closingPhrases,
        objection_rules: objectionRules,
        custom_instructions: customInstructions,
        updated_at: new Date().toISOString(),
      } as never).eq('id', editId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-playbooks'] })
      setEditId(null)
      toast.success('Playbook sauvegardé pour tous les tenants')
    },
  })

  const createForTenant = useMutation({
    mutationFn: async (tenantId: string) => {
      const { error } = await supabase.from('sale_playbooks').insert({
        tenant_id: tenantId,
        name: 'Playbook principal',
        methodology: 'hormozi',
        objective: 'Chaque appel doit aboutir a une visite. Ne jamais raccrocher sans date.',
        tone: 'Professionnel mais chaleureux.',
        closing_phrases: ['Mardi ou jeudi, quel jour vous arrange ?'],
        objection_rules: [{ trigger: 'trop_cher', response: 'Comparons au prix du m2 du quartier.' }],
        custom_instructions: 'Qualifier avant de vendre.',
        is_active: true,
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-playbooks'] }); toast.success('Playbook créé') },
  })

  function addObjection() {
    const available = OBJECTION_TRIGGERS.find(t => !objectionRules.some(r => r.trigger === t.value))
    if (available) setObjectionRules([...objectionRules, { trigger: available.value, response: '' }])
  }

  // Tenants without playbook
  const tenantsWithPlaybook = new Set(playbooks.map(p => p.tenant_id as string))
  const tenantsWithout = tenants.filter(t => !tenantsWithPlaybook.has(t.id))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Playbook IA"
        subtitle="Configurez la methodologie de vente que l'IA utilisera pour generer les scripts d'appel de tous les tenants."
      />

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#7C3AED]" />
        <div>
          <p className="text-sm font-medium text-[#7C3AED]">Configuration globale</p>
          <p className="text-xs text-immo-text-muted">Le playbook definit comment l'IA genere les scripts d'appel. Chaque tenant a son propre playbook que vous configurez ici. L'IA analyse le dossier complet du client (historique, visites, notes, paiements) et utilise le playbook pour generer un script personnalise.</p>
        </div>
      </div>

      {/* Tenants without playbook */}
      {tenantsWithout.length > 0 && (
        <div className="rounded-xl border border-immo-status-orange/20 bg-immo-status-orange/5 p-4">
          <p className="mb-2 text-sm font-semibold text-immo-status-orange">Tenants sans playbook ({tenantsWithout.length})</p>
          <div className="flex flex-wrap gap-2">
            {tenantsWithout.map(t => (
              <button key={t.id} onClick={() => createForTenant.mutate(t.id)}
                className="rounded-lg border border-immo-border-default bg-immo-bg-card px-3 py-1.5 text-xs font-medium text-immo-text-primary hover:border-[#7C3AED]/30 hover:bg-[#7C3AED]/5">
                <Plus className="mr-1 inline h-3 w-3" /> {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Playbooks list */}
      {playbooks.map(pb => {
        const tenantName = (pb.tenants as { name: string } | null)?.name ?? 'Inconnu'
        const isEditing = editId === pb.id

        return (
          <Card key={pb.id as string} noPadding className="overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-immo-border-default bg-immo-bg-primary px-5 py-3">
              <div className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-[#7C3AED]" />
                <div>
                  <span className="text-sm font-semibold text-immo-text-primary">{tenantName}</span>
                  <span className="ml-2 rounded-full bg-[#7C3AED]/10 px-2 py-0.5 text-[9px] font-bold text-[#7C3AED]">{(pb.methodology as string) ?? 'custom'}</span>
                </div>
              </div>
              {!isEditing ? (
                <Button onClick={() => startEdit(pb)} size="sm" variant="purple-outline" className="h-7 text-xs">
                  Modifier
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={() => setEditId(null)} size="sm" className="h-7 border border-immo-border-default bg-transparent text-xs text-immo-text-muted">Annuler</Button>
                  <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm" variant="purple" className="h-7 text-xs">
                    <Save className="mr-1 h-3 w-3" /> Sauvegarder
                  </Button>
                </div>
              )}
            </div>

            {/* View mode */}
            {!isEditing && (
              <div className="grid grid-cols-2 gap-4 p-5 text-xs">
                <div><span className="text-immo-text-muted">Objectif:</span> <span className="text-immo-text-primary">{((pb.objective as string) ?? '-').slice(0, 100)}</span></div>
                <div><span className="text-immo-text-muted">Ton:</span> <span className="text-immo-text-primary">{((pb.tone as string) ?? '-').slice(0, 100)}</span></div>
                <div><span className="text-immo-text-muted">Objections:</span> <span className="text-immo-text-primary">{((pb.objection_rules as unknown[]) ?? []).length} regles</span></div>
                <div><span className="text-immo-text-muted">Closings:</span> <span className="text-immo-text-primary">{((pb.closing_phrases as unknown[]) ?? []).length} phrases</span></div>
              </div>
            )}

            {/* Edit mode */}
            {isEditing && (
              <div className="space-y-5 p-5">
                {/* Methodology */}
                <div>
                  <Label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-immo-text-primary">
                    <Target className="h-3.5 w-3.5 text-immo-accent-green" /> Methodologie
                  </Label>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {METHODOLOGIES.map(m => (
                      <button key={m.value} onClick={() => setMethodology(m.value)}
                        className={`rounded-lg border p-3 text-left transition-all ${methodology === m.value ? 'border-[#7C3AED] bg-[#7C3AED]/5' : 'border-immo-border-default hover:border-[#7C3AED]/30'}`}>
                        <p className="text-xs font-bold text-immo-text-primary">{m.label}</p>
                        <p className="text-[10px] text-immo-text-muted mt-0.5">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Objective + Tone */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <Label className="mb-1 text-xs font-semibold text-immo-text-primary">Objectif principal</Label>
                    <textarea value={objective} onChange={e => setObjective(e.target.value)} rows={3} placeholder="Ex: Chaque appel doit aboutir a une visite..."
                      className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary" />
                  </div>
                  <div>
                    <Label className="mb-1 text-xs font-semibold text-immo-text-primary">Ton de voix</Label>
                    <textarea value={tone} onChange={e => setTone(e.target.value)} rows={3} placeholder="Ex: Professionnel mais chaleureux..."
                      className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary" />
                  </div>
                </div>

                {/* Objections */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label className="flex items-center gap-1.5 text-xs font-semibold text-immo-text-primary">
                      <AlertTriangle className="h-3.5 w-3.5 text-immo-status-orange" /> Regles d'objection
                    </Label>
                    <Button onClick={addObjection} size="sm" disabled={objectionRules.length >= OBJECTION_TRIGGERS.length} variant="purple" className="h-6 text-[10px]">
                      <Plus className="mr-1 h-3 w-3" /> Ajouter
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {objectionRules.map((rule, idx) => (
                      <div key={idx} className="rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <select value={rule.trigger} onChange={e => { const n = [...objectionRules]; n[idx] = { ...n[idx], trigger: e.target.value }; setObjectionRules(n) }}
                            className="h-7 rounded-md border border-immo-border-default bg-immo-bg-card px-2 text-xs text-immo-text-primary">
                            {OBJECTION_TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          <button onClick={() => setObjectionRules(objectionRules.filter((_, i) => i !== idx))} className="text-immo-text-muted hover:text-immo-status-red">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <textarea value={rule.response} onChange={e => { const n = [...objectionRules]; n[idx] = { ...n[idx], response: e.target.value }; setObjectionRules(n) }}
                          rows={2} placeholder="Comment repondre..." className="w-full rounded-md border border-immo-border-default bg-immo-bg-card p-2 text-xs text-immo-text-primary" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Closing phrases */}
                <div>
                  <Label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-immo-text-primary">
                    <Lightbulb className="h-3.5 w-3.5 text-[#7C3AED]" /> Phrases de closing
                  </Label>
                  <div className="space-y-1.5 mb-2">
                    {closingPhrases.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-[#7C3AED]">→</span>
                        <Input value={p} onChange={e => { const n = [...closingPhrases]; n[i] = e.target.value; setClosingPhrases(n) }} className="flex-1 text-xs border-immo-border-default" />
                        <button onClick={() => setClosingPhrases(closingPhrases.filter((_, j) => j !== i))} className="text-immo-text-muted hover:text-immo-status-red"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input value={newClosing} onChange={e => setNewClosing(e.target.value)} placeholder="Ex: Mardi ou jeudi ?" className="flex-1 text-xs border-immo-border-default" />
                    <Button onClick={() => { if (newClosing) { setClosingPhrases([...closingPhrases, newClosing]); setNewClosing('') } }} size="sm" variant="purple" className="h-9 text-xs">
                      <Plus className="mr-1 h-3 w-3" /> Ajouter
                    </Button>
                  </div>
                </div>

                {/* Custom instructions */}
                <div>
                  <Label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-immo-text-primary">
                    <MessageCircle className="h-3.5 w-3.5 text-immo-accent-green" /> Instructions IA
                  </Label>
                  <textarea value={customInstructions} onChange={e => setCustomInstructions(e.target.value)} rows={4} placeholder="Instructions pour l'IA..."
                    className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary" />
                </div>
              </div>
            )}
          </Card>
        )
      })}

      {playbooks.length === 0 && !isLoading && (
        <div className="py-12 text-center text-sm text-immo-text-muted">Aucun playbook configure. Creez-en un pour un tenant ci-dessus.</div>
      )}
    </div>
  )
}
