import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Plus, Pencil, Trash2, Check, Users, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/common'
import { PERMISSION_GROUPS } from '@/types/permissions'
import type { PermissionKey, PermissionMap } from '@/types/permissions'
import toast from 'react-hot-toast'

interface Profile {
  id: string
  name: string
  description: string | null
  permissions: PermissionMap
  is_default: boolean
  created_at: string
}

export function PermissionProfilesSection() {
  const tenantId = useAuthStore(s => s.tenantId)
  const qc = useQueryClient()
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: profiles = [] } = useQuery({
    queryKey: ['permission-profiles', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('permission_profiles').select('*').eq('tenant_id', tenantId!).order('created_at')
      return (data ?? []) as Profile[]
    },
    enabled: !!tenantId,
  })

  // Count agents per profile
  const { data: agentCounts = {} } = useQuery({
    queryKey: ['agent-profile-counts', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('*').eq('tenant_id', tenantId!).eq('role', 'agent')
      const counts: Record<string, number> = {}
      for (const u of data ?? []) {
        const pid = (u as unknown as { permission_profile_id: string | null }).permission_profile_id
        if (pid) counts[pid] = (counts[pid] ?? 0) + 1
      }
      return counts
    },
    enabled: !!tenantId,
  })

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('permission_profiles').delete().eq('id', id)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['permission-profiles'] }); toast.success('Profil supprimé') },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-immo-text-primary">Profils de permissions</h2>
          <p className="text-xs text-immo-text-muted">Creez des profils d'acces et assignez-les a vos agents</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-immo-accent-green text-white text-xs hover:bg-immo-accent-green/90">
          <Plus className="me-1.5 h-3.5 w-3.5" /> Nouveau profil
        </Button>
      </div>

      {/* Profiles list */}
      <div className="grid gap-4">
        {profiles.map(profile => {
          const permCount = Object.values(profile.permissions).filter(Boolean).length
          const totalPerms = PERMISSION_GROUPS.reduce((s, g) => s + g.permissions.length, 0)
          const agents = agentCounts[profile.id] ?? 0

          return (
            <div key={profile.id} className="rounded-xl border border-immo-border-default bg-immo-bg-card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-immo-accent-blue/10">
                    <Shield className="h-5 w-5 text-immo-accent-blue" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-immo-text-primary">{profile.name}</h3>
                      {profile.is_default && (
                        <span className="rounded-full bg-immo-accent-green/10 px-2 py-0.5 text-[9px] font-bold text-immo-accent-green">Par defaut</span>
                      )}
                    </div>
                    <p className="text-xs text-immo-text-muted">{profile.description ?? 'Aucune description'}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setEditProfile(profile)} className="h-8 border border-immo-border-default text-xs text-immo-text-secondary">
                    <Pencil className="me-1 h-3 w-3" /> Modifier
                  </Button>
                  {!profile.is_default && agents === 0 && (
                    <Button size="sm" variant="ghost" onClick={() => deleteProfile.mutate(profile.id)} className="h-8 border border-immo-status-red/20 text-xs text-immo-status-red hover:bg-immo-status-red/5">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-immo-text-muted">
                <span className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-immo-accent-green" /> {permCount}/{totalPerms} permissions
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {agents} agent(s)
                </span>
              </div>
              {/* Permission preview */}
              <div className="mt-3 flex flex-wrap gap-1">
                {PERMISSION_GROUPS.map(group => {
                  const groupPerms = group.permissions.filter(p => profile.permissions[p.key])
                  if (groupPerms.length === 0) return null
                  return (
                    <span key={group.key} className="rounded-md bg-immo-bg-card-hover px-2 py-0.5 text-[9px] text-immo-text-secondary">
                      {group.label} ({groupPerms.length})
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create/Edit modal */}
      {(showCreate || editProfile) && (
        <ProfileEditor
          profile={editProfile}
          tenantId={tenantId!}
          onClose={() => { setShowCreate(false); setEditProfile(null) }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['permission-profiles'] }); setShowCreate(false); setEditProfile(null) }}
        />
      )}
    </div>
  )
}

function ProfileEditor({ profile, tenantId, onClose, onSaved }: {
  profile: Profile | null
  tenantId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(profile?.name ?? '')
  const [description, setDescription] = useState(profile?.description ?? '')
  const [permissions, setPermissions] = useState<PermissionMap>(profile?.permissions ?? {})
  const [saving, setSaving] = useState(false)

  function togglePermission(key: PermissionKey) {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleGroup(groupKey: string) {
    const group = PERMISSION_GROUPS.find(g => g.key === groupKey)
    if (!group) return
    const allEnabled = group.permissions.every(p => permissions[p.key])
    const update: PermissionMap = { ...permissions }
    for (const p of group.permissions) {
      update[p.key] = !allEnabled
    }
    setPermissions(update)
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Nom requis'); return }
    setSaving(true)
    try {
      if (profile) {
        await supabase.from('permission_profiles').update({
          name: name.trim(),
          description: description.trim() || null,
          permissions,
          updated_at: new Date().toISOString(),
        } as never).eq('id', profile.id)
      } else {
        await supabase.from('permission_profiles').insert({
          tenant_id: tenantId,
          name: name.trim(),
          description: description.trim() || null,
          permissions,
        } as never)
      }
      toast.success(profile ? 'Profil mis a jour' : 'Profil cree')
      onSaved()
    } catch {
      toast.error('Erreur')
    } finally {
      setSaving(false)
    }
  }

  const totalPerms = PERMISSION_GROUPS.reduce((s, g) => s + g.permissions.length, 0)
  const enabledPerms = Object.values(permissions).filter(Boolean).length

  return (
    <Modal isOpen onClose={onClose} title={profile ? `Modifier : ${profile.name}` : 'Nouveau profil'} size="lg">
      <div className="space-y-5 max-h-[70vh] overflow-y-auto">
        {/* Name + Description */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Nom du profil</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Agent Senior" className="text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-immo-text-muted">Description</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Acces elargi..." className="text-sm" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-immo-text-muted">{enabledPerms}/{totalPerms} permissions activees</span>
          <div className="flex gap-2">
            <button onClick={() => {
              const all: PermissionMap = {}
              PERMISSION_GROUPS.forEach(g => g.permissions.forEach(p => { all[p.key] = true }))
              setPermissions(all)
            }} className="text-[10px] text-immo-accent-green hover:underline">Tout activer</button>
            <button onClick={() => setPermissions({})} className="text-[10px] text-immo-status-red hover:underline">Tout desactiver</button>
          </div>
        </div>

        {/* Permission groups */}
        <div className="space-y-4">
          {PERMISSION_GROUPS.map(group => {
            const groupEnabled = group.permissions.filter(p => permissions[p.key]).length
            const allEnabled = groupEnabled === group.permissions.length

            return (
              <div key={group.key} className="rounded-lg border border-immo-border-default p-3">
                <div className="flex items-center justify-between mb-2">
                  <button onClick={() => toggleGroup(group.key)} className="flex items-center gap-2 text-xs font-semibold text-immo-text-primary hover:text-immo-accent-green">
                    <div className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${allEnabled ? 'border-immo-accent-green bg-immo-accent-green' : 'border-immo-border-default'}`}>
                      {allEnabled && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    {group.label}
                  </button>
                  <span className="text-[10px] text-immo-text-muted">{groupEnabled}/{group.permissions.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.permissions.map(perm => (
                    <button
                      key={perm.key}
                      onClick={() => togglePermission(perm.key)}
                      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] transition-all ${
                        permissions[perm.key]
                          ? 'bg-immo-accent-green/10 text-immo-accent-green'
                          : 'text-immo-text-muted hover:bg-immo-bg-card-hover'
                      }`}
                    >
                      <div className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition-all ${
                        permissions[perm.key] ? 'border-immo-accent-green bg-immo-accent-green' : 'border-immo-border-default'
                      }`}>
                        {permissions[perm.key] && <Check className="h-2 w-2 text-white" />}
                      </div>
                      {perm.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} className="text-xs">Annuler</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-immo-accent-green text-white text-xs hover:bg-immo-accent-green/90">
          <Save className="me-1.5 h-3.5 w-3.5" /> {saving ? 'Enregistrement...' : 'Enregistrer'}
        </Button>
      </div>
    </Modal>
  )
}
