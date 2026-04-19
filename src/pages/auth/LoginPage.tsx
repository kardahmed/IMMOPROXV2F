import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { useTranslation } from 'react-i18next'
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle, Check, BarChart3, Globe, Zap, Shield, Star, ArrowLeft } from 'lucide-react'

const schema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

type FormData = z.infer<typeof schema>

const FEATURES = [
  { icon: BarChart3, text: 'Pipeline de vente 9 etapes' },
  { icon: Globe, text: 'Landing pages & tracking' },
  { icon: Zap, text: 'Scripts d\'appel IA' },
  { icon: Shield, text: 'Taches automatisees' },
]

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
    <div className="flex min-h-screen" style={{fontFamily:"'Inter',-apple-system,sans-serif"}}>
      {/* Left — Dark branding (same as marketing hero) */}
      <div className="hidden w-[420px] shrink-0 flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:w-[480px]" style={{background:'linear-gradient(165deg,#050D1A 0%,#0A2540 35%,#0B3D6F 65%,#0579DA 100%)',position:'relative'}}>
        {/* Grid overlay */}
        <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)',backgroundSize:'40px 40px',maskImage:'radial-gradient(ellipse 80% 80% at 50% 50%,black 30%,transparent 100%)'}} />
        <div style={{position:'absolute',top:'-100px',right:'-100px',width:'300px',height:'300px',borderRadius:'50%',background:'rgba(5,121,218,.3)',filter:'blur(80px)'}} />
        <div style={{position:'absolute',bottom:'-80px',left:'-80px',width:'250px',height:'250px',borderRadius:'50%',background:'rgba(6,182,212,.15)',filter:'blur(60px)'}} />

        <div style={{position:'relative',zIndex:1}}>
          <a href="/marketing/index.html" className="mb-8 flex items-center gap-2 text-[11px] text-white/40 hover:text-white/70 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Retour au site
          </a>
          <div className="flex items-center gap-3">
            <img src="/logo-180.png" alt="IMMO PRO-X" className="h-12 w-12" />
            <div>
              <span className="text-2xl" style={{fontWeight:900,letterSpacing:'-0.5px'}}>IMMO PRO-X</span>
              <p className="text-[10px] text-white/40">CRM Immobilier v2.0</p>
            </div>
          </div>
          <h2 className="mt-8 text-[28px] leading-tight" style={{fontWeight:900}}>
            Vendez vos biens<br/>
            <span style={{background:'linear-gradient(135deg,#3BA3FF,#06B6D4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>2x plus vite</span>
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/50">
            Pipeline de vente, landing pages, tracking publicitaire et intelligence artificielle — tout dans un seul outil.
          </p>
        </div>

        <div style={{position:'relative',zIndex:1}} className="space-y-3">
          {FEATURES.map(f => (
            <div key={f.text} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <f.icon className="h-4 w-4 text-white/80" />
              </div>
              <span className="text-[13px]" style={{fontWeight:500,color:'rgba(255,255,255,.8)'}}>{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{position:'relative',zIndex:1}} className="space-y-4">
          {/* Testimonial */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-sm">
            <div className="mb-2 flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />)}</div>
            <p className="text-[12px] leading-relaxed text-white/55 italic">"On est passe d'Excel a IMMO PRO-X en une journee. Nos 8 agents l'utilisent au quotidien."</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[9px]" style={{fontWeight:700}}>YM</div>
              <div><div className="text-[11px]" style={{fontWeight:600}}>Youcef M.</div><div className="text-[9px] text-white/30">DG — Groupe Batiplan, Oran</div></div>
            </div>
          </div>
          {/* Stats */}
          <div className="flex gap-6">
            <div><div className="text-lg" style={{fontWeight:900}}>+107</div><div className="text-[9px] text-white/30">Ventes</div></div>
            <div><div className="text-lg" style={{fontWeight:900}}>+15K</div><div className="text-[9px] text-white/30">Leads</div></div>
            <div><div className="text-lg" style={{fontWeight:900}}>87%</div><div className="text-[9px] text-white/30">Satisfaction</div></div>
          </div>
          <p className="text-[9px] text-white/15">© 2026 IMMO PRO-X. Concu en Algerie.</p>
        </div>
      </div>

      {/* Right — Form */}
      <div className="flex flex-1 items-center justify-center bg-[#F6F9FC] px-4">
        <div className="w-full max-w-[420px]">
          {/* Mobile header */}
          <div className="mb-6 lg:hidden">
            <a href="/marketing/index.html" className="mb-4 flex items-center gap-1.5 text-[11px] text-[#8898AA] hover:text-[#0579DA]">
              <ArrowLeft className="h-3 w-3" /> Retour au site
            </a>
            <div className="flex items-center justify-center gap-3">
              <img src="/logo-180.png" alt="" className="h-10 w-10" />
              <span className="text-lg" style={{fontWeight:800,color:'#0A2540'}}>IMMO PRO-X</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-xl shadow-black/[0.03] sm:p-10">
            {/* Error */}
            {error && (
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-[#CD3D64]/20 bg-[#FFF0F3] px-4 py-3">
                <AlertCircle className="h-4 w-4 shrink-0 text-[#CD3D64]" />
                <p className="text-sm text-[#CD3D64]">{error}</p>
              </div>
            )}

            {/* Title */}
            <div className="mb-6 hidden lg:block">
              <h1 className="text-[22px]" style={{fontWeight:800,color:'#0A2540',letterSpacing:'-0.3px'}}>{t('login.connect_to')}</h1>
              <p className="mt-1 text-[14px] text-[#8898AA]">Entrez vos identifiants pour acceder a votre espace.</p>
            </div>
            <div className="mb-6 text-center lg:hidden">
              <h1 className="text-lg" style={{fontWeight:800,color:'#0A2540'}}>{t('login.connect_to')}</h1>
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
                  <Link to="/forgot-password" className="text-[11px] text-[#0579DA] hover:underline" style={{fontWeight:600}}>
                    Mot de passe oublie ?
                  </Link>
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

            {/* Sign up */}
            <p className="mt-6 text-center text-[13px] text-[#8898AA]">
              Pas encore de compte ? <Link to="/register" className="text-[#0579DA] hover:underline" style={{fontWeight:600}}>S'inscrire gratuitement</Link>
            </p>
          </div>

          {/* Legal footer */}
          <div className="mt-4 flex justify-center gap-4 text-[10px] text-[#B0BAC5]">
            <a href="/marketing/cgu.html" className="hover:text-[#425466]">CGU</a>
            <span>·</span>
            <a href="/marketing/confidentialite.html" className="hover:text-[#425466]">Confidentialite</a>
            <span>·</span>
            <a href="/marketing/contact.html" className="hover:text-[#425466]">Contact</a>
          </div>
        </div>
      </div>
    </div>
  )
}
