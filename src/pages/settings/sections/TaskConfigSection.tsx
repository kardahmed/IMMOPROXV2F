import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, ChevronDown, ChevronRight, Clock, FileText, Sparkles, Edit3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/common'
import { PIPELINE_STAGES } from '@/types'
import toast from 'react-hot-toast'

interface TaskTemplate {
  id: string; bundle_id: string | null; stage: string; title: string
  auto_trigger: string; delay_minutes: number; channel: string
  message_mode: string; is_active: boolean; sort_order: number; priority: string
  attached_file_types: string[]
}

interface Bundle {
  id: string; stage: string; name: string; is_active: boolean; sort_order: number
}

interface MessageTpl {
  id: string; stage: string; trigger_type: string; channel: string
  body: string; mode: string; variables_used: string[]; attached_file_types: string[]
}

const CHANNEL_LABELS: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', call: 'Appel', email: 'Email', system: 'Systeme', auto: 'Auto' }

const VARIABLES = ['{client_nom}','{client_prenom}','{client_phone}','{client_budget}','{agent_nom}','{agent_prenom}','{agent_phone}','{agence}','{projet}','{prix_min}','{unite_visitee}','{prix_unite}','{date_visite}','{heure_visite}','{adresse_projet}','{lien_maps}','{montant_echeance}','{date_echeance}','{apport}','{nb_echeances}']

export function TaskConfigSection() {
  const { tenantId } = useAuthStore()
  const qc = useQueryClient()
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(['accueil']))
  const [editMsg, setEditMsg] = useState<MessageTpl | null>(null)
  const [editBody, setEditBody] = useState('')

  const { data: bundles = [] } = useQuery({
    queryKey: ['task-bundles', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('task_bundles').select('*').eq('tenant_id', tenantId!).order('sort_order')
      return (data ?? []) as Bundle[]
    },
    enabled: !!tenantId,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['task-templates', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('task_templates').select('*').eq('tenant_id', tenantId!).order('sort_order')
      return (data ?? []) as TaskTemplate[]
    },
    enabled: !!tenantId,
  })

  const { data: messages = [] } = useQuery({
    queryKey: ['message-templates', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('message_templates').select('*').eq('tenant_id', tenantId!).order('sort_order')
      return (data ?? []) as MessageTpl[]
    },
    enabled: !!tenantId,
  })

  const toggleTask = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('task_templates').update({ is_active: active } as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-templates'] }),
  })

  const toggleBundle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('task_bundles').update({ is_active: active } as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
      // Also toggle all tasks in bundle
      await supabase.from('task_templates').update({ is_active: active } as never).eq('bundle_id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task-templates'] }); qc.invalidateQueries({ queryKey: ['task-bundles'] }) },
  })

  const updateTask = useMutation({
    mutationFn: async ({ id, ...payload }: Partial<TaskTemplate> & { id: string }) => {
      const { error } = await supabase.from('task_templates').update(payload as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-templates'] }),
  })

  const saveMessage = useMutation({
    mutationFn: async () => {
      if (!editMsg) return
      const { error } = await supabase.from('message_templates').update({ body: editBody, updated_at: new Date().toISOString() } as never).eq('id', editMsg.id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['message-templates'] }); setEditMsg(null); toast.success('Message sauvegarde') },
  })

  function toggleStage(stage: string) {
    setExpandedStages(prev => { const n = new Set(prev); n.has(stage) ? n.delete(stage) : n.add(stage); return n })
  }

  // Order stages by pipeline order, not alphabetically
  const STAGE_ORDER = ['accueil','visite_a_gerer','visite_confirmee','visite_terminee','negociation','reservation','vente','relancement','perdue']
  const stagesSet = new Set(templates.map(t => t.stage))
  const stages = STAGE_ORDER.filter(s => stagesSet.has(s))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-immo-text-primary">Configuration des taches</h2>
        <p className="text-sm text-immo-text-secondary">Activez/desactivez les taches automatiques et personnalisez les messages par etape.</p>
      </div>

      {stages.map(stage => {
        const stageLabel = PIPELINE_STAGES[stage as keyof typeof PIPELINE_STAGES]?.label ?? stage
        const stageColor = PIPELINE_STAGES[stage as keyof typeof PIPELINE_STAGES]?.color ?? '#8898AA'
        const stageBundles = bundles.filter(b => b.stage === stage)
        const stageTasks = templates.filter(t => t.stage === stage)
        const activeCount = stageTasks.filter(t => t.is_active).length
        const isExpanded = expandedStages.has(stage)

        return (
          <div key={stage} className="rounded-xl border border-immo-border-default bg-immo-bg-card overflow-hidden">
            {/* Stage header */}
            <button onClick={() => toggleStage(stage)}
              className="flex w-full items-center gap-3 px-5 py-3 hover:bg-immo-bg-card-hover transition-colors">
              {isExpanded ? <ChevronDown className="h-4 w-4 text-immo-text-muted" /> : <ChevronRight className="h-4 w-4 text-immo-text-muted" />}
              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageColor }} />
              <span className="text-sm font-semibold text-immo-text-primary flex-1 text-left">{stageLabel}</span>
              <span className="text-[10px] text-immo-text-muted">{activeCount}/{stageTasks.length} actives</span>
            </button>

            {isExpanded && (
              <div className="border-t border-immo-border-default">
                {stageBundles.map(bundle => {
                  const bundleTasks = stageTasks.filter(t => t.bundle_id === bundle.id)
                  return (
                    <div key={bundle.id} className="border-b border-immo-border-default last:border-0">
                      {/* Bundle header */}
                      <div className="flex items-center gap-3 bg-immo-bg-primary px-5 py-2">
                        <button onClick={() => toggleBundle.mutate({ id: bundle.id, active: !bundle.is_active })}
                          className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${bundle.is_active ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}>
                          <div className={`h-4 w-4 rounded-full bg-white transition-transform ${bundle.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-xs font-semibold text-immo-text-primary">{bundle.name}</span>
                        <span className="text-[10px] text-immo-text-muted">({bundleTasks.length} taches)</span>
                      </div>

                      {/* Tasks */}
                      <div className="divide-y divide-immo-border-default/50">
                        {bundleTasks.map(task => {
                          const msg = messages.find(m => m.stage === task.stage && m.trigger_type === task.auto_trigger)
                          return (
                            <div key={task.id} className={`flex items-center gap-3 px-5 py-2.5 ${!task.is_active ? 'opacity-40' : ''}`}>
                              {/* Toggle */}
                              <button onClick={() => toggleTask.mutate({ id: task.id, active: !task.is_active })}
                                className={`flex h-4 w-4 items-center justify-center rounded border ${task.is_active ? 'border-immo-accent-green bg-immo-accent-green text-white' : 'border-immo-border-default'}`}>
                                {task.is_active && <span className="text-[8px]">✓</span>}
                              </button>

                              {/* Title */}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-immo-text-primary">{task.title}</p>
                              </div>

                              {/* Delay */}
                              <div className="flex items-center gap-1 text-[10px] text-immo-text-muted w-[50px]">
                                <Clock className="h-3 w-3" />
                                <select value={task.delay_minutes} onChange={e => updateTask.mutate({ id: task.id, delay_minutes: parseInt(e.target.value) })}
                                  className="h-5 bg-transparent text-[10px] text-immo-text-muted border-0 p-0 cursor-pointer">
                                  <option value="0">Immed.</option>
                                  <option value="5">5min</option>
                                  <option value="60">1h</option>
                                  <option value="120">2h</option>
                                  <option value="240">4h</option>
                                  <option value="1440">24h</option>
                                  <option value="2880">48h</option>
                                  <option value="4320">72h</option>
                                  <option value="10080">7j</option>
                                </select>
                              </div>

                              {/* Channel */}
                              <select value={task.channel} onChange={e => updateTask.mutate({ id: task.id, channel: e.target.value })}
                                className="h-6 rounded border border-immo-border-default bg-immo-bg-primary px-1.5 text-[10px] text-immo-text-primary w-[90px]">
                                <option value="whatsapp">WhatsApp</option>
                                <option value="sms">SMS</option>
                                <option value="call">Appel</option>
                                <option value="email">Email</option>
                                <option value="system">Systeme</option>
                              </select>

                              {/* Mode */}
                              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${task.message_mode === 'ai' ? 'bg-purple-100 text-purple-600' : 'bg-immo-bg-primary text-immo-text-muted'}`}>
                                {task.message_mode === 'ai' ? <><Sparkles className="h-2.5 w-2.5" /> IA</> : <><FileText className="h-2.5 w-2.5" /> Tpl</>}
                              </div>

                              {/* Edit message */}
                              {msg && (
                                <button onClick={() => { setEditMsg(msg); setEditBody(msg.body) }}
                                  className="rounded p-1 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-accent-blue">
                                  <Edit3 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Edit message modal */}
      <Modal isOpen={!!editMsg} onClose={() => setEditMsg(null)} title="Editer le message" size="lg">
        {editMsg && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <span className="rounded-full bg-immo-bg-primary px-2 py-0.5 text-[10px] font-medium text-immo-text-muted">{editMsg.stage}</span>
              <span className="rounded-full bg-immo-bg-primary px-2 py-0.5 text-[10px] font-medium text-immo-text-muted">{CHANNEL_LABELS[editMsg.channel]}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${editMsg.mode === 'ai' ? 'bg-purple-100 text-purple-600' : 'bg-immo-bg-primary text-immo-text-muted'}`}>
                {editMsg.mode === 'ai' ? 'Generation IA' : 'Template'}
              </span>
            </div>

            <div>
              <Label className="text-xs text-immo-text-muted mb-1">Message</Label>
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={8}
                className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary font-mono" />
            </div>

            <div>
              <p className="text-[10px] font-medium text-immo-text-muted mb-2">Variables disponibles (cliquer pour inserer)</p>
              <div className="flex flex-wrap gap-1">
                {VARIABLES.map(v => (
                  <button key={v} onClick={() => setEditBody(prev => prev + v)}
                    className="rounded border border-immo-border-default bg-immo-bg-primary px-2 py-0.5 text-[10px] text-immo-accent-blue hover:bg-immo-accent-blue/10">
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {editMsg.attached_file_types.length > 0 && (
              <div className="rounded-lg bg-immo-bg-primary p-3">
                <p className="text-[10px] font-medium text-immo-text-muted mb-1">Fichiers joints</p>
                <div className="flex gap-2">{editMsg.attached_file_types.map(f => <span key={f} className="rounded bg-immo-accent-blue/10 px-2 py-0.5 text-[10px] text-immo-accent-blue">{f}</span>)}</div>
              </div>
            )}

            <Button onClick={() => saveMessage.mutate()} disabled={saveMessage.isPending} className="w-full bg-immo-accent-green text-white">
              <Save className="mr-1.5 h-4 w-4" /> Sauvegarder
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
