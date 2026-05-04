import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Shield, ShieldCheck, UserX, KeyRound, Trash2, MoreVertical } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Card, StatusBadge, Modal, ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import toast from 'react-hot-toast'


interface UserRow {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string
  status: string
  created_at: string
}

const ROLE_COLORS: Record<string, 'blue' | 'green' | 'orange' | 'muted'> = {
  super_admin: 'blue', admin: 'green', agent: 'orange',
}

async function callManageUser(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No session')

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Action failed')
  return data
}

export function UserManagementPanel({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'toggle_status' | 'reset_password' | 'delete_user'
    user: UserRow
    newStatus?: string
  } | null>(null)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['super-admin-tenant-users', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, first_name, last_name, email, role, status, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (error) { handleSupabaseError(error); throw error }
      return data as UserRow[]
    },
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['super-admin-tenant-users', tenantId] })
    qc.invalidateQueries({ queryKey: ['super-admin-tenant-kpis', tenantId] })
  }

  // --- Change role ---
  const changeRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      await callManageUser('update_role', { tenant_id: tenantId, user_id: userId, new_role: newRole })
    },
    onSuccess: () => { invalidate(); toast.success('Rôle mis à jour') },
    onError: (err: Error) => toast.error(err.message),
  })

  // --- Toggle status ---
  const toggleStatus = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: string }) => {
      await callManageUser('toggle_status', { tenant_id: tenantId, user_id: userId, new_status: newStatus })
    },
    onSuccess: () => { invalidate(); toast.success('Statut mis à jour'); setConfirmAction(null) },
    onError: (err: Error) => toast.error(err.message),
  })

  // --- Reset password ---
  const resetPassword = useMutation({
    mutationFn: async (userId: string) => {
      return await callManageUser('reset_password', { tenant_id: tenantId, user_id: userId })
    },
    onSuccess: (data) => { toast.success(`Email de reinitialisation envoye a ${data.email}`); setConfirmAction(null) },
    onError: (err: Error) => toast.error(err.message),
  })

  // --- Delete user ---
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await callManageUser('delete_user', { tenant_id: tenantId, user_id: userId })
    },
    onSuccess: () => { invalidate(); toast.success('Utilisateur supprimé'); setConfirmAction(null) },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <Card noPadding>
      <div className="flex items-center justify-between border-b border-immo-border-default px-5 py-4">
        <h3 className="text-sm font-semibold text-immo-text-primary">Utilisateurs ({users.length})</h3>
        <Button onClick={() => setShowCreate(true)} size="sm" variant="blue" className="text-xs">
          <Plus className="me-1 h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      <div className="max-h-[500px] divide-y divide-immo-border-default overflow-y-auto">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 px-5 py-3 hover:bg-immo-bg-card-hover">
            {/* Avatar */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0579DA]/15 text-xs font-semibold text-[#0579DA]">
              {u.first_name?.[0] ?? '?'}{u.last_name?.[0] ?? '?'}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-immo-text-primary">{u.first_name} {u.last_name}</p>
              <p className="text-[11px] text-immo-text-secondary">{u.email}</p>
            </div>

            {/* Role badge */}
            <StatusBadge label={u.role} type={ROLE_COLORS[u.role] ?? 'muted'} />

            {/* Status badge */}
            <StatusBadge label={u.status} type={u.status === 'active' ? 'green' : 'red'} />

            {/* Actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Actions utilisateur" className="rounded-md p-1.5 text-immo-text-secondary transition-colors hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0579DA]/40">
                <MoreVertical className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-immo-border-default bg-immo-bg-card">
                {/* Toggle role */}
                <DropdownMenuItem
                  onClick={() => changeRole.mutate({ userId: u.id, newRole: u.role === 'admin' ? 'agent' : 'admin' })}
                  className="text-sm text-immo-text-secondary focus:bg-immo-bg-card-hover focus:text-immo-text-primary"
                >
                  {u.role === 'admin' ? <Shield className="me-2 h-4 w-4" /> : <ShieldCheck className="me-2 h-4 w-4" />}
                  {u.role === 'admin' ? 'Passer en Agent' : 'Passer en Admin'}
                </DropdownMenuItem>

                {/* Toggle status */}
                <DropdownMenuItem
                  onClick={() => setConfirmAction({
                    type: 'toggle_status', user: u,
                    newStatus: u.status === 'active' ? 'inactive' : 'active',
                  })}
                  className="text-sm text-immo-text-secondary focus:bg-immo-bg-card-hover focus:text-immo-text-primary"
                >
                  <UserX className="me-2 h-4 w-4" />
                  {u.status === 'active' ? 'Desactiver' : 'Reactiver'}
                </DropdownMenuItem>

                {/* Reset password */}
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ type: 'reset_password', user: u })}
                  className="text-sm text-immo-text-secondary focus:bg-immo-bg-card-hover focus:text-immo-text-primary"
                >
                  <KeyRound className="me-2 h-4 w-4" />
                  Reset mot de passe
                </DropdownMenuItem>

                {/* Delete */}
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ type: 'delete_user', user: u })}
                  className="text-sm text-immo-status-red focus:bg-immo-status-red-bg focus:text-immo-status-red"
                >
                  <Trash2 className="me-2 h-4 w-4" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {users.length === 0 && !isLoading && (
          <div className="py-8 text-center text-sm text-immo-text-secondary">Aucun utilisateur</div>
        )}
      </div>

      {/* Create user modal */}
      <CreateUserModal
        isOpen={showCreate}
        tenantId={tenantId}
        onClose={() => setShowCreate(false)}
        onSuccess={invalidate}
      />

      {/* Confirm dialog */}
      {confirmAction && (
        <ConfirmDialog
          isOpen
          onClose={() => setConfirmAction(null)}
          title={
            confirmAction.type === 'toggle_status'
              ? `${confirmAction.newStatus === 'inactive' ? 'Desactiver' : 'Reactiver'} ${confirmAction.user.first_name} ${confirmAction.user.last_name} ?`
              : confirmAction.type === 'reset_password'
                ? `Envoyer un email de reinitialisation a ${confirmAction.user.email} ?`
                : `Supprimer definitivement ${confirmAction.user.first_name} ${confirmAction.user.last_name} ?`
          }
          description={
            confirmAction.type === 'delete_user'
              ? 'Cette action est irreversible. Toutes les donnees associees seront perdues.'
              : undefined
          }
          confirmVariant={confirmAction.type === 'delete_user' ? 'danger' : 'default'}
          loading={toggleStatus.isPending || resetPassword.isPending || deleteUser.isPending}
          onConfirm={() => {
            if (confirmAction.type === 'toggle_status') {
              toggleStatus.mutate({ userId: confirmAction.user.id, newStatus: confirmAction.newStatus! })
            } else if (confirmAction.type === 'reset_password') {
              resetPassword.mutate(confirmAction.user.id)
            } else {
              deleteUser.mutate(confirmAction.user.id)
            }
          }}
        />
      )}
    </Card>
  )
}

// --- Create User Modal ---

function CreateUserModal({ isOpen, tenantId, onClose, onSuccess }: {
  isOpen: boolean; tenantId: string; onClose: () => void; onSuccess: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'agent'>('agent')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!firstName || !lastName || !email) return
    setLoading(true)
    try {
      await callManageUser('create_user', {
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        email,
        role,
      })
      toast.success(`Invitation envoyee a ${email}`)
      setFirstName(''); setLastName(''); setEmail(''); setRole('agent')
      onClose()
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ajouter un utilisateur"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary">Annuler</Button>
          <Button onClick={handleCreate} disabled={!firstName || !lastName || !email || loading} variant="blue">
            {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Inviter'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-[11px] text-immo-text-secondary">Prenom *</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} variant="immo" /></div>
          <div><Label className="text-[11px] text-immo-text-secondary">Nom *</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} variant="immo" /></div>
        </div>
        <div><Label className="text-[11px] text-immo-text-secondary">Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} variant="immo" /></div>
        <div>
          <Label className="text-[11px] text-immo-text-secondary">Role</Label>
          <Select value={role} onValueChange={v => setRole(v as 'admin' | 'agent')}>
            <SelectTrigger className="border-immo-border-default bg-immo-bg-card text-immo-text-primary"><SelectValue /></SelectTrigger>
            <SelectContent className="border-immo-border-default bg-immo-bg-card">
              <SelectItem value="admin" className="text-immo-text-primary focus:bg-immo-bg-card-hover">Administrateur</SelectItem>
              <SelectItem value="agent" className="text-immo-text-primary focus:bg-immo-bg-card-hover">Agent commercial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-immo-text-secondary">Un email d'invitation sera envoye automatiquement.</p>
      </div>
    </Modal>
  )
}
