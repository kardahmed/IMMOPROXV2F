import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Shield, ShieldCheck, UserX, KeyRound, Trash2, MoreVertical } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { StatusBadge, Modal, ConfirmDialog } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import toast from 'react-hot-toast'

const inputClass = 'border-[#1E325A] bg-[#0A1030] text-white placeholder-[#4E6687]'

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

  // ─── Change role ───
  const changeRole = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      await callManageUser('update_role', { tenant_id: tenantId, user_id: userId, new_role: newRole })
    },
    onSuccess: () => { invalidate(); toast.success('Role mis a jour') },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Toggle status ───
  const toggleStatus = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: string }) => {
      await callManageUser('toggle_status', { tenant_id: tenantId, user_id: userId, new_status: newStatus })
    },
    onSuccess: () => { invalidate(); toast.success('Statut mis a jour'); setConfirmAction(null) },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Reset password ───
  const resetPassword = useMutation({
    mutationFn: async (userId: string) => {
      return await callManageUser('reset_password', { tenant_id: tenantId, user_id: userId })
    },
    onSuccess: (data) => { toast.success(`Email de reinitialisation envoye a ${data.email}`); setConfirmAction(null) },
    onError: (err: Error) => toast.error(err.message),
  })

  // ─── Delete user ───
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      await callManageUser('delete_user', { tenant_id: tenantId, user_id: userId })
    },
    onSuccess: () => { invalidate(); toast.success('Utilisateur supprime'); setConfirmAction(null) },
    onError: (err: Error) => toast.error(err.message),
  })

  return (
    <div className="rounded-xl border border-[#1E325A] bg-[#0A1030]">
      <div className="flex items-center justify-between border-b border-[#1E325A] px-5 py-4">
        <h3 className="text-sm font-semibold text-white">Utilisateurs ({users.length})</h3>
        <Button onClick={() => setShowCreate(true)} size="sm" className="bg-[#7C3AED] text-xs font-semibold text-white hover:bg-[#6D28D9]">
          <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      <div className="max-h-[500px] divide-y divide-[#1E325A] overflow-y-auto">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#0F1830]">
            {/* Avatar */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#7C3AED]/15 text-xs font-semibold text-[#7C3AED]">
              {u.first_name[0]}{u.last_name[0]}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">{u.first_name} {u.last_name}</p>
              <p className="text-[11px] text-[#7F96B7]">{u.email}</p>
            </div>

            {/* Role badge */}
            <StatusBadge label={u.role} type={ROLE_COLORS[u.role] ?? 'muted'} />

            {/* Status badge */}
            <StatusBadge label={u.status} type={u.status === 'active' ? 'green' : 'red'} />

            {/* Actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-md p-1.5 text-[#7F96B7] hover:bg-[#1E325A] hover:text-white">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-[#1E325A] bg-[#0F1830]">
                {/* Toggle role */}
                <DropdownMenuItem
                  onClick={() => changeRole.mutate({ userId: u.id, newRole: u.role === 'admin' ? 'agent' : 'admin' })}
                  className="text-sm text-[#7F96B7] focus:bg-[#1E325A] focus:text-white"
                >
                  {u.role === 'admin' ? <Shield className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                  {u.role === 'admin' ? 'Passer en Agent' : 'Passer en Admin'}
                </DropdownMenuItem>

                {/* Toggle status */}
                <DropdownMenuItem
                  onClick={() => setConfirmAction({
                    type: 'toggle_status', user: u,
                    newStatus: u.status === 'active' ? 'inactive' : 'active',
                  })}
                  className="text-sm text-[#7F96B7] focus:bg-[#1E325A] focus:text-white"
                >
                  <UserX className="mr-2 h-4 w-4" />
                  {u.status === 'active' ? 'Desactiver' : 'Reactiver'}
                </DropdownMenuItem>

                {/* Reset password */}
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ type: 'reset_password', user: u })}
                  className="text-sm text-[#7F96B7] focus:bg-[#1E325A] focus:text-white"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Reset mot de passe
                </DropdownMenuItem>

                {/* Delete */}
                <DropdownMenuItem
                  onClick={() => setConfirmAction({ type: 'delete_user', user: u })}
                  className="text-sm text-[#FF4949] focus:bg-[#320F0F] focus:text-[#FF4949]"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
        {users.length === 0 && !isLoading && (
          <div className="py-8 text-center text-sm text-[#7F96B7]">Aucun utilisateur</div>
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
    </div>
  )
}

// ─── Create User Modal ───

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
    <Modal isOpen={isOpen} onClose={onClose} title="Ajouter un utilisateur" size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-[11px] text-[#7F96B7]">Prenom *</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} /></div>
          <div><Label className="text-[11px] text-[#7F96B7]">Nom *</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} /></div>
        </div>
        <div><Label className="text-[11px] text-[#7F96B7]">Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></div>
        <div>
          <Label className="text-[11px] text-[#7F96B7]">Role</Label>
          <Select value={role} onValueChange={v => setRole(v as 'admin' | 'agent')}>
            <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
            <SelectContent className="border-[#1E325A] bg-[#0F1830]">
              <SelectItem value="admin" className="text-white focus:bg-[#1E325A]">Administrateur</SelectItem>
              <SelectItem value="agent" className="text-white focus:bg-[#1E325A]">Agent commercial</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-[#7F96B7]">Un email d'invitation sera envoye automatiquement.</p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} className="text-[#7F96B7]">Annuler</Button>
          <Button onClick={handleCreate} disabled={!firstName || !lastName || !email || loading}
            className="bg-[#7C3AED] font-semibold text-white hover:bg-[#6D28D9]">
            {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Inviter'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
