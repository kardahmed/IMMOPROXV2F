import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  password: z.string().min(8, 'Minimum 8 caracteres'),
  confirm: z.string().min(1, 'Confirmez votre mot de passe'),
}).refine(d => d.password === d.confirm, { message: 'Les mots de passe ne correspondent pas', path: ['confirm'] })

type FormData = z.infer<typeof schema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasSession, setHasSession] = useState<boolean | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  useEffect(() => {
    // Supabase redirects with a hash containing the recovery token.
    // supabase-js auto-detects it and establishes a session.
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setHasSession(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function onSubmit(data: FormData) {
    setError('')
    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: data.password })
      if (err) throw err
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la mise a jour')
    } finally {
      setLoading(false)
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
          {done ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#00D4A0]/10">
                <CheckCircle2 className="h-7 w-7 text-[#00D4A0]" />
              </div>
              <h1 className="text-xl font-bold text-[#0A2540]">Mot de passe mis a jour</h1>
              <p className="mt-2 text-sm text-[#8898AA]">Redirection vers la page de connexion...</p>
            </div>
          ) : hasSession === false ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#CD3D64]/10">
                <AlertCircle className="h-7 w-7 text-[#CD3D64]" />
              </div>
              <h1 className="text-xl font-bold text-[#0A2540]">Lien invalide ou expire</h1>
              <p className="mt-2 text-sm text-[#8898AA]">Demandez un nouveau lien de reinitialisation.</p>
              <Link to="/forgot-password"
                className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#0579DA] px-6 text-sm font-bold text-white hover:bg-[#0460B8]">
                Nouveau lien
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-[#0A2540]">Nouveau mot de passe</h1>
              <p className="mt-1 text-sm text-[#8898AA]">Choisissez un mot de passe d'au moins 8 caracteres.</p>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#CD3D64]/20 bg-[#CD3D64]/5 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#CD3D64]" />
                  <p className="text-xs text-[#CD3D64]">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-[#425466]">Mot de passe</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      {...register('password')}
                      className={`h-[48px] w-full rounded-xl border bg-white pl-11 pr-12 text-[14px] text-[#0A2540] placeholder-[#B0BAC5] outline-none transition-all ${
                        errors.password ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                      }`}
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8898AA] hover:text-[#425466]">
                      {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.password.message}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-[#425466]">Confirmer</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      {...register('confirm')}
                      className={`h-[48px] w-full rounded-xl border bg-white pl-11 pr-4 text-[14px] text-[#0A2540] placeholder-[#B0BAC5] outline-none transition-all ${
                        errors.confirm ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                      }`}
                    />
                  </div>
                  {errors.confirm && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.confirm.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0579DA] text-[14px] font-bold text-white transition-all hover:bg-[#0460B8] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /><span>Mise a jour...</span></>
                  ) : (
                    <><Save className="h-4 w-4" /><span>Mettre a jour</span></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
