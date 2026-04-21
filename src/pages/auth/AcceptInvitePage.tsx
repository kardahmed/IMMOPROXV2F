import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, CheckCircle2, AlertCircle, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { checkRateLimit, recordAttempt, INVITE_RATE_LIMIT, formatRemainingTime } from '@/lib/rateLimit'

const schema = z.object({
  first_name: z.string().min(1, 'Prenom requis'),
  last_name: z.string().min(1, 'Nom requis'),
  password: z.string().min(8, 'Minimum 8 caracteres'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: 'Les mots de passe ne correspondent pas', path: ['confirm'] })

type FormData = z.infer<typeof schema>

export function AcceptInvitePage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [invite, setInvite] = useState<{ email: string; tenant_id: string; role: string; tenant_name?: string } | null>(null)
  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'done'>('loading')
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    (async () => {
      if (!token) { setStatus('invalid'); return }

      // Rate-limit invalid token attempts per-browser
      const check = checkRateLimit('accept-invite', INVITE_RATE_LIMIT)
      if (!check.allowed) {
        setError(`Trop de tentatives. Reessayez dans ${formatRemainingTime(check.remainingMs)}.`)
        setStatus('invalid')
        return
      }

      const { data, error } = await supabase
        .from('invitations')
        .select('email, tenant_id, role, expires_at, accepted_at, tenants(name)')
        .eq('token', token)
        .single()
      if (error || !data) {
        recordAttempt('accept-invite', false, INVITE_RATE_LIMIT)
        setStatus('invalid'); return
      }
      recordAttempt('accept-invite', true, INVITE_RATE_LIMIT)
      const row = data as unknown as { email: string; tenant_id: string; role: string; expires_at: string; accepted_at: string | null; tenants?: { name: string } }
      if (row.accepted_at) { setError('Invitation deja utilisee'); setStatus('invalid'); return }
      if (new Date(row.expires_at).getTime() < Date.now()) { setError('Invitation expiree'); setStatus('invalid'); return }
      setInvite({ email: row.email, tenant_id: row.tenant_id, role: row.role, tenant_name: row.tenants?.name })
      setStatus('valid')
    })()
  }, [token])

  async function onSubmit(data: FormData) {
    if (!invite) return
    try {
      const { data: auth, error: authErr } = await supabase.auth.signUp({
        email: invite.email, password: data.password,
        options: { data: { first_name: data.first_name, last_name: data.last_name } },
      })
      if (authErr) throw authErr
      if (!auth.user) throw new Error('Erreur creation compte')

      const { error: upErr } = await supabase.from('users').insert({
        id: auth.user.id, tenant_id: invite.tenant_id, email: invite.email,
        first_name: data.first_name, last_name: data.last_name,
        role: invite.role, status: 'active', last_activity: new Date().toISOString(),
        terms_accepted_at: new Date().toISOString(),
      } as never)
      if (upErr) throw upErr

      await supabase.from('invitations').update({ accepted_at: new Date().toISOString() } as never).eq('token', token)
      setStatus('done')
      setTimeout(() => navigate('/login'), 2500)
    } catch (err) {
      setError((err as Error).message ?? 'Erreur')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC] px-4 py-8" style={{fontFamily:"'Inter',-apple-system,sans-serif"}}>
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <img src="/logo-180.png" alt="IMMO PRO-X" className="h-10 w-10" />
          <span className="text-lg font-bold text-[#0A2540]">IMMO PRO-X</span>
        </div>

        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-lg shadow-black/[0.04]">
          {status === 'loading' && (
            <div className="py-8 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[#0579DA] border-t-transparent" />
              <p className="mt-3 text-sm text-[#8898AA]">Verification de l'invitation...</p>
            </div>
          )}

          {status === 'invalid' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#CD3D64]/10">
                <AlertCircle className="h-7 w-7 text-[#CD3D64]" />
              </div>
              <h1 className="text-xl font-bold text-[#0A2540]">Invitation invalide</h1>
              <p className="mt-2 text-sm text-[#8898AA]">{error || 'Le lien d\'invitation est invalide ou a expire.'}</p>
              <Link to="/login" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#0579DA] px-6 text-sm font-bold text-white hover:bg-[#0460B8]">
                Retour a la connexion
              </Link>
            </div>
          )}

          {status === 'done' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#00D4A0]/10">
                <CheckCircle2 className="h-7 w-7 text-[#00D4A0]" />
              </div>
              <h1 className="text-xl font-bold text-[#0A2540]">Compte cree</h1>
              <p className="mt-2 text-sm text-[#8898AA]">Redirection vers la page de connexion...</p>
            </div>
          )}

          {status === 'valid' && invite && (
            <>
              <h1 className="text-xl font-bold text-[#0A2540]">Bienvenue</h1>
              <p className="mt-1 text-sm text-[#8898AA]">
                Vous avez ete invite(e) a rejoindre <span className="font-semibold text-[#0A2540]">{invite.tenant_name ?? 'une agence'}</span> en tant que <span className="font-semibold text-[#0A2540]">{invite.role}</span>.
              </p>
              <p className="mt-2 text-xs text-[#8898AA]">Email : <span className="font-semibold text-[#0A2540]">{invite.email}</span></p>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#CD3D64]/20 bg-[#CD3D64]/5 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#CD3D64]" />
                  <p className="text-xs text-[#CD3D64]">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#425466]">Prenom</label>
                    <input {...register('first_name')} placeholder="Ahmed"
                      className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-3 text-sm text-[#0A2540] outline-none focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                    {errors.first_name && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.first_name.message}</p>}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#425466]">Nom</label>
                    <input {...register('last_name')} placeholder="Benali"
                      className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-3 text-sm text-[#0A2540] outline-none focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                    {errors.last_name && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.last_name.message}</p>}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#425466]">Mot de passe</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8898AA]" />
                    <input type="password" {...register('password')}
                      className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white pl-10 pr-3 text-sm text-[#0A2540] outline-none focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                  </div>
                  {errors.password && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.password.message}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[#425466]">Confirmer</label>
                  <input type="password" {...register('confirm')}
                    className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-3 text-sm text-[#0A2540] outline-none focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                  {errors.confirm && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.confirm.message}</p>}
                </div>

                <button type="submit" disabled={isSubmitting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0579DA] text-sm font-bold text-white hover:bg-[#0460B8] disabled:opacity-50">
                  <Save className="h-4 w-4" /> {isSubmitting ? 'Creation...' : 'Creer mon compte'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
