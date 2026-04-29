import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Phone, MessageCircle, Mail, Users, ClipboardList, Zap, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import {
  AUTOMATIONS,
  AUTOMATIONS_BY_STAGE,
  STAGE_LABELS,
  STAGE_ORDER,
  CHANNEL_LABELS,
  MODE_LABELS,
  type AutomationChannel,
  type AutomationMode,
} from '@/lib/automationCatalog'
import toast from 'react-hot-toast'

interface SettingRow {
  automation_key: string
  channel: AutomationChannel
  mode: AutomationMode
  template_name: string | null
  offset_minutes: number | null
  updated_at: string
}

const CHANNEL_ICONS: Record<AutomationChannel, typeof Phone> = {
  whatsapp: MessageCircle,
  call: Phone,
  email: Mail,
  in_person: Users,
  internal: ClipboardList,
}

const MODE_OPTIONS: AutomationMode[] = ['auto', 'manual', 'disabled']

const MODE_BADGE_CLASS: Record<AutomationMode, string> = {
  auto: 'bg-green-100 text-green-800 ring-green-200',
  manual: 'bg-orange-100 text-orange-800 ring-orange-200',
  disabled: 'bg-gray-100 text-gray-600 ring-gray-200',
}

export function AutomationsSection() {
  const { tenantId } = useAuthStore()
  const userId = useAuthStore(s => s.session?.user?.id)
  const qc = useQueryClient()

  // Local edit state — staged changes before user clicks Save.
  const [pending, setPending] = useState<Record<string, AutomationMode>>({})

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['tenant-automation-settings', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_automation_settings' as never)
        .select('automation_key, channel, mode, template_name, offset_minutes, updated_at')
        .eq('tenant_id', tenantId!)
      if (error) throw new Error(handleSupabaseError(error))
      return (data ?? []) as SettingRow[]
    },
  })

  const settingsByKey = useMemo(() => {
    const map = new Map<string, SettingRow>()
    for (const row of settings) map.set(row.automation_key, row)
    return map
  }, [settings])

  const dirty = Object.keys(pending).length > 0

  // Reset pending when the underlying data changes (after save) to avoid
  // stale toggles staying highlighted.
  useEffect(() => {
    setPending({})
  }, [settings.length])

  const save = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(pending).map(([automation_key, mode]) => ({
        tenant_id: tenantId!,
        automation_key,
        mode,
        // upsert needs the channel + template_name to satisfy NOT NULL —
        // pull them from the catalog so a row that was somehow missing
        // gets recreated cleanly.
        channel: AUTOMATIONS.find(a => a.key === automation_key)?.channel ?? 'whatsapp',
        template_name: settingsByKey.get(automation_key)?.template_name ?? null,
        offset_minutes: settingsByKey.get(automation_key)?.offset_minutes ?? null,
        updated_by: userId ?? null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('tenant_automation_settings' as never)
        .upsert(updates as never, { onConflict: 'tenant_id,automation_key' })

      if (error) throw new Error(handleSupabaseError(error))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-automation-settings', tenantId] })
      toast.success(`${Object.keys(pending).length} modification(s) enregistrée(s)`)
      setPending({})
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  function effectiveMode(key: string): AutomationMode {
    if (key in pending) return pending[key]
    const row = settingsByKey.get(key)
    if (row) return row.mode
    return AUTOMATIONS.find(a => a.key === key)?.defaultMode ?? 'manual'
  }

  function setMode(key: string, mode: AutomationMode) {
    const current = settingsByKey.get(key)?.mode ?? AUTOMATIONS.find(a => a.key === key)?.defaultMode ?? 'manual'
    setPending(prev => {
      const next = { ...prev }
      if (mode === current) {
        // user reverted to original — drop from pending
        delete next[key]
      } else {
        next[key] = mode
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-immo-border-default pb-4">
        <div>
          <h2 className="text-xl font-semibold text-immo-text-primary">Automations</h2>
          <p className="mt-1 max-w-2xl text-sm text-immo-text-secondary">
            Choisissez ce qu'IMMO PRO-X fait <strong>automatiquement</strong>, ce que vous voulez
            <strong> valider manuellement</strong>, et ce que vous préférez <strong>désactiver</strong>.
            Les 25 touchpoints couvrent l'intégralité du cycle de vente, du premier contact à l'après-signature.
          </p>
        </div>
        <Button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="shrink-0 gap-2"
        >
          <Save className="h-4 w-4" />
          {save.isPending
            ? 'Enregistrement...'
            : dirty
              ? `Enregistrer ${Object.keys(pending).length} modification(s)`
              : 'Aucune modification'}
        </Button>
      </header>

      {/* Mode legend */}
      <div className="grid gap-3 sm:grid-cols-3">
        {(['auto', 'manual', 'disabled'] as AutomationMode[]).map(mode => (
          <div key={mode} className="rounded-lg border border-immo-border-default p-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${MODE_BADGE_CLASS[mode]}`}>
                {MODE_LABELS[mode].label}
              </span>
            </div>
            <p className="mt-2 text-xs text-immo-text-secondary">{MODE_LABELS[mode].description}</p>
          </div>
        ))}
      </div>

      {/* Stages */}
      {STAGE_ORDER.map(stage => {
        const items = AUTOMATIONS_BY_STAGE[stage] ?? []
        if (items.length === 0) return null
        const stageInfo = STAGE_LABELS[stage]
        return (
          <section key={stage} className="overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card">
            <header
              className="flex items-center gap-3 border-b border-immo-border-default px-4 py-3"
              style={{ backgroundColor: `${stageInfo.color}10` }}
            >
              <span className="text-lg" aria-hidden>{stageInfo.emoji}</span>
              <h3 className="font-semibold text-immo-text-primary">{stageInfo.label}</h3>
              <span className="ml-auto text-xs text-immo-text-secondary">
                {items.length} touchpoint{items.length > 1 ? 's' : ''}
              </span>
            </header>
            <ul className="divide-y divide-immo-border-default">
              {items.map(def => {
                const Icon = CHANNEL_ICONS[def.channel] ?? Zap
                const current = effectiveMode(def.key)
                const isPending = def.key in pending
                return (
                  <li key={def.key} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4 ${isPending ? 'bg-blue-50' : ''}`}>
                    <div className="flex shrink-0 items-center gap-3 sm:w-72">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-immo-bg-page text-immo-text-secondary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-immo-text-primary">{def.label}</p>
                        <p className="text-xs text-immo-text-tertiary">
                          {CHANNEL_LABELS[def.channel]} · {def.offsetLabel}
                          {isPending && <span className="ml-2 text-blue-600">• modifié</span>}
                        </p>
                      </div>
                    </div>
                    <p className="min-w-0 flex-1 text-xs text-immo-text-secondary">
                      {def.description}
                    </p>
                    <div className="flex shrink-0 gap-1 rounded-lg bg-immo-bg-page p-1" role="radiogroup" aria-label={`Mode pour ${def.label}`}>
                      {MODE_OPTIONS.map(mode => {
                        const active = current === mode
                        return (
                          <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => setMode(def.key, mode)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                              active
                                ? `${MODE_BADGE_CLASS[mode]} ring-1`
                                : 'text-immo-text-secondary hover:text-immo-text-primary'
                            }`}
                          >
                            {MODE_LABELS[mode].label}
                          </button>
                        )
                      })}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}

      {/* Hint */}
      <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <AlertCircle className="h-5 w-5 shrink-0 text-blue-600" />
        <div className="text-sm text-blue-900">
          <p className="font-medium">À savoir</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
            <li>Les touchpoints WhatsApp en mode <strong>Automatique</strong> nécessitent une connexion WhatsApp Business active sur votre compte.</li>
            <li>Les touchpoints <strong>Appel</strong> apparaissent toujours comme tâches dans <code className="rounded bg-white px-1">/tasks</code> — l’agent reçoit un script IA personnalisé.</li>
            <li>En mode <strong>Désactivé</strong>, aucune tâche ni envoi n’est généré — vous gérez ce point hors plateforme.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
