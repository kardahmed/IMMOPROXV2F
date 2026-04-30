import { create } from 'zustand'
import { useAuthStore } from './authStore'

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
    set({ inspectedTenantId: tenantId, inspectedTenantName: tenantName })
    useAuthStore.setState({ tenantId })
  },

  leaveTenant: () => {
    set({ inspectedTenantId: null, inspectedTenantName: null })
    // Restore the super admin's own (always-null) tenant id from their
    // profile so we don't strand them with an inspected tenant after
    // exiting.
    const profileTenant = useAuthStore.getState().userProfile?.tenant_id ?? null
    useAuthStore.setState({ tenantId: profileTenant })
  },
}))
