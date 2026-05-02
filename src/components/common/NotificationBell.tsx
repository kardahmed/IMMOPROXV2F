import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, CreditCard, Clock, Users, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Notification {
  id: string
  type: string
  title: string
  message: string | null
  read: boolean
  created_at: string
}

const TYPE_ICONS: Record<string, typeof Bell> = {
  payment_reminder: CreditCard,
  reservation_expiring: Clock,
  client_relaunch: Users,
}

const TYPE_COLORS: Record<string, string> = {
  payment_reminder: 'text-immo-status-orange',
  reservation_expiring: 'text-immo-status-red',
  client_relaunch: 'text-immo-accent-blue',
}

export function NotificationBell() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const { data: notifications = [] } = useQuery({
    queryKey: ['tenant-notifications', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const { data } = await supabase
        .from('notifications')
        .select('id, type, title, message, read, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20)
      return (data ?? []) as Notification[]
    },
    enabled: !!tenantId,
    refetchInterval: 60_000,
  })

  const unread = notifications.filter(n => !n.read).length

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!tenantId) return
      await supabase.from('notifications').update({ read: true } as never).eq('tenant_id', tenantId).eq('read', false)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-notifications'] }),
  })

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label={unread > 0 ? t('notifications.aria_unread', { count: unread }) : t('notifications.aria_label')}
        aria-expanded={open}
        className="relative rounded-lg p-2 text-immo-text-muted transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-immo-status-red text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-xl border border-immo-border-default bg-immo-bg-card shadow-lg">
          <div className="flex items-center justify-between border-b border-immo-border-default px-4 py-3">
            <h3 className="text-sm font-semibold text-immo-text-primary">Notifications</h3>
            {unread > 0 && (
              <button onClick={() => markAllRead.mutate()} className="flex items-center gap-1 text-[11px] text-immo-accent-green hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-[400px] divide-y divide-immo-border-default overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-immo-text-muted">Aucune notification</div>
            ) : (
              notifications.map(n => {
                const Icon = TYPE_ICONS[n.type] ?? AlertTriangle
                const color = TYPE_COLORS[n.type] ?? 'text-immo-text-muted'
                return (
                  <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${!n.read ? 'bg-immo-accent-green/[0.03]' : ''}`}>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!n.read ? 'font-medium text-immo-text-primary' : 'text-immo-text-secondary'}`}>{n.title}</p>
                      {n.message && <p className="mt-0.5 text-[11px] text-immo-text-muted">{n.message}</p>}
                      <p className="mt-1 text-[10px] text-immo-text-muted">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                    {!n.read && <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-immo-accent-green" />}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
