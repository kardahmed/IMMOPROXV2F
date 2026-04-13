import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, UserCheck, UserX, Plus, Eye, Pencil, Ban,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
  KPICard, SearchInput, StatusBadge, LoadingSpinner, Modal, ConfirmDialog,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { USER_ROLE_LABELS } from '@/types'
import { usePlanEnforcement } from '@/hooks/usePlanEnforcement'
import { PlanLimitBanner } from '@/components/common/PlanLimitBanner'
import { PermissionProfilesSection } from '@/pages/settings/sections/PermissionProfilesSection'
import { Shield } from 'lucide-react'
import type { UserRole } from '@/types'
import { MoreHorizontal } from 'lucide-react'
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
  clients_count: number
  sales_count: number
}

function nameToColor(name: string): string {
  const C = ['#00D4A0', '#3782FF', '#FF9A1E', '#A855F7', '#06B6D4', '#EAB308', '#F97316', '#EC4899']
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return C[Math.abs(h) % C.length]
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
  const [deactivateId, setDeactivateId] = useState<string | null>(null)

  // Fetch agents with counts
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents-list', tenantId],
    queryFn: async () => {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, phone, role, status, last_activity')
        .eq('tenant_id', tenantId!)
        .order('first_name')
      if (error) { handleSupabaseError(error); throw error }

      const agentIds = (users ?? []).map(u => u.id)
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

      return (users ?? []).map((u): AgentRow => ({
        ...u,
        role: u.role as UserRole,
        clients_count: clientCounts.get(u.id) ?? 0,
        sales_count: saleCounts.get(u.id) ?? 0,
      }))
    },
    enabled: !!tenantId,
  })

  // Deactivate agent
  const deactivate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('users').update({ status: 'inactive' } as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agents-list'] })
      toast.success('Agent désactivé')
      setDeactivateId(null)
    },
  })

  // KPIs
  const total = agents.length
  const active = agents.filter(a => a.status === 'active').length
  const inactive = agents.filter(a => a.status === 'inactive').length
  const totalClients = agents.reduce((s, a) => s + a.clients_count, 0)

  // Filter
  const filtered = useMemo(() => {
    if (!search) return agents
    const q = search.toLowerCase()
    return agents.filter(a =>
      `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    )
  }, [agents, search])

  if (isLoading) return <LoadingSpinner size="lg" className="h-96" />

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPICard label="Total agents" value={total} accent="blue" icon={<Users className="h-4 w-4 text-immo-accent-blue" />} />
        <KPICard label="Actifs" value={active} accent="green" icon={<UserCheck className="h-4 w-4 text-immo-accent-green" />} />
        <KPICard label="Inactifs" value={inactive} accent="red" icon={<UserX className="h-4 w-4 text-immo-status-red" />} />
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
                      <StatusBadge label={a.status === 'active' ? 'Actif' : 'Inactif'} type={a.status === 'active' ? 'green' : 'red'} />
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
                          {a.status === 'active' && canManageAgents && (
                            <DropdownMenuItem onClick={() => setDeactivateId(a.id)} className="text-sm text-immo-status-red focus:bg-immo-status-red-bg">
                              <Ban className="mr-2 h-3.5 w-3.5" /> Désactiver
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

      {/* Deactivate confirm */}
      <ConfirmDialog
        isOpen={!!deactivateId}
        onClose={() => setDeactivateId(null)}
        onConfirm={() => deactivateId && deactivate.mutate(deactivateId)}
        title="Désactiver cet agent ?"
        description="L'agent ne pourra plus se connecter. Ses données seront conservées."
        confirmLabel="Désactiver"
        confirmVariant="danger"
        loading={deactivate.isPending}
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
