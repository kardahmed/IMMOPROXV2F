import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, AlertTriangle, Bell, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { LoadingSpinner, PageHeader } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

const inputClass = 'border-immo-border-default bg-immo-bg-card text-immo-text-primary placeholder-immo-text-muted'

export function PlatformSettingsPage() {
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_settings').select('*').limit(1).single()
      if (error) { handleSupabaseError(error); throw error }
      return data as { id: string; platform_name: string; version: string; support_email: string; maintenance_mode: boolean; anthropic_api_key: string | null; openai_api_key: string | null; default_ai_provider: string }
    },
  })

  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [maintenance, setMaintenance] = useState(false)
  const [anthropicKey, setAnthropicKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [aiProvider, setAiProvider] = useState('anthropic')

  useEffect(() => {
    if (settings) {
      setName(settings.platform_name)
      setVersion(settings.version)
      setSupportEmail(settings.support_email)
      setMaintenance(settings.maintenance_mode)
      setAnthropicKey(settings.anthropic_api_key ?? '')
      setOpenaiKey(settings.openai_api_key ?? '')
      setAiProvider(settings.default_ai_provider ?? 'anthropic')
    }
  }, [settings])

  const save = useMutation({
    mutationFn: async () => {
      if (!settings) return
      const { error } = await supabase.from('platform_settings').update({
        platform_name: name,
        version,
        support_email: supportEmail,
        maintenance_mode: maintenance,
        anthropic_api_key: anthropicKey || null,
        openai_api_key: openaiKey || null,
        default_ai_provider: aiProvider,
        updated_at: new Date().toISOString(),
      } as never).eq('id', settings.id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings'] })
      toast.success('Paramètres enregistrés')
    },
  })

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parametres de la plateforme"
        subtitle="Configuration globale IMMO PRO-X"
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* General settings */}
        <div className="space-y-5 rounded-xl border border-immo-border-default bg-immo-bg-card p-6">
          <h3 className="text-sm font-semibold text-immo-text-primary">General</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] font-medium text-immo-text-secondary">Nom de la plateforme</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <Label className="text-[11px] font-medium text-immo-text-secondary">Version</Label>
              <Input value={version} onChange={e => setVersion(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-medium text-immo-text-secondary">Email de support</Label>
            <Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="support@immoprox.io" className={inputClass} />
          </div>

          <div className="rounded-lg border border-immo-border-default p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 ${maintenance ? 'text-immo-status-red' : 'text-immo-text-secondary'}`} />
                <div>
                  <p className="text-sm font-medium text-immo-text-primary">Mode maintenance</p>
                  <p className="text-[11px] text-immo-text-secondary">Bloque l'acces a tous les utilisateurs</p>
                </div>
              </div>
              <button
                onClick={() => setMaintenance(!maintenance)}
                className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${maintenance ? 'bg-immo-status-red' : 'bg-immo-border-default'}`}
              >
                <div className={`h-5 w-5 rounded-full bg-white transition-transform ${maintenance ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="space-y-4 rounded-xl border border-[#7C3AED]/20 bg-[#7C3AED]/5 p-6">
          <div>
            <h3 className="text-sm font-semibold text-[#7C3AED]">Configuration IA</h3>
            <p className="mt-1 text-[11px] text-immo-text-muted">Les cles API sont utilisees par toutes les fonctionnalites IA de la plateforme. Les tenants y accedent selon leur plan.</p>
          </div>
          <div>
            <Label className="text-[11px] font-medium text-immo-text-muted">Fournisseur IA par defaut</Label>
            <select value={aiProvider} onChange={e => setAiProvider(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary">
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] font-medium text-immo-text-muted">Cle API Anthropic</Label>
              <Input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className={inputClass} />
            </div>
            <div>
              <Label className="text-[11px] font-medium text-immo-text-muted">Cle API OpenAI</Label>
              <Input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." className={inputClass} />
            </div>
          </div>
          <p className="text-[10px] text-immo-text-muted">
            Acces IA par plan : Free = aucun | Starter = suggestions | Pro = suggestions + scripts + documents | Enterprise = tout
          </p>
        </div>
      </div>

      <div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          variant="purple"
        >
          {save.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <><Save className="mr-1.5 h-4 w-4" /> Enregistrer</>}
        </Button>
      </div>

      {/* Alerts Configuration */}
      <AlertsSection />
    </div>
  )
}

/* ─── Alerts Section ─── */

interface PlatformAlert {
  id: string
  type: string
  threshold: number
  channel: string
  webhook_url: string | null
  is_active: boolean
}

const ALERT_TYPES = [
  { value: 'payment_overdue', label: 'Paiements en retard' },
  { value: 'tenant_inactive', label: 'Tenant inactif (jours)' },
  { value: 'error_spike', label: 'Pic d\'erreurs' },
  { value: 'new_signup', label: 'Nouvelle inscription' },
  { value: 'storage_limit', label: 'Limite stockage (%)' },
]

function AlertsSection() {
  const qc = useQueryClient()

  const { data: alerts = [] } = useQuery({
    queryKey: ['platform-alerts'],
    queryFn: async () => {
      const { data } = await supabase.from('platform_alerts').select('*').order('created_at')
      return (data ?? []) as PlatformAlert[]
    },
  })

  const addAlert = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('platform_alerts').insert({
        type: 'payment_overdue',
        threshold: 5,
        channel: 'email',
        is_active: true,
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-alerts'] }); toast.success('Alerte ajoutée') },
  })

  const updateAlert = useMutation({
    mutationFn: async (alert: Partial<PlatformAlert> & { id: string }) => {
      const { id, ...payload } = alert
      const { error } = await supabase.from('platform_alerts').update(payload as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-alerts'] }),
  })

  const deleteAlert = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('platform_alerts').delete().eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['platform-alerts'] }); toast.success('Alerte supprimée') },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-immo-text-primary">Alertes plateforme</h2>
          <p className="text-sm text-immo-text-secondary">Configurez des alertes automatiques par email ou webhook</p>
        </div>
        <Button onClick={() => addAlert.mutate()} disabled={addAlert.isPending} variant="purple">
          <Plus className="mr-1.5 h-4 w-4" /> Ajouter
        </Button>
      </div>

      {alerts.length === 0 && (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-8 text-center">
          <Bell className="mx-auto mb-2 h-8 w-8 text-immo-text-muted" />
          <p className="text-sm text-immo-text-secondary">Aucune alerte configuree</p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {alerts.map(alert => (
          <div key={alert.id} className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
            <div className="flex items-start gap-3">
              {/* Active toggle */}
              <button
                onClick={() => updateAlert.mutate({ id: alert.id, is_active: !alert.is_active })}
                className={`mt-1 flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${alert.is_active ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}
              >
                <div className={`h-4 w-4 rounded-full bg-white transition-transform ${alert.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>

              <div className="flex-1 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {/* Type */}
                  <div>
                    <Label className="text-[10px] font-medium text-immo-text-muted">Type</Label>
                    <select
                      value={alert.type}
                      onChange={e => updateAlert.mutate({ id: alert.id, type: e.target.value })}
                      className="mt-1 h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary"
                    >
                      {ALERT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Threshold */}
                  <div>
                    <Label className="text-[10px] font-medium text-immo-text-muted">Seuil</Label>
                    <Input
                      type="number"
                      value={alert.threshold}
                      onChange={e => updateAlert.mutate({ id: alert.id, threshold: parseInt(e.target.value) || 0 })}
                      className="mt-1 border-immo-border-default bg-immo-bg-primary text-immo-text-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Channel */}
                  <div>
                    <Label className="text-[10px] font-medium text-immo-text-muted">Canal</Label>
                    <select
                      value={alert.channel}
                      onChange={e => updateAlert.mutate({ id: alert.id, channel: e.target.value })}
                      className="mt-1 h-9 w-full rounded-md border border-immo-border-default bg-immo-bg-primary px-3 text-sm text-immo-text-primary"
                    >
                      <option value="email">Email</option>
                      <option value="telegram">Telegram</option>
                      <option value="slack">Slack</option>
                      <option value="discord">Discord</option>
                      <option value="webhook">Webhook</option>
                    </select>
                  </div>

                  {/* Webhook URL (shown for telegram, slack, discord, webhook) */}
                  {['webhook', 'telegram', 'slack', 'discord'].includes(alert.channel) && (
                    <div>
                      <Label className="text-[10px] font-medium text-immo-text-muted">
                        {alert.channel === 'telegram' ? 'Bot Token : Chat ID' :
                         alert.channel === 'slack' ? 'Slack Webhook URL' :
                         alert.channel === 'discord' ? 'Discord Webhook URL' : 'Webhook URL'}
                      </Label>
                      <Input
                        value={alert.webhook_url ?? ''}
                        onChange={e => updateAlert.mutate({ id: alert.id, webhook_url: e.target.value || null })}
                        placeholder={
                          alert.channel === 'telegram' ? 'bot_token:chat_id' :
                          alert.channel === 'slack' ? 'https://hooks.slack.com/services/...' :
                          alert.channel === 'discord' ? 'https://discord.com/api/webhooks/...' : 'https://...'
                        }
                        className="mt-1 border-immo-border-default bg-immo-bg-primary text-immo-text-primary"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => deleteAlert.mutate(alert.id)}
                disabled={deleteAlert.isPending}
                className="mt-1 rounded-lg p-1.5 text-immo-text-muted hover:bg-immo-status-red/10 hover:text-immo-status-red disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
