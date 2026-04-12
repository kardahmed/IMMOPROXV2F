import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { useTranslation } from 'react-i18next'
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'

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
      // Role-based redirect is handled by the isAuthenticated check above on re-render
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC] px-4">
      {/* Card */}
      <div className="w-full max-w-[420px] rounded-2xl border border-[#E3E8EF] bg-white p-10 shadow-lg shadow-black/[0.04]">
        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#CD3D64]/20 bg-[#FFF0F3] px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#CD3D64]" />
            <p className="text-sm text-[#CD3D64]">{error}</p>
          </div>
        )}

        {/* Logo + Title */}
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex items-center gap-3">
            <img src="/logo-180.png" alt="IMMO PRO-X" className="h-11 w-11 rounded-[10px]" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-[#0A2540]">IMMO PRO-X</h1>
              <p className="text-xs text-[#8898AA]">v2.0</p>
            </div>
          </div>
          <p className="text-sm text-[#425466]">{t('login.connect_to')}</p>
        </div>

        {/* Separator */}
        <div className="mb-6 h-px bg-[#E3E8EF]" />

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
            {errors.email && (
              <p className="mt-1 text-xs text-[#CD3D64]">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[#425466]">
              {t('login.password_label')}
            </label>
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
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8898AA] transition-colors hover:text-[#425466]"
              >
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-[#CD3D64]">{errors.password.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0579DA] text-sm font-bold text-white transition-all hover:bg-[#0461B3] hover:shadow-md hover:shadow-[#0579DA]/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{t('login.loading')}</span>
              </>
            ) : (
              <>
                <span>{t('login.submit')}</span>
                <LogIn className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-[13px] text-[#8898AA]">
          {t('login.first_login')}
        </p>
        <p className="mt-2 text-center text-[13px] text-[#8898AA]">
          Pas encore de compte ? <Link to="/register" className="font-medium text-[#0579DA] hover:underline">S'inscrire</Link>
        </p>
      </div>
    </div>
  )
}
