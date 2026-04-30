import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, UserCheck, UserX, Plus, Eye, Pencil, Ban, Shield, MoreHorizontal,
  CalendarDays, RotateCcw, Lock,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { nameToColor } from '@/lib/avatarColor'
import {
  KPICard, SearchInput, StatusBadge, PageSkeleton, Modal,
} from '@/components/common'
import { PutOnLeaveModal } from './components/PutOnLeaveModal'
import { DeactivateAgentWizard } from './components/DeactivateAgentWizard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { USER_ROLE_LABELS } from '@/types'
import type { UserRole } from '@/types'
import { usePlanEnforcement } from '@/hooks/usePlanEnforcement'
import { PlanLimitBanner } from '@/components/common/PlanLimitBanner'
import { PermissionProfilesSection } from '@/pages/settings/sections/PermissionProfilesSection'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import toast from 'react-hot-toast'

const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary placeholder:text-immo-text-muted'

interface AgentRow {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  role: UserRole
  status: string
  last_activity: string | null
  leave_ends_at: string | null
  leave_reason: string | null
  backup_agent_id: string | null
  clients_count: number
  sales_count: number
  tenant_id: string
}

type StatusKey = 'active' | 'on_leave' | 'suspended' | 'inactive'

const STATUS_DEF: Record<StatusKey, { label: string; type: 'green' | 'orange' | 'red' | 'muted' }> = {
  active:    { label: 'Actif',     type: 'green' },
  on_leave:  { label: 'En congé',  type: 'orange' },
  suspended: { label: 'Suspendu',  type: 'red' },
  inactive:  { label: 'Inactif',   type: 'muted' },
}

export function AgentsPage() {
  const navigate = useNavigate()
  const { tenantId } = useAuthStore()
  const { canManageAgents } = usePermissions()
  const { canAddAgent, usage, limits } = usePlanEnforcement()
  const qc = useQueryClient()

  const [activeTab, setActiveTab] = useState<'agents' | 'permissions'>('agents')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [leaveAgent, setLeaveAgent] = useState<AgentRow | null>(null)
  const [deactivateAgent, setDeactivateAgent] = useState<AgentRow | null>(null)

  // Fetch agents with counts
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents-list', tenantId],
    queryFn: async () => {
      const { data: usersRaw, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, phone, role, status, last_activity, leave_ends_at, leave_reason, backup_agent_id')
        .eq('tenant_id', tenantId!)
        .order('first_name')
      if (error) { handleSupabaseError(error); throw error }

      // Cast through unknown because the leave_* columns added by
      // migration 049 aren't yet in the generated types.
      const users = (usersRaw ?? []) as unknown as Array<Omit<AgentRow, 'role' | 'clients_count' | 'sales_count' | 'tenant_id'> & { role: string }>

      const agentIds = users.map(u => u.id)
      if (agentIds.length === 0) return []

      const [clientsRes, salesRes] = await Promise.all([
        supabase.from('clients').select('agent_id').eq('tenant_id', tenantId!),
        supabase.from('sales').select('agent_id').eq('tenant_id', tenantId!).eq('status', 'active'),
      ])

      const clientCounts = new Map<string, number>()
      const saleCounts = new Map<string, number>()
      for (const c of (clientsRes.data ?? []) as Array<{ agent_id: string | null }>) {
        if (c.agent_id) clientCounts.set(c.agent_id, (clientCounts.get(c.agent_id) ?? 0) + 1)
      }
      for (const s of (salesRes.data ?? []) as Array<{ agent_id: string }>) {
        saleCounts.set(s.agent_id, (saleCounts.get(s.agent_id) ?? 0) + 1)
      }

      return users.map((u): AgentRow => ({
        ...u,
        role: u.role as UserRole,
        clients_count: clientCounts.get(u.id) ?? 0,
        sales_count: saleCounts.get(u.id) ?? 0,
        tenant_id: tenantId!,
      }))
    },
    enabled: !!tenantId,
  })

  // Lightweight reactivate / suspend mutations — the heavy
  // "deactivate with reassignment" path lives in
  // DeactivateAgentWizard. These two are simple status flips.
  const reactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('users')
        .update({
          status: 'active',
          leave_starts_at: null,
          leave_ends_at: null,
          backup_agent_id: null,
          leave_reason: null,
        } as never)
        .eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents-list'] })
      toast.success('Agent réactivé')
    },
  })

  const suspend = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('users')
        .update({ status: 'suspended' } as never)
        .eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents-list'] })
      toast.success('Agent suspendu — login bloqué')
    },
  })

  // KPIs
  const total = agents.length
  const active = agents.filter(a => a.status === 'active').length
  const onLeave = agents.filter(a => a.status === 'on_leave').length
  const inactive = agents.filter(a => a.status === 'inactive' || a.status === 'suspended').length
  const totalClients = agents.reduce((s, a) => s + a.clients_count, 0)

  // Filter
  const filtered = useMemo(() => {
    if (!search) return agents
    const q = search.toLowerCase()
    return agents.filter(a =>
      `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    )
  }, [agents, search])

  if (isLoading) return <PageSkeleton kpiCount={4} hasTable />

  return (
    <div className="space-y-5">
      {/* Tabs: Agents | Permissions */}
      {canManageAgents && (
        <div className="flex gap-1 border-b border-immo-border-default">
          <button onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${activeTab === 'agents' ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
            <Users className="h-3.5 w-3.5" /> Agents
          </button>
          <button onClick={() => setActiveTab('permissions')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${activeTab === 'permissions' ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
            <Shield className="h-3.5 w-3.5" /> Profils de permissions
          </button>
        </div>
      )}

      {activeTab === 'permissions' ? (
        <PermissionProfilesSection />
      ) : (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPICard label="Total agents" value={total} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Actifs" value={active} accent="green" icon={<UserCheck className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="En congé" value={onLeave} accent="orange" icon={<CalendarDays className="h-4 w-4 text-immo-status-orange" />} />
        <KPICard label="Inactifs / Suspendus" value={inactive} accent="red" icon={<UserX className="h-4 w-4 text-immo-status-red" />} />
        <KPICard label="Clients assignés" value={totalClients} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
      </div>

      {/* Plan limit banner */}
      {!canAddAgent && (
        <PlanLimitBanner type="agents" current={usage.agents} max={limits.max_agents} />
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <SearchInput placeholder="Rechercher un agent..." value={search} onChange={setSearch} className="w-[260px]" />
        {canManageAgents && (
          <Button
            onClick={() => setShowCreate(true)}
            disabled={!canAddAgent}
            className="ml-auto bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
            title={!canAddAgent ? 'Limite atteinte — Passez au plan superieur' : undefined}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Ajouter un agent
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-immo-border-default">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-immo-bg-card-hover">
                {['Agent', 'Rôle', 'Téléphone', 'Email', 'Clients', 'Ventes', 'Dernière activité', 'Statut', ''].map(h => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-immo-text-muted">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-immo-border-default">
              {filtered.map(a => {
                const fullName = `${a.first_name} ${a.last_name}`
                const color = nameToColor(fullName)
                const initials = `${a.first_name[0]}${a.last_name[0]}`.toUpperCase()
                const inactiveLong = a.last_activity && (Date.now() - new Date(a.last_activity).getTime()) > 7 * 86400000

                return (
                  <tr key={a.id} className="bg-immo-bg-card transition-colors hover:bg-immo-bg-card-hover">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: color + '20', color }}>
                          {initials}
                        </div>
                        <span className="text-sm font-medium text-immo-text-primary">{fullName}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-secondary">{USER_ROLE_LABELS[a.role]}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">{a.phone ?? '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-immo-text-muted">{a.email}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-immo-text-primary">{a.clients_count}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-immo-accent-green">{a.sales_count}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`text-xs ${inactiveLong ? 'font-medium text-immo-status-red' : 'text-immo-text-muted'}`}>
                        {a.last_activity ? formatDistanceToNow(new Date(a.last_activity), { addSuffix: true, locale: fr }) : 'Jamais'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge
                          label={STATUS_DEF[(a.status as StatusKey)]?.label ?? a.status}
                          type={STATUS_DEF[(a.status as StatusKey)]?.type ?? 'muted'}
                        />
                        {a.status === 'on_leave' && a.leave_ends_at && (
                          <span className="text-[10px] text-immo-text-muted">
                            Retour {formatDistanceToNow(new Date(a.leave_ends_at), { addSuffix: true, locale: fr })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex h-7 w-7 items-center justify-center rounded-md text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border-immo-border-default bg-immo-bg-card">
                          <DropdownMenuItem onClick={() => navigate(`/agents/${a.id}`)} className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover">
                            <Eye className="mr-2 h-3.5 w-3.5" /> Voir profil
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/agents/${a.id}`)} className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover">
                            <Pencil className="mr-2 h-3.5 w-3.5" /> Modifier
                          </DropdownMenuItem>

                          {canManageAgents && a.status === 'active' && (
                            <>
                              <DropdownMenuItem onClick={() => setLeaveAgent(a)} className="text-sm text-immo-status-orange focus:bg-immo-status-orange/5">
                                <CalendarDays className="mr-2 h-3.5 w-3.5" /> Mettre en congé
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => suspend.mutate(a.id)} className="text-sm text-immo-text-primary focus:bg-immo-bg-card-hover">
                                <Lock className="mr-2 h-3.5 w-3.5" /> Suspendre
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDeactivateAgent(a)} className="text-sm text-immo-status-red focus:bg-immo-status-red/5">
                                <Ban className="mr-2 h-3.5 w-3.5" /> Désactiver…
                              </DropdownMenuItem>
                            </>
                          )}

                          {canManageAgents && (a.status === 'on_leave' || a.status === 'suspended') && (
                            <DropdownMenuItem onClick={() => reactivate.mutate(a.id)} className="text-sm text-immo-accent-green focus:bg-immo-accent-green/5">
                              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Réactiver
                            </DropdownMenuItem>
                          )}

                          {canManageAgents && a.status === 'inactive' && (
                            <DropdownMenuItem onClick={() => reactivate.mutate(a.id)} className="text-sm text-immo-text-secondary focus:bg-immo-bg-card-hover">
                              <RotateCcw className="mr-2 h-3.5 w-3.5" /> Réactiver le compte
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      <CreateAgentModal isOpen={showCreate} onClose={() => setShowCreate(false)} tenantId={tenantId!} />

      {/* Put on leave — temporary absence with optional backup */}
      <PutOnLeaveModal
        isOpen={!!leaveAgent}
        onClose={() => setLeaveAgent(null)}
        agent={leaveAgent}
      />

      {/* Deactivate wizard — mass-reassign clients/tasks/visits before
          flipping to inactive. Replaces the old single-click flip
          which left the agent's portfolio orphaned. */}
      <DeactivateAgentWizard
        isOpen={!!deactivateAgent}
        onClose={() => setDeactivateAgent(null)}
        agent={deactivateAgent}
      />
      </>
      )}
    </div>
  )
}

/* ═══ Create Agent Modal ═══ */

function CreateAgentModal({ isOpen, onClose, tenantId }: { isOpen: boolean; onClose: () => void; tenantId: string }) {
  const qc = useQueryClient()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'admin' | 'agent'>('agent')

  const create = useMutation({
    mutationFn: async () => {
      // Generate temp password
      const tempPassword = `Immo${Date.now().toString(36).slice(-6)}!`

      // Create auth user via Supabase
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email,
        password: tempPassword,
        options: { data: { first_name: firstName, last_name: lastName } },
      })
      if (authErr) { handleSupabaseError(authErr); throw authErr }
      if (!authData.user) throw new Error('User creation failed')

      // Insert in users table
      const { error: userErr } = await supabase.from('users').insert({
        id: authData.user.id,
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        role,
        status: 'active',
      } as never)
      if (userErr) { handleSupabaseError(userErr); throw userErr }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents-list'] })
      toast.success('Agent créé — un email de bienvenue a été envoyé')
      resetAndClose()
    },
  })

  function resetAndClose() {
    setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setRole('agent')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} title="Ajouter un agent" subtitle="Créer un nouveau compte agent" size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[11px] font-medium text-immo-text-muted">Prénom *</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mohamed" className={`mt-1 ${inputClass}`} />
          </div>
          <div>
            <Label className="text-[11px] font-medium text-immo-text-muted">Nom *</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Ali" className={`mt-1 ${inputClass}`} />
          </div>
        </div>
        <div>
          <Label className="text-[11px] font-medium text-immo-text-muted">Email *</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@agence.com" className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <Label className="text-[11px] font-medium text-immo-text-muted">Téléphone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0555 123 456" className={`mt-1 ${inputClass}`} />
        </div>
        <div>
          <Label className="text-[11px] font-medium text-immo-text-muted">Rôle *</Label>
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'agent')} className={`mt-1 h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
            <option value="agent">Agent commercial</option>
            <option value="admin">Administrateur</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 border-t border-immo-border-default pt-4">
          <Button variant="ghost" onClick={resetAndClose} className="text-immo-text-secondary hover:bg-immo-bg-card-hover">Annuler</Button>
          <Button onClick={() => create.mutate()} disabled={!firstName || !lastName || !email || create.isPending} className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
            {create.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" /> : 'Créer le compte'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
