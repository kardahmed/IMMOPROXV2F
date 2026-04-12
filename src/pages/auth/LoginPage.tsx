import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { useTranslation } from 'react-i18next'
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, Check, BarChart3, Globe, Zap, Shield } from 'lucide-react'
// import { supabase } from '@/lib/supabase'

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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  if (isAuthenticated) {
    const target = role === 'super_admin' ? '/admin' : '/dashboard'
    navigate(target, { replace: true })
    return null
  }

  async function onSubmit(data: FormData) {
    setError('')
    setLoading(true)
    try {
      await signIn(data.email, data.password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  const FEATURES = [
    { icon: BarChart3, text: 'Pipeline de vente avec 9 etapes' },
    { icon: Globe, text: 'Landing pages & tracking publicitaire' },
    { icon: Zap, text: 'Scripts d\'appel IA & playbook' },
    { icon: Shield, text: 'Systeme de taches automatise' },
  ]

  return (
    <div className="flex min-h-screen animate-in fade-in duration-500">
      {/* Left — Branding panel */}
      <div className="hidden w-[480px] shrink-0 flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0A2540] via-[#0B3D6F] to-[#0579DA] p-10 text-white lg:flex" style={{position:'relative'}}>
        {/* Grid overlay */}
        <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)',backgroundSize:'40px 40px',maskImage:'radial-gradient(ellipse 80% 80% at 50% 50%,black 30%,transparent 100%)'}} />
        {/* Glow */}
        <div style={{position:'absolute',top:'-100px',right:'-100px',width:'300px',height:'300px',borderRadius:'50%',background:'rgba(5,121,218,.3)',filter:'blur(80px)'}} />
        <div style={{position:'absolute',bottom:'-80px',left:'-80px',width:'250px',height:'250px',borderRadius:'50%',background:'rgba(6,182,212,.15)',filter:'blur(60px)'}} />

        <div style={{position:'relative',zIndex:1}}>
          <div className="flex items-center gap-3">
            <img src="/logo-180.png" alt="IMMO PRO-X" className="h-12 w-12" />
            <div>
              <span className="text-2xl font-900 tracking-tight">IMMO PRO-X</span>
              <p className="text-[10px] text-white/40">CRM Immobilier v2.0</p>
            </div>
          </div>
          <h2 className="mt-8 text-2xl font-800 leading-tight">
            Vendez vos biens<br/>
            <span style={{background:'linear-gradient(135deg,#3BA3FF,#06B6D4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>2x plus vite</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            Pipeline de vente, landing pages, tracking publicitaire et intelligence artificielle — tout dans un seul outil.
          </p>
        </div>

        <div style={{position:'relative',zIndex:1}} className="space-y-3">
          {FEATURES.map(f => (
            <div key={f.text} className="flex items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3 backdrop-blur-sm border border-white/[0.06]">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <f.icon className="h-4.5 w-4.5 text-white/80" />
              </div>
              <span className="text-[13px] font-medium text-white/80">{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{position:'relative',zIndex:1}} className="space-y-4">
          {/* Stats */}
          <div className="flex gap-6">
            <div><div className="text-xl font-900 text-white">+50</div><div className="text-[9px] text-white/35">Promoteurs</div></div>
            <div><div className="text-xl font-900 text-white">+15K</div><div className="text-[9px] text-white/35">Leads captures</div></div>
            <div><div className="text-xl font-900 text-white">98%</div><div className="text-[9px] text-white/35">Satisfaction</div></div>
          </div>
          {/* Avatars */}
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {['YM', 'SB', 'NF', 'KA', 'MA'].map(initials => (
                <div key={initials} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0B3D6F] bg-white/15 text-[8px] font-bold text-white backdrop-blur-sm">
                  {initials}
                </div>
              ))}
            </div>
            <span className="text-[10px] text-white/40">Rejoint par +50 promoteurs algeriens</span>
          </div>
          <p className="text-[9px] text-white/20">© 2026 IMMO PRO-X. Concu en Algerie.</p>
        </div>
      </div>

      {/* Right — Form */}
      <div className="flex flex-1 items-center justify-center bg-[#F6F9FC] px-4">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
            <img src="/logo-180.png" alt="IMMO PRO-X" className="h-10 w-10" />
            <span className="text-lg font-bold text-[#0A2540]">IMMO PRO-X</span>
          </div>

          <div className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-lg shadow-black/[0.04] sm:p-10">
            {/* Error */}
            {error && (
              <div className="mb-5 flex items-center gap-3 rounded-lg border border-[#CD3D64]/20 bg-[#FFF0F3] px-4 py-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#CD3D64]" />
                <p className="text-sm text-[#CD3D64]">{error}</p>
              </div>
            )}

            {/* Title */}
            <div className="mb-6 hidden lg:block">
              <h1 className="text-xl font-bold text-[#0A2540]">{t('login.connect_to')}</h1>
              <p className="mt-1 text-sm text-[#8898AA]">Entrez vos identifiants pour acceder a votre espace.</p>
            </div>

            {/* Mobile title */}
            <div className="mb-6 text-center lg:hidden">
              <h1 className="text-lg font-bold text-[#0A2540]">{t('login.connect_to')}</h1>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Email */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[#425466]">
                  {t('login.email_label')}
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="vous@agence.com"
                    {...register('email')}
                    className={`h-12 w-full rounded-lg border bg-white pl-11 pr-4 text-sm text-[#0A2540] placeholder-[#8898AA] outline-none transition-colors ${
                      errors.email ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                    }`}
                  />
                </div>
                {errors.email && <p className="mt-1 text-xs text-[#CD3D64]">{errors.email.message}</p>}
              </div>

              {/* Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-xs font-medium text-[#425466]">
                    {t('login.password_label')}
                  </label>
                  <button type="button" className="text-[11px] font-medium text-[#0579DA] hover:underline">
                    Mot de passe oublie ?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...register('password')}
                    className={`h-12 w-full rounded-lg border bg-white pl-11 pr-12 text-sm text-[#0A2540] placeholder-[#8898AA] outline-none transition-colors ${
                      errors.password ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                    }`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} tabIndex={-1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8898AA] transition-colors hover:text-[#425466]">
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-[#CD3D64]">{errors.password.message}</p>}
              </div>

              {/* Remember me */}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setRememberMe(!rememberMe)}
                  className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors ${rememberMe ? 'border-[#0579DA] bg-[#0579DA]' : 'border-[#E3E8EF]'}`}>
                  {rememberMe && <Check className="h-2.5 w-2.5 text-white" />}
                </button>
                <span className="text-xs text-[#8898AA]">Se souvenir de moi</span>
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0579DA] text-sm font-bold text-white transition-all hover:bg-[#0461B3] hover:shadow-md hover:shadow-[#0579DA]/20 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? (
                  <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /><span>{t('login.loading')}</span></>
                ) : (
                  <><span>{t('login.submit')}</span><LogIn className="h-4 w-4" /></>
                )}
              </button>
            </form>

            {/* Footer links */}
            <div className="mt-5 space-y-2 text-center">
              <p className="text-[13px] text-[#8898AA]">
                Pas encore de compte ? <Link to="/register" className="font-medium text-[#0579DA] hover:underline">S'inscrire gratuitement</Link>
              </p>
            </div>
          </div>

          {/* Legal */}
          <div className="mt-4 flex justify-center gap-4 text-[10px] text-[#8898AA]">
            <a href="#" className="hover:text-[#425466]">Conditions d'utilisation</a>
            <span>·</span>
            <a href="#" className="hover:text-[#425466]">Politique de confidentialite</a>
            <span>·</span>
            <a href="#" className="hover:text-[#425466]">Contact</a>
          </div>
        </div>
      </div>
    </div>
  )
}
