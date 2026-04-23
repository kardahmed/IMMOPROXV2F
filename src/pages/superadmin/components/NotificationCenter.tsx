import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  tenant_id: string | null
  tenant_name: string | null
  read: boolean
  created_at: string
}

// We derive notifications from super_admin_logs + tenant health alerts
export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const userId = useAuthStore(s => s.session?.user?.id)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Build notifications from recent logs + health alerts
  const { data: notifications = [] } = useQuery({
    queryKey: ['super-admin-notifications'],
    queryFn: async (): Promise<Notification[]> => {
      const notifs: Notification[] = []

      // 1. Recent super_admin_logs (last 24h, not from this admin)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: logs } = await supabase
        .from('super_admin_logs')
        .select('*')
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20)

      for (const log of (logs ?? []) as Array<Record<string, unknown>>) {
        if (log.super_admin_id === userId) continue // skip own actions
        const details = log.details as Record<string, unknown> | null
        notifs.push({
          id: `log-${log.id}`,
          type: log.action as string,
          title: formatAction(log.action as string),
          message: details?.email as string ?? details?.tenant_name as string ?? '',
          tenant_id: log.tenant_id as string | null,
          tenant_name: details?.tenant_name as string ?? null,
          read: false,
          created_at: log.created_at as string,
        })
      }

      // 2. Late invoices across all tenants
      const { count: lateCount } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'overdue')

      if (lateCount && lateCount > 0) {
        notifs.unshift({
          id: 'alert-late-payments',
          type: 'alert',
          title: 'Paiements en retard',
          message: `${lateCount} paiement(s) en retard sur la plateforme`,
          tenant_id: null,
          tenant_name: null,
          read: false,
          created_at: new Date().toISOString(),
        })
      }

      // 3. Expiring reservations (next 48h)
      const twoDays = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      const { count: expiringCount } = await supabase
        .from('reservations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .lte('expires_at', twoDays)

      if (expiringCount && expiringCount > 0) {
        notifs.unshift({
          id: 'alert-expiring-res',
          type: 'alert',
          title: 'Reservations expirant',
          message: `${expiringCount} reservation(s) expirent sous 48h`,
          tenant_id: null,
          tenant_name: null,
          read: false,
          created_at: new Date().toISOString(),
        })
      }

      return notifs
    },
    refetchInterval: 3 * 60 * 1000, // every 3 min
  })

  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length

  function markAllRead() {
    setReadIds(new Set(notifications.map(n => n.id)))
  }

  function handleClick(n: Notification) {
    setReadIds(prev => new Set([...prev, n.id]))
    if (n.tenant_id) {
      navigate(`/admin/tenants/${n.tenant_id}`)
    }
    setOpen(false)
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} non lues)` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative rounded-lg p-2 text-immo-text-secondary transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-immo-status-red text-[9px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[380px] rounded-xl border border-immo-border-default bg-immo-bg-card shadow-2xl shadow-black/10">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-immo-border-default px-4 py-3">
            <h3 className="text-sm font-semibold text-immo-text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] text-[#7C3AED] hover:text-[#9F67FF]">
                <CheckCheck className="h-3.5 w-3.5" /> Tout marquer lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] divide-y divide-immo-border-default overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-immo-text-secondary">Aucune notification</div>
            ) : (
              notifications.map(n => {
                const isRead = readIds.has(n.id)
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-immo-bg-card-hover ${
                      !isRead ? 'bg-[#7C3AED]/5' : ''
                    }`}
                  >
                    {/* Dot */}
                    <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.type === 'alert' ? 'bg-immo-status-red' : !isRead ? 'bg-[#7C3AED]' : 'bg-immo-border-default'
                    }`} />

                    <div className="min-w-0 flex-1">
                      <p className={`text-sm ${!isRead ? 'font-medium text-immo-text-primary' : 'text-immo-text-secondary'}`}>{n.title}</p>
                      {n.message && <p className="mt-0.5 truncate text-[11px] text-immo-text-secondary">{n.message}</p>}
                      <p className="mt-1 text-[10px] text-immo-text-muted">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </div>

                    {n.tenant_id && <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-immo-text-muted" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatAction(action: string): string {
  const labels: Record<string, string> = {
    create_tenant: 'Nouveau tenant cree',
    create_user: 'Utilisateur cree',
    update_role: 'Role modifie',
    toggle_status: 'Statut modifie',
    reset_password: 'Mot de passe reinitialise',
    delete_user: 'Utilisateur supprime',
    change_plan: 'Plan modifie',
    duplicate_config: 'Configuration dupliquee',
  }
  return labels[action] ?? action
}
