import { useQuery } from '@tanstack/react-query'
import { Bot, Mail, MessageCircle, Zap, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'

interface QuotaItem {
  used: number
  limit: number
  window_minutes?: number
}

interface QuotaSummary {
  plan: string
  period_end: string
  anthropic: QuotaItem
  resend: QuotaItem
  whatsapp: QuotaItem
  burst: QuotaItem
}

const SERVICES: Array<{
  key: 'anthropic' | 'resend' | 'whatsapp' | 'burst'
  label: string
  desc: string
  icon: typeof Bot
  accent: string
}> = [
  { key: 'anthropic', label: 'Suggestions IA',         desc: 'Anthropic — scripts d\'appel + classement d\'unités', icon: Bot,           accent: '#0579DA' },
  { key: 'resend',    label: 'Emails',                 desc: 'Resend — campagnes + notifications transactionnelles', icon: Mail,          accent: '#0579DA' },
  { key: 'whatsapp',  label: 'Messages WhatsApp',      desc: 'Meta Cloud — envois sortants vers les clients',        icon: MessageCircle, accent: '#22C55E' },
  { key: 'burst',     label: 'Limite anti-burst (1h)', desc: 'Tous services confondus — empêche les boucles infinies',         icon: Zap,           accent: '#F5A623' },
]

function fmtPercent(used: number, limit: number): number {
  if (limit === -1) return 0
  if (limit === 0) return 100
  return Math.min(100, Math.round((used / limit) * 100))
}

function statusColor(used: number, limit: number): { bar: string; text: string; bg: string } {
  if (limit === -1) return { bar: 'bg-immo-accent-green', text: 'text-immo-accent-green', bg: 'bg-immo-accent-green/10' }
  if (limit === 0) return  { bar: 'bg-immo-text-muted',   text: 'text-immo-text-muted',   bg: 'bg-immo-bg-card-hover' }
  const pct = (used / limit) * 100
  if (pct >= 90) return { bar: 'bg-immo-status-red',     text: 'text-immo-status-red',     bg: 'bg-immo-status-red/10' }
  if (pct >= 70) return { bar: 'bg-immo-status-orange',  text: 'text-immo-status-orange',  bg: 'bg-immo-status-orange/10' }
  return                  { bar: 'bg-immo-accent-green',  text: 'text-immo-accent-green',  bg: 'bg-immo-accent-green/10' }
}

export function QuotasSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['tenant-quota-self'],
    queryFn: async (): Promise<QuotaSummary> => {
      const { data, error } = await supabase.rpc('check_quota_self' as never)
      if (error) throw error
      return data as unknown as QuotaSummary
    },
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-immo-accent-green" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-immo-text-primary">Quotas & consommation</h2>
        <p className="text-sm text-immo-status-red">
          Impossible de charger vos quotas. Vérifiez que la migration 035 a été appliquée.
        </p>
      </div>
    )
  }

  const resetDate = format(new Date(data.period_end), 'd MMMM', { locale: fr })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-immo-text-primary">Quotas & consommation</h2>
        <p className="text-xs text-immo-text-muted">
          Limites mensuelles de votre plan
          <span className="ms-2 rounded-full bg-immo-accent-blue/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-immo-accent-blue">
            {data.plan}
          </span>
          <span className="ms-2 text-immo-text-muted">— réinitialisation au {resetDate}</span>
        </p>
      </div>

      <div className="space-y-3">
        {SERVICES.map(({ key, label, desc, icon: Icon, accent }) => {
          const item = data[key]
          const limit = item.limit
          const used = item.used
          const unlimited = limit === -1
          const disabled = limit === 0
          const pct = fmtPercent(used, limit)
          const colors = statusColor(used, limit)
          const isBurst = key === 'burst'

          return (
            <div
              key={key}
              className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${accent}15` }}
                >
                  <Icon className="h-5 w-5" style={{ color: accent }} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-immo-text-primary">{label}</p>
                    <p className={`shrink-0 text-xs font-semibold ${colors.text}`}>
                      {unlimited
                        ? 'Illimité'
                        : disabled
                        ? 'Non inclus'
                        : isBurst
                        ? `${used} / ${limit} (1 h)`
                        : `${used.toLocaleString('fr-FR')} / ${limit.toLocaleString('fr-FR')}`}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-immo-text-muted">{desc}</p>

                  {!unlimited && !disabled && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-immo-bg-primary">
                      <div
                        className={`h-full rounded-full transition-all ${colors.bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}

                  {!unlimited && !disabled && pct >= 90 && (
                    <p className="mt-2 text-[11px] font-medium text-immo-status-red">
                      ⚠️ Quota presque atteint. Pour augmenter,
                      contactez votre administrateur IMMO PRO-X.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-lg border border-immo-border-default/60 bg-immo-bg-primary p-3">
        <p className="text-[11px] text-immo-text-muted">
          💡 Les quotas se réinitialisent automatiquement le 1er du mois.
          La limite anti-burst protège votre compte des boucles accidentelles
          en bloquant temporairement après {data.burst.limit} appels en 1 heure.
        </p>
      </div>
    </div>
  )
}
