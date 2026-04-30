import { create } from 'zustand'
import { useAuthStore } from './authStore'
import { queryClient } from '@/lib/queryClient'

interface SuperAdminState {
  inspectedTenantId: string | null
  inspectedTenantName: string | null
  enterTenant: (tenantId: string, tenantName: string) => void
  leaveTenant: () => void
}

// Super-admin "view as tenant" mode.
//
// Setting `inspectedTenantId` alone wasn't enough: ~46 components in
// the app read `tenantId` directly from `authStore` (not through the
// `useTenant()` hook that knows about the inspection override), so
// the dashboard, pipeline, planning, etc. all loaded with `tenantId
// = null` and showed empty pages whenever a super admin clicked
// "Voir ce tenant". We mirror the inspected id into `authStore.tenantId`
// for the duration of the inspection so every consumer — old or new
// — sees the correct tenant. The super admin's profile.tenant_id is
// always null (super admins don't belong to a tenant), so this can't
// clobber a real tenancy.
//
// `ProtectedRoute` still gates the inspection separately on
// `inspectedTenantId`, so the "must select a tenant first" guard and
// the SuperAdminLayout banner keep working independently of the
// mirrored field.
export const useSuperAdminStore = create<SuperAdminState>((set) => ({
  inspectedTenantId: null,
  inspectedTenantName: null,

  enterTenant: (tenantId, tenantName) => {
    // Audit (LOW): defense-in-depth — only super_admin should ever
    // be able to flip this state. RLS catches a forged store but
    // the guard saves a confused-deputy round-trip.
    if (useAuthStore.getState().role !== 'super_admin') {
      console.warn('[superAdminStore] enterTenant ignored — caller is not super_admin')
      return
    }
    // Purge any cached query data tied to the previously inspected
    // tenant so we don't render its rows in the new tenant context.
    queryClient.clear()
    set({ inspectedTenantId: tenantId, inspectedTenantName: tenantName })
    useAuthStore.setState({ tenantId })
  },

  leaveTenant: () => {
    // Audit (HIGH): the previous version left every cached query
    // (`['clients', tenantA]`, etc.) in tanstack — if the SA then
    // navigated to /admin and back into another tenant, the first
    // frame flashed tenant A data. clear() drops everything so the
    // next mount refetches with the new context.
    queryClient.clear()
    set({ inspectedTenantId: null, inspectedTenantName: null })
    const profileTenant = useAuthStore.getState().userProfile?.tenant_id ?? null
    useAuthStore.setState({ tenantId: profileTenant })
  },
}))
