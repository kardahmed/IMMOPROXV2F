import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { Lock, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'

const schema = z
  .object({
    password: z.string().min(8, 'Minimum 8 caracteres'),
    confirm: z.string().min(1, 'Confirmation requise'),
  })
  .refine(v => v.password === v.confirm, {
    path: ['confirm'],
    message: 'Les mots de passe ne correspondent pas',
  })

type FormData = z.infer<typeof schema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hasRecoverySession, setHasRecoverySession] = useState<boolean | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  // Supabase writes the recovery session from the #access_token hash the
  // moment the user lands on this page. If no session appears within a
  // short window, the link was expired/invalid and we prompt them to
  // restart from /login.
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!cancelled) setHasRecoverySession(!!session)
      })
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])

  async function onSubmit(data: FormData) {
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: data.password })
    setSubmitting(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Mot de passe mis a jour. Vous etes connecte.')
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC] px-4 py-10" style={{fontFamily:"'Inter',-apple-system,sans-serif"}}>
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/logo-180.png" alt="IMMO PRO-X" className="h-12 w-12" />
          <div className="text-center">
            <div className="text-[20px]" style={{fontWeight:800,color:'#0A2540',letterSpacing:'-0.3px'}}>IMMO PRO-X</div>
            <div className="text-[11px] text-[#8898AA]">CRM Immobilier</div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-xl shadow-black/[0.03] sm:p-10">
          <div className="mb-6">
            <h1 className="text-[20px]" style={{fontWeight:800,color:'#0A2540',letterSpacing:'-0.3px'}}>Nouveau mot de passe</h1>
            <p className="mt-1 text-[13px] text-[#8898AA]">Choisissez un mot de passe solide pour votre compte.</p>
          </div>

          {hasRecoverySession === false && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#CD3D64]/20 bg-[#FFF0F3] px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#CD3D64]" />
              <p className="text-sm text-[#CD3D64]">
                Lien invalide ou expire. Retournez sur <a href="/login" className="underline">la page de connexion</a> et relancez la procedure.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="password" className="mb-1.5 block text-[12px] text-[#425466]" style={{fontWeight:600}}>
                Nouveau mot de passe
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className={`h-[48px] w-full rounded-xl border bg-white pl-11 pr-12 text-[14px] text-[#0A2540] placeholder-[#B0BAC5] outline-none transition-all ${
                    errors.password ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                  }`}
                  style={{fontFamily:'inherit'}}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8898AA] transition-colors hover:text-[#425466]">
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.password.message}</p>}
            </div>

            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-[12px] text-[#425466]" style={{fontWeight:600}}>
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                <input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  {...register('confirm')}
                  className={`h-[48px] w-full rounded-xl border bg-white pl-11 pr-4 text-[14px] text-[#0A2540] placeholder-[#B0BAC5] outline-none transition-all ${
                    errors.confirm ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                  }`}
                  style={{fontFamily:'inherit'}}
                />
              </div>
              {errors.confirm && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.confirm.message}</p>}
            </div>

            <button
              type="submit"
              disabled={submitting || hasRecoverySession === false}
              className="flex h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[14px] text-white transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              style={{background:'#0579DA',fontWeight:700,boxShadow:'0 4px 14px rgba(5,121,218,.25)'}}
            >
              {submitting ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /><span>Mise a jour...</span></>
              ) : (
                <><span>Mettre a jour le mot de passe</span><Check className="h-4 w-4" /></>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
