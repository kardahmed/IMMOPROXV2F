import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { User as UserIcon, Mail, Lock, Trash2, Save, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'
import toast from 'react-hot-toast'

const profileSchema = z.object({
  first_name: z.string().min(1, 'Prenom requis'),
  last_name: z.string().min(1, 'Nom requis'),
  phone: z.string().optional(),
})

const emailSchema = z.object({
  email: z.string().email('Email invalide'),
})

const passwordSchema = z.object({
  current: z.string().min(1, 'Mot de passe actuel requis'),
  next: z.string().min(8, 'Minimum 8 caracteres'),
  confirm: z.string(),
}).refine(d => d.next === d.confirm, { message: 'Les mots de passe ne correspondent pas', path: ['confirm'] })

type Tab = 'info' | 'email' | 'password' | 'danger'

export function ProfilePage() {
  const { userProfile, signOut } = useAuth()
  const { setUserProfile } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('info')

  if (!userProfile) return null

  const TABS: { key: Tab; label: string; icon: typeof UserIcon }[] = [
    { key: 'info', label: 'Informations', icon: UserIcon },
    { key: 'email', label: 'Email', icon: Mail },
    { key: 'password', label: 'Mot de passe', icon: Lock },
    { key: 'danger', label: 'Zone sensible', icon: AlertTriangle },
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-immo-text-primary">Mon profil</h1>
        <p className="text-sm text-immo-text-secondary">Gerez vos informations personnelles et la securite de votre compte.</p>
      </div>

      <div className="flex gap-6">
        <div className="w-[220px] shrink-0 space-y-1">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  tab === t.key
                    ? t.key === 'danger'
                      ? 'bg-[#CD3D64]/10 font-medium text-[#CD3D64]'
                      : 'bg-immo-accent-green/10 font-medium text-immo-accent-green'
                    : 'text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            )
          })}
        </div>

        <div className="min-w-0 flex-1">
          {tab === 'info' && <InfoTab profile={userProfile} onSaved={(p) => setUserProfile(p as User)} />}
          {tab === 'email' && <EmailTab currentEmail={userProfile.email} />}
          {tab === 'password' && <PasswordTab />}
          {tab === 'danger' && <DangerTab onDeleted={async () => { await signOut(); navigate('/login', { replace: true }) }} />}
        </div>
      </div>
    </div>
  )
}

function InfoTab({ profile, onSaved }: { profile: { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string }; onSaved: (p: unknown) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: profile.first_name ?? '',
      last_name: profile.last_name ?? '',
      phone: profile.phone ?? '',
    },
  })

  async function onSubmit(data: z.infer<typeof profileSchema>) {
    const { data: updated, error } = await supabase
      .from('users')
      .update({ first_name: data.first_name, last_name: data.last_name, phone: data.phone || null } as never)
      .eq('id', profile.id)
      .select('*')
      .single()
    if (error) { toast.error(error.message); return }
    onSaved(updated)
    toast.success('Profil mis a jour')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border border-immo-border bg-immo-bg-card p-6">
      <h2 className="text-base font-bold text-immo-text-primary">Informations personnelles</h2>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-immo-text-secondary">Prenom</label>
          <input {...register('first_name')}
            className="h-10 w-full rounded-lg border border-immo-border bg-immo-bg-primary px-3 text-sm text-immo-text-primary outline-none focus:border-immo-accent-green" />
          {errors.first_name && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.first_name.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-immo-text-secondary">Nom</label>
          <input {...register('last_name')}
            className="h-10 w-full rounded-lg border border-immo-border bg-immo-bg-primary px-3 text-sm text-immo-text-primary outline-none focus:border-immo-accent-green" />
          {errors.last_name && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.last_name.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-immo-text-secondary">Email</label>
          <input value={profile.email} disabled
            className="h-10 w-full rounded-lg border border-immo-border bg-immo-bg-primary/50 px-3 text-sm text-immo-text-muted outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-immo-text-secondary">Telephone</label>
          <input {...register('phone')} placeholder="0555 12 34 56"
            className="h-10 w-full rounded-lg border border-immo-border bg-immo-bg-primary px-3 text-sm text-immo-text-primary outline-none focus:border-immo-accent-green" />
        </div>
      </div>
      <button type="submit" disabled={isSubmitting}
        className="mt-5 flex h-10 items-center gap-2 rounded-lg bg-immo-accent-green px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
        <Save className="h-4 w-4" /> Enregistrer
      </button>
    </form>
  )
}

function EmailTab({ currentEmail }: { currentEmail: string }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(emailSchema) })

  async function onSubmit(data: z.infer<typeof emailSchema>) {
    if (data.email === currentEmail) { toast.error('Nouvel email identique a l\'actuel'); return }
    const { error } = await supabase.auth.updateUser({ email: data.email })
    if (error) { toast.error(error.message); return }
    toast.success('Un email de confirmation a ete envoye a la nouvelle adresse')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border border-immo-border bg-immo-bg-card p-6">
      <h2 className="text-base font-bold text-immo-text-primary">Changer d'email</h2>
      <p className="mt-1 text-xs text-immo-text-secondary">Email actuel : <span className="font-semibold text-immo-text-primary">{currentEmail}</span></p>
      <div className="mt-5">
        <label className="mb-1 block text-xs font-semibold text-immo-text-secondary">Nouvel email</label>
        <input type="email" {...register('email')}
          className="h-10 w-full rounded-lg border border-immo-border bg-immo-bg-primary px-3 text-sm text-immo-text-primary outline-none focus:border-immo-accent-green" />
        {errors.email && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.email.message}</p>}
      </div>
      <button type="submit" disabled={isSubmitting}
        className="mt-5 flex h-10 items-center gap-2 rounded-lg bg-immo-accent-green px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
        <Mail className="h-4 w-4" /> Envoyer la confirmation
      </button>
    </form>
  )
}

function PasswordTab() {
  const [show, setShow] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({ resolver: zodResolver(passwordSchema) })

  async function onSubmit(data: z.infer<typeof passwordSchema>) {
    // Supabase does not enforce current password check out-of-the-box.
    // Verify by re-signing-in (no-op if current is correct).
    const { data: u } = await supabase.auth.getUser()
    if (!u.user?.email) { toast.error('Session expiree'); return }
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: u.user.email, password: data.current })
    if (signInErr) { toast.error('Mot de passe actuel incorrect'); return }
    const { error } = await supabase.auth.updateUser({ password: data.next })
    if (error) { toast.error(error.message); return }
    toast.success('Mot de passe mis a jour')
    reset()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border border-immo-border bg-immo-bg-card p-6">
      <h2 className="text-base font-bold text-immo-text-primary">Changer de mot de passe</h2>
      <div className="mt-5 space-y-4">
        {(['current', 'next', 'confirm'] as const).map(key => {
          const labels = { current: 'Mot de passe actuel', next: 'Nouveau mot de passe', confirm: 'Confirmer' }
          return (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold text-immo-text-secondary">{labels[key]}</label>
              <div className="relative">
                <input type={show ? 'text' : 'password'} {...register(key)}
                  className="h-10 w-full rounded-lg border border-immo-border bg-immo-bg-primary px-3 pr-10 text-sm text-immo-text-primary outline-none focus:border-immo-accent-green" />
                {key === 'current' && (
                  <button type="button" onClick={() => setShow(!show)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-immo-text-muted">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                )}
              </div>
              {errors[key] && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors[key]?.message as string}</p>}
            </div>
          )
        })}
      </div>
      <button type="submit" disabled={isSubmitting}
        className="mt-5 flex h-10 items-center gap-2 rounded-lg bg-immo-accent-green px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
        <Lock className="h-4 w-4" /> Mettre a jour
      </button>
    </form>
  )
}

function DangerTab({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    if (confirm !== 'SUPPRIMER') { toast.error('Tapez SUPPRIMER pour confirmer'); return }
    setLoading(true)
    try {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) throw new Error('Session expiree')
      const { error } = await supabase.functions.invoke('delete-account', { body: { user_id: u.user.id } })
      if (error) throw error
      toast.success('Compte supprime. A bientot.')
      await onDeleted()
    } catch (err) {
      toast.error((err as Error).message ?? 'Erreur lors de la suppression')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#CD3D64]/30 bg-[#CD3D64]/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#CD3D64]" />
          <div className="flex-1">
            <h2 className="text-base font-bold text-[#CD3D64]">Supprimer mon compte</h2>
            <p className="mt-1 text-xs text-immo-text-secondary">
              Cette action est <strong>irreversible</strong>. Toutes vos donnees personnelles seront supprimees.
              Si vous etes administrateur d'un tenant, contactez le support pour proceder a la suppression globale (RGPD).
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold text-immo-text-secondary">
                Tapez <span className="font-bold text-[#CD3D64]">SUPPRIMER</span> pour confirmer
              </label>
              <input value={confirm} onChange={e => setConfirm(e.target.value)}
                className="h-10 w-full rounded-lg border border-[#CD3D64]/30 bg-immo-bg-primary px-3 text-sm text-immo-text-primary outline-none focus:border-[#CD3D64]" />
            </div>
            <button onClick={handleDelete} disabled={loading || confirm !== 'SUPPRIMER'}
              className="mt-4 flex h-10 items-center gap-2 rounded-lg bg-[#CD3D64] px-4 text-sm font-semibold text-white hover:bg-[#B02D54] disabled:opacity-40">
              <Trash2 className="h-4 w-4" /> {loading ? 'Suppression...' : 'Supprimer definitivement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
