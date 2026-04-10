import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/hooks/useAuth'
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'

const schema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A1030] px-4">
      {/* Background atmospheric glows */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-[200px] top-[20%] h-[600px] w-[600px] rounded-full bg-[#00D4A0] opacity-[0.03] blur-[150px]" />
        <div className="absolute -right-[150px] bottom-[10%] h-[500px] w-[500px] rounded-full bg-[#00D4A0] opacity-[0.02] blur-[130px]" />
        <div className="absolute left-[40%] top-[60%] h-[400px] w-[400px] rounded-full bg-[#3782FF] opacity-[0.02] blur-[120px]" />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-[420px] rounded-2xl border border-[#1E325A] bg-[#0F1830] p-10 shadow-2xl shadow-black/40">
        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#FF4949]/30 bg-[#320F0F] px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#FF4949]" />
            <p className="text-sm text-[#FF4949]">{error}</p>
          </div>
        )}

        {/* Logo + Title */}
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#00D4A0]">
              <span className="text-base font-bold text-white">IP</span>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">IMMO PRO-X</h1>
              <p className="text-xs text-[#4E6687]">v2.0</p>
            </div>
          </div>
          <p className="text-sm text-[#7F96B7]">Connectez-vous à votre espace</p>
        </div>

        {/* Separator */}
        <div className="mb-6 h-px bg-[#1E325A]" />

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-[#7F96B7]">
              Adresse email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#4E6687]" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="vous@agence.com"
                {...register('email')}
                className={`h-12 w-full rounded-lg border bg-[#0A1030] pl-11 pr-4 text-sm text-white placeholder-[#4E6687] outline-none transition-colors ${
                  errors.email ? 'border-[#FF4949]' : 'border-[#1E325A] focus:border-[#00D4A0]'
                }`}
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-xs text-[#FF4949]">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-[#7F96B7]">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#4E6687]" />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                className={`h-12 w-full rounded-lg border bg-[#0A1030] pl-11 pr-12 text-sm text-white placeholder-[#4E6687] outline-none transition-colors ${
                  errors.password ? 'border-[#FF4949]' : 'border-[#1E325A] focus:border-[#00D4A0]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#4E6687] transition-colors hover:text-[#7F96B7]"
              >
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-[#FF4949]">{errors.password.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#00D4A0] text-sm font-bold text-[#0A1030] transition-colors hover:bg-[#00B890] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0A1030] border-t-transparent" />
                <span>Connexion en cours...</span>
              </>
            ) : (
              <>
                <span>Connexion</span>
                <LogIn className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-[13px] text-[#4E6687]">
          Première connexion ? Contactez votre administrateur
        </p>
      </div>
    </div>
  )
}
