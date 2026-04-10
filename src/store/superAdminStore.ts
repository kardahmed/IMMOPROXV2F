import { create } from 'zustand'

interface SuperAdminState {
  inspectedTenantId: string | null
  inspectedTenantName: string | null
  enterTenant: (tenantId: string, tenantName: string) => void
  leaveTenant: () => void
}

export const useSuperAdminStore = create<SuperAdminState>((set) => ({
  inspectedTenantId: null,
  inspectedTenantName: null,

  enterTenant: (tenantId, tenantName) =>
    set({ inspectedTenantId: tenantId, inspectedTenantName: tenantName }),

  leaveTenant: () =>
    set({ inspectedTenantId: null, inspectedTenantName: null }),
}))
