import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Check, AlertTriangle, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { StatusBadge } from '@/components/common'
import { formatDistanceToNow } from 'date-fns'
import { fr as frLocale } from 'date-fns/locale'

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

export function WhatsAppSection() {
  const tenantId = useAuthStore(s => s.tenantId)

  // Tenant's plan + what that plan includes for WhatsApp
  const { data: planInfo } = useQuery({
    queryKey: ['wa-plan-info', tenantId],
    queryFn: async () => {
      const { data: tenant } = await supabase.from('tenants').select('plan').eq('id', tenantId!).single()
      const plan = tenant?.plan ?? 'free'
      const { data: limits } = await supabase
        .from('plan_limits')
        .select('features, max_whatsapp_messages')
        .eq('plan', plan)
        .single()
      const features = limits?.features as Record<string, boolean> | null
      return {
        plan,
        planLabel: PLAN_LABELS[plan] ?? plan,
        whatsappIncluded: features?.whatsapp === true,
        messagesIncluded: limits?.max_whatsapp_messages ?? 0,
      }
    },
    enabled: !!tenantId,
  })

  const { data: account } = useQuery({
    queryKey: ['wa-account', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_accounts').select('*').eq('tenant_id', tenantId!).single()
      return data as Record<string, unknown> | null
    },
    enabled: !!tenantId,
  })

  const { data: messages = [] } = useQuery({
    queryKey: ['wa-messages-tenant', tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('*, clients(full_name)')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(20)
      return (data ?? []) as Array<Record<string, unknown>>
    },
    enabled: !!tenantId,
  })

  const isActive = (account?.is_active as boolean) ?? false
  const sent = (account?.messages_sent as number) ?? 0
  const quota = (account?.monthly_quota as number) ?? 0
  const unlimited = planInfo?.messagesIncluded === -1 || quota > 99000
  const percentage = quota > 0 ? Math.round((sent / quota) * 100) : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-immo-text-primary">WhatsApp Business</h2>
        <p className="text-xs text-immo-text-muted">Envoi automatique de messages WhatsApp a vos clients</p>
      </div>

      {/* Plan entitlement card */}
      {planInfo && (
        <div className="rounded-xl border border-immo-border-default bg-gradient-to-br from-blue-500/5 to-green-500/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
              <Sparkles className="h-5 w-5 text-blue-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-immo-text-primary">
                Plan {planInfo.planLabel}
              </p>
              {planInfo.whatsappIncluded ? (
                <p className="mt-0.5 text-xs text-immo-text-secondary">
                  WhatsApp Business est inclus dans votre plan —{' '}
                  {unlimited
                    ? 'messages illimites'
                    : `${planInfo.messagesIncluded.toLocaleString('fr-FR')} messages/mois`}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-immo-text-muted">
                  WhatsApp Business n'est pas inclus dans votre plan actuel. Contactez l'administrateur IMMO PRO-X pour passer a un plan superieur.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status + quota card — only shown when the plan includes WhatsApp */}
      {planInfo?.whatsappIncluded && (
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? 'bg-green-500/10' : 'bg-immo-bg-card-hover'}`}>
                <MessageCircle className={`h-5 w-5 ${isActive ? 'text-green-500' : 'text-immo-text-muted'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-immo-text-primary">
                  {isActive ? 'Compte WhatsApp connecte' : 'Compte WhatsApp non connecte'}
                </p>
                <p className="text-xs text-immo-text-muted">
                  {isActive
                    ? `Numero ${(account?.display_phone as string | null) ?? 'configure'}`
                    : 'Contactez l\'administrateur pour connecter votre numero Meta WhatsApp Business.'}
                </p>
              </div>
            </div>
            <StatusBadge label={isActive ? 'Actif' : 'Inactif'} type={isActive ? 'green' : 'muted'} />
          </div>

          {isActive && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-immo-text-muted">Consommation du mois</span>
                <span className={`font-semibold ${percentage > 90 ? 'text-immo-status-red' : percentage > 70 ? 'text-immo-status-orange' : 'text-immo-accent-green'}`}>
                  {sent.toLocaleString('fr-FR')} / {unlimited ? 'Illimite' : quota.toLocaleString('fr-FR')} messages
                </span>
              </div>
              {!unlimited && (
                <div className="h-2 overflow-hidden rounded-full bg-immo-bg-primary">
                  <div
                    className={`h-full rounded-full transition-all ${percentage > 90 ? 'bg-immo-status-red' : percentage > 70 ? 'bg-immo-status-orange' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              )}
              {!unlimited && percentage > 90 && (
                <p className="flex items-center gap-1 text-[10px] text-immo-status-red">
                  <AlertTriangle className="h-3 w-3" /> Quota presque atteint. Contactez l'administrateur pour passer au plan superieur.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recent messages */}
      {isActive && messages.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-immo-text-primary">Messages recents</h3>
          <div className="overflow-hidden rounded-xl border border-immo-border-default">
            <div className="max-h-[300px] divide-y divide-immo-border-default overflow-y-auto">
              {messages.map(msg => (
                <div key={msg.id as string} className="flex items-center gap-3 bg-immo-bg-card px-4 py-3 hover:bg-immo-bg-card-hover">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${msg.status === 'failed' ? 'bg-immo-status-red/10' : 'bg-green-500/10'}`}>
                    {msg.status === 'failed' ? <AlertTriangle className="h-3.5 w-3.5 text-immo-status-red" /> : <Check className="h-3.5 w-3.5 text-green-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-immo-text-primary">{(msg.clients as { full_name: string } | null)?.full_name ?? (msg.to_phone as string)}</p>
                    <p className="text-[10px] text-immo-text-muted">{msg.template_name as string}</p>
                  </div>
                  <span className="text-[10px] text-immo-text-muted">
                    {formatDistanceToNow(new Date(msg.created_at as string), { addSuffix: true, locale: frLocale })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
