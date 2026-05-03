// Lifted out of TasksPage.tsx (was 687 lines, ~200 of which were
// this orthogonal "edit message templates" surface). This component
// has nothing to do with the task list — it's the tenant's WhatsApp /
// SMS / email template editor and lives in its own file now so each
// concern is reviewable independently.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Mail, FileText, Save, Plus, Trash2, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { LoadingSpinner } from '@/components/common'
import { PIPELINE_STAGES } from '@/types'
import toast from 'react-hot-toast'

interface MsgTpl {
  id: string; stage: string; trigger_type: string; channel: string
  body: string; mode: string; variables_used: string[]; attached_file_types: string[]
}

const STAGE_ORDER_MSG = ['accueil','visite_a_gerer','visite_confirmee','visite_terminee','negociation','reservation','vente','relancement','perdue']
const TRIGGER_LABELS: Record<string, string> = {
  welcome: 'Bienvenue', catalogue: 'Envoi catalogue', relance_1: 'Relance 1', relance_2: 'Relance 2 (SMS)',
  confirm_visite: 'Confirmation visite', rappel_j1: 'Rappel J-1', rappel_jourj: 'Rappel jour J',
  no_show: 'No-show', post_visite: 'Suivi post-visite', simulation: 'Simulation prix',
  collect_cin: 'Collecte CIN', felicitations: 'Félicitations vente', rappel_echeance: 'Rappel échéance',
  retard_paiement: 'Retard paiement', raison_perte: 'Raison perte',
}
const CHANNEL_LABELS_MSG: Record<string, string> = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', call: 'Appel' }
const VARIABLES_LIST = ['{client_nom}','{client_prenom}','{client_phone}','{client_budget}','{agent_nom}','{agent_prenom}','{agent_phone}','{agence}','{projet}','{prix_min}','{unite_visitee}','{prix_unite}','{date_visite}','{heure_visite}','{adresse_projet}','{lien_maps}','{montant_echeance}','{date_echeance}','{apport}','{nb_echeances}']

export function MessagesTemplateTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editChannel, setEditChannel] = useState('whatsapp')
  const [editMode, setEditMode] = useState('template')

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['all-message-templates', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('message_templates').select('*').eq('tenant_id', tenantId).order('sort_order')
      return (data ?? []) as MsgTpl[]
    },
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editId) return
      const { error } = await supabase.from('message_templates').update({
        body: editBody, channel: editChannel, mode: editMode, updated_at: new Date().toISOString(),
      } as never).eq('id', editId)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-message-templates'] }); setEditId(null); toast.success('Message sauvegardé') },
    onError: (err: Error) => toast.error(err.message),
  })

  const addMutation = useMutation({
    mutationFn: async ({ stage, trigger }: { stage: string; trigger: string }) => {
      const { error } = await supabase.from('message_templates').insert({
        tenant_id: tenantId, stage, trigger_type: trigger, channel: 'whatsapp',
        body: `Bonjour {client_prenom},\n\n[Votre message ici]\n\nCordialement,\n{agent_prenom}`,
        mode: 'template', variables_used: ['{client_prenom}', '{agent_prenom}'],
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-message-templates'] }); toast.success('Template ajouté') },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('message_templates').delete().eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['all-message-templates'] }); toast.success('Supprimé') },
    onError: (err: Error) => toast.error(err.message),
  })

  function startEdit(msg: MsgTpl) {
    setEditId(msg.id); setEditBody(msg.body.replace(/\\n/g, '\n')); setEditChannel(msg.channel); setEditMode(msg.mode)
  }

  if (isLoading) return <LoadingSpinner size="lg" className="h-64" />

  // Group by stage
  const grouped = new Map<string, MsgTpl[]>()
  for (const m of messages) {
    const list = grouped.get(m.stage) ?? []
    list.push(m)
    grouped.set(m.stage, list)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-immo-text-primary">Templates de messages</h2>
          <p className="text-sm text-immo-text-secondary">Personnalisez les messages WhatsApp, SMS et email envoyés à chaque étape.</p>
        </div>
      </div>

      {STAGE_ORDER_MSG.map(stage => {
        const stageMsgs = grouped.get(stage) ?? []
        if (stageMsgs.length === 0 && !editId) return null
        const stageInfo = PIPELINE_STAGES[stage as keyof typeof PIPELINE_STAGES]
        if (!stageInfo) return null

        return (
          <div key={stage} className="overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card">
            <div className="flex items-center justify-between border-b border-immo-border-default bg-immo-bg-primary px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stageInfo.color }} />
                <span className="text-sm font-semibold text-immo-text-primary">{stageInfo.label}</span>
                <span className="text-[10px] text-immo-text-muted">({stageMsgs.length} messages)</span>
              </div>
              <button onClick={() => addMutation.mutate({ stage, trigger: `custom_${Date.now()}` })}
                className="flex items-center gap-1 rounded-md border border-immo-border-default px-2 py-1 text-[10px] font-medium text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
                <Plus className="h-3 w-3" /> Ajouter
              </button>
            </div>

            <div className="divide-y divide-immo-border-default">
              {stageMsgs.map(msg => (
                <div key={msg.id}>
                  {editId === msg.id ? (
                    /* Edit mode */
                    <div className="space-y-3 bg-immo-accent-green/[0.02] p-4">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <div className="mb-2 flex gap-2">
                            <select value={editChannel} onChange={e => setEditChannel(e.target.value)}
                              className="h-7 rounded-md border border-immo-border-default bg-immo-bg-primary px-2 text-[11px] text-immo-text-primary">
                              <option value="whatsapp">WhatsApp</option>
                              <option value="sms">SMS</option>
                              <option value="email">Email</option>
                            </select>
                            <select value={editMode} onChange={e => setEditMode(e.target.value)}
                              className="h-7 rounded-md border border-immo-border-default bg-immo-bg-primary px-2 text-[11px] text-immo-text-primary">
                              <option value="template">Template fixe</option>
                              <option value="ai">Génération IA</option>
                            </select>
                          </div>
                          {editMode === 'template' ? (
                            <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={6}
                              className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary p-3 font-mono text-sm text-immo-text-primary" />
                          ) : (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                              <div className="mb-2 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                                <span className="text-[11px] font-semibold text-blue-600">Mode IA</span>
                              </div>
                              <p className="text-xs text-blue-600">Le message sera généré automatiquement par l'IA en fonction du profil client et du playbook.</p>
                              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={3} placeholder="Instructions supplémentaires pour l'IA (optionnel)…"
                                className="mt-2 w-full rounded-md border border-blue-200 bg-white p-2 text-xs text-blue-700 placeholder:text-blue-300" />
                            </div>
                          )}
                        </div>
                      </div>

                      {editMode === 'template' && (
                        <div>
                          <p className="mb-1.5 text-[9px] font-medium text-immo-text-muted">Variables (cliquer pour insérer)</p>
                          <div className="flex flex-wrap gap-1">
                            {VARIABLES_LIST.map(v => (
                              <button key={v} onClick={() => setEditBody(prev => prev + v)}
                                className="rounded border border-immo-border-default bg-immo-bg-primary px-1.5 py-0.5 text-[9px] text-immo-accent-blue hover:bg-immo-accent-blue/10">
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
                          className="flex items-center gap-1 rounded-lg bg-immo-accent-green px-3 py-1.5 text-xs font-semibold text-white hover:bg-immo-accent-green/90">
                          <Save className="h-3 w-3" /> Sauvegarder
                        </button>
                        <button onClick={() => setEditId(null)} className="rounded-lg border border-immo-border-default px-3 py-1.5 text-xs text-immo-text-muted">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    /* View mode */
                    <div className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-immo-bg-card-hover">
                      <div className={`mt-0.5 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                        msg.channel === 'whatsapp' ? 'bg-[#25D366]/10 text-[#25D366]' :
                        msg.channel === 'sms' ? 'bg-immo-status-orange/10 text-immo-status-orange' :
                        'bg-immo-accent-blue/10 text-immo-accent-blue'
                      }`}>
                        {msg.channel === 'whatsapp' ? <MessageCircle className="h-2.5 w-2.5" /> : msg.channel === 'sms' ? <Mail className="h-2.5 w-2.5" /> : <Mail className="h-2.5 w-2.5" />}
                        {CHANNEL_LABELS_MSG[msg.channel] ?? msg.channel}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="text-xs font-semibold text-immo-text-primary">{TRIGGER_LABELS[msg.trigger_type] ?? msg.trigger_type}</span>
                          {msg.mode === 'ai' && <span className="flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-semibold text-blue-600"><Sparkles className="h-2 w-2" /> IA</span>}
                        </div>
                        <p className="line-clamp-2 whitespace-pre-line font-mono text-[11px] text-immo-text-muted">
                          {(msg.body || (msg.mode === 'ai' ? 'Généré automatiquement par l\'IA' : 'Message vide')).replace(/\\n/g, '\n')}
                        </p>
                        {msg.attached_file_types.length > 0 && (
                          <div className="mt-1 flex gap-1">
                            {msg.attached_file_types.map(f => <span key={f} className="rounded bg-immo-accent-blue/10 px-1.5 py-0.5 text-[8px] text-immo-accent-blue">📎 {f}</span>)}
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 gap-1">
                        <button onClick={() => startEdit(msg)} aria-label="Modifier le modèle" className="rounded-md p-1.5 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-blue/40">
                          <FileText className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => deleteMutation.mutate(msg.id)} aria-label="Supprimer le modèle" className="rounded-md p-1.5 text-immo-text-muted transition-colors hover:bg-immo-status-red/10 hover:text-immo-status-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-red/40">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
