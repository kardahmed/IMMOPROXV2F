import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, AlertTriangle, Bell, Plus, Trash2, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Card, PageHeader, PageSkeleton, ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

export function PlatformSettingsPage() {
  const qc = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('platform_settings').select('*').limit(1).single()
      if (error) { handleSupabaseError(error); throw error }
      return data as { id: string; platform_name: string; version: string; support_email: string; maintenance_mode: boolean }
    },
  })

  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [maintenance, setMaintenance] = useState(false)
  const [maintenanceConfirm, setMaintenanceConfirm] = useState<boolean | null>(null)

  useEffect(() => {
    if (settings) {
      setName(settings.platform_name)
      setVersion(settings.version)
      setSupportEmail(settings.support_email)
      setMaintenance(settings.maintenance_mode)
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
        updated_at: new Date().toISOString(),
      } as never).eq('id', settings.id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-settings'] })
      toast.success('Paramètres enregistrés')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (isLoading) return <PageSkeleton kpiCount={0} />

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parametres de la plateforme"
        subtitle="Configuration globale IMMO PRO-X"
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* General settings */}
        <Card className="space-y-5 p-6">
          <h3 className="text-sm font-semibold text-immo-text-primary">General</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-[11px] font-medium text-immo-text-secondary">Nom de la plateforme</Label>
              <Input value={name} onChange={e => setName(e.target.value)} variant="immo" />
            </div>
            <div>
              <Label className="text-[11px] font-medium text-immo-text-secondary">Version</Label>
              <Input value={version} onChange={e => setVersion(e.target.value)} variant="immo" />
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-medium text-immo-text-secondary">Email de support</Label>
            <Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="support@immoprox.io" variant="immo" />
          </div>

          <div className="rounded-lg border border-immo-border-default p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-5 w-5 ${maintenance ? 'text-immo-status-red' : 'text-immo-text-secondary'}`} />
                <div>
                  <p className="text-sm font-medium text-immo-text-primary">Mode maintenance</p>
                  <p className="text-[11px] text-immo-text-secondary">Bloque l'accès à tous les utilisateurs</p>
                </div>
              </div>
              {/* Audit (CRIT): un toggle global qui peut bloquer tous
                  les tenants ne doit JAMAIS s'activer en un clic.
                  Confirm explicite. */}
              <button
                onClick={() => setMaintenanceConfirm(!maintenance)}
                role="switch"
                aria-checked={maintenance}
                aria-label="Mode maintenance"
                className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0579DA]/40 ${maintenance ? 'bg-immo-status-red' : 'bg-immo-border-default'}`}
              >
                <div className={`h-5 w-5 rounded-full bg-white transition-transform ${maintenance ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </Card>

        {/* AI configuration — keys live in Edge Function secrets */}
        <div className="space-y-4 rounded-xl border border-[#0579DA]/20 bg-[#0579DA]/5 p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#0579DA]" />
            <div>
              <h3 className="text-sm font-semibold text-[#0579DA]">Configuration IA</h3>
              <p className="mt-1 text-[11px] text-immo-text-muted">
                Les clés API <strong>ANTHROPIC_API_KEY</strong> et <strong>OPENAI_API_KEY</strong> sont stockées
                dans les <strong>Edge Functions Secrets</strong> de Supabase (jamais exposées au client).
              </p>
              <p className="mt-2 text-[11px] text-immo-text-muted">
                Pour les modifier :
                <a
                  href="https://supabase.com/dashboard/project/lbnqccsebwiifxcucflg/settings/functions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ms-1 font-semibold text-[#0579DA] hover:underline"
                >
                  Dashboard → Edge Functions → Secrets
                </a>
              </p>
            </div>
          </div>
          <p className="text-[10px] text-immo-text-muted">
            Accès IA par plan : Free = aucun · Starter = suggestions · Pro = suggestions + scripts + documents · Enterprise = tout
          </p>
        </div>
      </div>

      <div>
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          variant="blue"
        >
          {save.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <><Save className="me-1.5 h-4 w-4" /> Enregistrer</>}
        </Button>
      </div>

      {/* Alerts Configuration */}
      <AlertsSection />

      <ConfirmDialog
        isOpen={maintenanceConfirm !== null}
        onClose={() => setMaintenanceConfirm(null)}
        onConfirm={() => {
          if (maintenanceConfirm !== null) setMaintenance(maintenanceConfirm)
          setMaintenanceConfirm(null)
        }}
        title={maintenanceConfirm ? 'Activer le mode maintenance ?' : 'Désactiver le mode maintenance ?'}
        description={
          maintenanceConfirm
            ? 'Tous les utilisateurs de tous les tenants seront bloqués hors de la plateforme jusqu\'à désactivation. À utiliser uniquement pour des opérations critiques. Pensez à sauvegarder ensuite.'
            : 'La plateforme redevient accessible à tous les tenants.'
        }
        confirmLabel={maintenanceConfirm ? 'Activer maintenance' : 'Désactiver maintenance'}
        confirmVariant={maintenanceConfirm ? 'danger' : 'default'}
      />
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
  { value: 'error_spike', label: 'Pic d\'erreurs (super_admin_logs)' },
  { value: 'error_logs_spike', label: 'Crashs front-end (24h)' },
  { value: 'tenant_rate_pressure', label: 'Tenant sous pression rate-limit' },
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
        <Button onClick={() => addAlert.mutate()} disabled={addAlert.isPending} variant="blue">
          <Plus className="me-1.5 h-4 w-4" /> Ajouter
        </Button>
      </div>

      {alerts.length === 0 && (
        <Card className="p-8 text-center">
          <Bell className="mx-auto mb-2 h-8 w-8 text-immo-text-muted" />
          <p className="text-sm text-immo-text-secondary">Aucune alerte configuree</p>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {alerts.map(alert => (
          <Card key={alert.id} className="p-4">
            <div className="flex items-start gap-3">
              {/* Active toggle */}
              <button
                onClick={() => updateAlert.mutate({ id: alert.id, is_active: !alert.is_active })}
                role="switch"
                aria-checked={alert.is_active}
                aria-label={alert.is_active ? "Desactiver l'alerte" : "Activer l'alerte"}
                className={`mt-1 flex h-5 w-9 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0579DA]/40 ${alert.is_active ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`}
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
                      variant="immo"
                      className="mt-1"
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
                        variant="immo"
                        className="mt-1"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => deleteAlert.mutate(alert.id)}
                disabled={deleteAlert.isPending}
                aria-label="Supprimer l'alerte"
                className="mt-1 rounded-lg p-1.5 text-immo-text-muted transition-colors hover:bg-immo-status-red/10 hover:text-immo-status-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-status-red/40 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
