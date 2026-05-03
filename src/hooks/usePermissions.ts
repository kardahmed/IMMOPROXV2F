import { useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/types'
import type { PermissionKey } from '@/types/permissions'

// Baseline permissions every agent gets out of the box, even before
// their tenant admin assigns them a custom permission_profile. Without
// this set, a freshly invited agent saw only Tasks + Inbox in the
// sidebar — no Dashboard, no Pipeline — because can() returned false
// for everything. Admin-only surfaces (agents.*, settings.*, reports.*,
// landing.*, *.view_all) are deliberately excluded.
const AGENT_BASELINE_PERMISSIONS = new Set<PermissionKey>([
  'dashboard.view',
  'projects.view',
  'units.view',
  'pipeline.view_own', 'pipeline.create', 'pipeline.edit', 'pipeline.change_stage',
  'visits.view_own', 'visits.create', 'visits.edit',
  'reservations.view', 'reservations.create',
  'sales.view',
  'dossiers.view',
  'documents.view', 'documents.generate', 'documents.upload',
  'payments.view',
  'goals.view_own',
  'performance.view_own',
  'ai.call_script', 'ai.suggestions', 'ai.questions',
  'whatsapp.send', 'whatsapp.view_history',
])

export interface Permissions {
  // Granular permission check
  can: (permission: PermissionKey) => boolean

  // Legacy boolean flags (backward compat)
  canManageAgents: boolean
  canManageSettings: boolean
  canViewAllClients: boolean
  canViewAllAgents: boolean
  canDeleteData: boolean
  canViewAllTenants: boolean
  canManageProjects: boolean
  canManageGoals: boolean
  canManageTemplates: boolean
  canExportData: boolean

  // Role flags
  isSuperAdmin: boolean
  isAdmin: boolean
  isAgent: boolean
  hasRole: (...roles: UserRole[]) => boolean
}

export function usePermissions(): Permissions {
  const role = useAuthStore((s) => s.role)
  const permissionProfile = useAuthStore((s) => s.permissionProfile)

  return useMemo(() => {
    const isSuper = role === 'super_admin'
    const isAdm = role === 'admin'
    const isAdminOrAbove = isSuper || isAdm

    // Core permission check
    function can(permission: PermissionKey): boolean {
      // Admin and super_admin bypass — always have all permissions
      if (isAdminOrAbove) return true
      // Agent: explicit profile permission wins (admin can both grant
      // extras AND deny defaults). Falls back to the baseline set so
      // agents without a custom profile aren't locked out of their
      // core workspace.
      const explicit = permissionProfile?.permissions?.[permission]
      if (explicit === true) return true
      if (explicit === false) return false
      return AGENT_BASELINE_PERMISSIONS.has(permission)
    }

    return {
      // Granular check
      can,

      // Legacy flags mapped to new granular permissions
      canManageAgents: can('agents.edit'),
      canManageSettings: can('settings.edit'),
      canViewAllClients: can('pipeline.view_all'),
      canViewAllAgents: can('agents.view'),
      canDeleteData: isSuper, // keep super_admin only
      canViewAllTenants: isSuper,
      canManageProjects: can('projects.edit'),
      canManageGoals: can('goals.create'),
      canManageTemplates: can('documents.generate'),
      canExportData: can('reports.export'),

      // Role flags (unchanged)
      isSuperAdmin: isSuper,
      isAdmin: isAdm,
      isAgent: role === 'agent',
      hasRole: (...roles: UserRole[]) => role !== null && roles.includes(role),
    }
  }, [role, permissionProfile])
}
