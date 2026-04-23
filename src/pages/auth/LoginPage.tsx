import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { useTranslation } from 'react-i18next'
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, Check } from 'lucide-react'

const schema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { signIn, isAuthenticated, role } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  if (isAuthenticated && role) {
    navigate(role === 'super_admin' ? '/admin' : '/dashboard', { replace: true })
    return null
  }

  if (isAuthenticated && !role) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F6F9FC]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0579DA] border-t-transparent" />
          <p className="text-xs text-[#8898AA]">Connexion en cours...</p>
        </div>
      </div>
    )
  }

  async function onSubmit(data: FormData) {
    setError('')
    setLoading(true)
    try { await signIn(data.email, data.password) }
    catch (err) { setError(err instanceof Error ? err.message : 'Erreur de connexion') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC] px-4 py-10" style={{fontFamily:"'Inter',-apple-system,sans-serif"}}>
      <div className="w-full max-w-[420px]">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src="/logo-180.png" alt="IMMO PRO-X" className="h-12 w-12" />
          <div className="text-center">
            <div className="text-[20px]" style={{fontWeight:800,color:'#0A2540',letterSpacing:'-0.3px'}}>IMMO PRO-X</div>
            <div className="text-[11px] text-[#8898AA]">CRM Immobilier</div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-xl shadow-black/[0.03] sm:p-10">
          {/* Error */}
          {error && (
            <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#CD3D64]/20 bg-[#FFF0F3] px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-[#CD3D64]" />
              <p className="text-sm text-[#CD3D64]">{error}</p>
            </div>
          )}

          {/* Title */}
          <div className="mb-6">
            <h1 className="text-[20px]" style={{fontWeight:800,color:'#0A2540',letterSpacing:'-0.3px'}}>{t('login.connect_to')}</h1>
            <p className="mt-1 text-[13px] text-[#8898AA]">Entrez vos identifiants pour acceder a votre espace.</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-[12px] text-[#425466]" style={{fontWeight:600}}>
                {t('login.email_label')}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                <input id="email" type="email" autoComplete="email" placeholder="vous@agence.com"
                  {...register('email')}
                  className={`h-[48px] w-full rounded-xl border bg-white pl-11 pr-4 text-[14px] text-[#0A2540] placeholder-[#B0BAC5] outline-none transition-all ${
                    errors.email ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                  }`} style={{fontFamily:'inherit'}} />
              </div>
              {errors.email && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-[12px] text-[#425466]" style={{fontWeight:600}}>
                  {t('login.password_label')}
                </label>
                <button type="button" className="text-[11px] text-[#0579DA] hover:underline" style={{fontWeight:600}}>
                  Mot de passe oublie ?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                  {...register('password')}
                  className={`h-[48px] w-full rounded-xl border bg-white pl-11 pr-12 text-[14px] text-[#0A2540] placeholder-[#B0BAC5] outline-none transition-all ${
                    errors.password ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                  }`} style={{fontFamily:'inherit'}} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8898AA] transition-colors hover:text-[#425466]">
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.password.message}</p>}
            </div>

            {/* Remember */}
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={() => setRememberMe(!rememberMe)}
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-2 transition-all ${rememberMe ? 'border-[#0579DA] bg-[#0579DA]' : 'border-[#D0D5DD]'}`}>
                {rememberMe && <Check className="h-3 w-3 text-white" />}
              </button>
              <span className="text-[13px] text-[#8898AA]">Se souvenir de moi</span>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="flex h-[48px] w-full items-center justify-center gap-2 rounded-xl text-[14px] text-white transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              style={{background:'#0579DA',fontWeight:700,boxShadow:'0 4px 14px rgba(5,121,218,.25)'}}>
              {loading ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /><span>{t('login.loading')}</span></>
              ) : (
                <><span>{t('login.submit')}</span><LogIn className="h-4 w-4" /></>
              )}
            </button>
          </form>

          {/* Demo request — sales-led model, no self-service signup */}
          <p className="mt-6 text-center text-[13px] text-[#8898AA]">
            Pas encore client ? <a href="https://immoprox.io/contact.html" className="text-[#0579DA] hover:underline" style={{fontWeight:600}}>Demander une demo</a>
          </p>
        </div>

        {/* Legal footer */}
        <div className="mt-6 flex justify-center gap-4 text-[10px] text-[#B0BAC5]">
          <a href="https://immoprox.io/cgu.html" className="hover:text-[#425466]">CGU</a>
          <span>·</span>
          <a href="https://immoprox.io/confidentialite.html" className="hover:text-[#425466]">Confidentialite</a>
          <span>·</span>
          <a href="https://immoprox.io/contact.html" className="hover:text-[#425466]">Contact</a>
        </div>
      </div>
    </div>
  )
}
