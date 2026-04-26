import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { subDays } from 'date-fns'

export type HealthStatus = 'healthy' | 'warning' | 'critical'

export interface TenantHealth {
  tenant_id: string
  tenant_name: string
  status: HealthStatus
  issues: string[]
  last_activity: string | null
  days_inactive: number
  late_payments: number
  expiring_reservations: number
}

export interface HealthSummary {
  tenants: TenantHealth[]
  critical_count: number
  warning_count: number
  healthy_count: number
  alerts: HealthAlert[]
}

export interface HealthAlert {
  type: 'inactive_tenant' | 'late_payments' | 'expiring_reservations' | 'no_agents'
  severity: 'critical' | 'warning'
  tenant_id: string
  tenant_name: string
  message: string
}

export function useTenantHealth() {
  return useQuery({
    queryKey: ['super-admin-tenant-health'],
    queryFn: async (): Promise<HealthSummary> => {
      // Fetch all active tenants (excludes soft-deleted and suspended).
      // A deleted/suspended tenant being "inactive 999 days" is not a
      // critical alert — it's the expected state.
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id, name')
        .is('deleted_at', null)
        .is('suspended_at', null)
      if (!tenants || tenants.length === 0) {
        return { tenants: [], critical_count: 0, warning_count: 0, healthy_count: 0, alerts: [] }
      }

      const now = new Date()
      const twoDaysFromNow = subDays(now, -2).toISOString()

      // Fetch latest activity per tenant (one per tenant, most recent)
      const { data: recentHistory } = await supabase
        .from('history')
        .select('tenant_id, created_at')
        .order('created_at', { ascending: false })
        .limit(500)

      // Group by tenant — latest activity
      const lastActivityMap = new Map<string, string>()
      for (const h of recentHistory ?? []) {
        if (!lastActivityMap.has(h.tenant_id) && h.created_at) {
          lastActivityMap.set(h.tenant_id, h.created_at)
        }
      }

      // Fetch late payments count per tenant
      const { data: latePayments } = await supabase
        .from('payment_schedules')
        .select('tenant_id')
        .eq('status', 'late')

      const lateByTenant = new Map<string, number>()
      for (const p of latePayments ?? []) {
        lateByTenant.set(p.tenant_id, (lateByTenant.get(p.tenant_id) ?? 0) + 1)
      }

      // Fetch expiring reservations (next 2 days)
      const { data: expiringRes } = await supabase
        .from('reservations')
        .select('tenant_id')
        .eq('status', 'active')
        .lte('expires_at', twoDaysFromNow)

      const expiringByTenant = new Map<string, number>()
      for (const r of expiringRes ?? []) {
        expiringByTenant.set(r.tenant_id, (expiringByTenant.get(r.tenant_id) ?? 0) + 1)
      }

      // Fetch agent counts per tenant
      const { data: agents } = await supabase
        .from('users')
        .select('tenant_id')
        .in('role', ['agent', 'admin'])
        .eq('status', 'active')

      const agentsByTenant = new Map<string, number>()
      for (const a of agents ?? []) {
        if (a.tenant_id) agentsByTenant.set(a.tenant_id, (agentsByTenant.get(a.tenant_id) ?? 0) + 1)
      }

      // Build health per tenant
      const alerts: HealthAlert[] = []
      const healthList: TenantHealth[] = tenants.map(t => {
        const issues: string[] = []
        const lastAct = lastActivityMap.get(t.id) ?? null
        const daysInactive = lastAct
          ? Math.floor((now.getTime() - new Date(lastAct).getTime()) / (1000 * 60 * 60 * 24))
          : 999
        const late = lateByTenant.get(t.id) ?? 0
        const expiring = expiringByTenant.get(t.id) ?? 0
        const agentCount = agentsByTenant.get(t.id) ?? 0

        // Check issues
        if (agentCount === 0) {
          issues.push('Aucun agent actif')
          alerts.push({ type: 'no_agents', severity: 'critical', tenant_id: t.id, tenant_name: t.name, message: `${t.name} — aucun agent actif` })
        }
        if (daysInactive >= 7) {
          issues.push(`Inactif depuis ${daysInactive}j`)
          alerts.push({ type: 'inactive_tenant', severity: 'critical', tenant_id: t.id, tenant_name: t.name, message: `${t.name} — inactif depuis ${daysInactive} jours` })
        } else if (daysInactive >= 3) {
          issues.push(`Activite faible (${daysInactive}j)`)
          alerts.push({ type: 'inactive_tenant', severity: 'warning', tenant_id: t.id, tenant_name: t.name, message: `${t.name} — activite faible (${daysInactive}j)` })
        }
        if (late > 0) {
          issues.push(`${late} paiement(s) en retard`)
          alerts.push({ type: 'late_payments', severity: late >= 5 ? 'critical' : 'warning', tenant_id: t.id, tenant_name: t.name, message: `${t.name} — ${late} paiement(s) en retard` })
        }
        if (expiring > 0) {
          issues.push(`${expiring} reservation(s) expire(nt) bientot`)
          alerts.push({ type: 'expiring_reservations', severity: 'warning', tenant_id: t.id, tenant_name: t.name, message: `${t.name} — ${expiring} reservation(s) expire(nt) sous 48h` })
        }

        let status: HealthStatus = 'healthy'
        if (issues.some(i => i.includes('Inactif') || i.includes('Aucun agent'))) status = 'critical'
        else if (issues.length > 0) status = 'warning'

        return { tenant_id: t.id, tenant_name: t.name, status, issues, last_activity: lastAct, days_inactive: daysInactive, late_payments: late, expiring_reservations: expiring }
      })

      // Sort: critical first, then warning, then healthy
      const order: Record<HealthStatus, number> = { critical: 0, warning: 1, healthy: 2 }
      healthList.sort((a, b) => order[a.status] - order[b.status])
      alerts.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1))

      return {
        tenants: healthList,
        critical_count: healthList.filter(t => t.status === 'critical').length,
        warning_count: healthList.filter(t => t.status === 'warning').length,
        healthy_count: healthList.filter(t => t.status === 'healthy').length,
        alerts,
      }
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 min
  })
}
