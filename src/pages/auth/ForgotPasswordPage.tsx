import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowLeft, Send, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide'),
})

type FormData = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors }, getValues } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setError('')
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error: err } = await supabase.auth.resetPasswordForEmail(data.email, { redirectTo })
      if (err) throw err
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer l'email de reinitialisation")
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
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#00D4A0]/10">
                <CheckCircle2 className="h-7 w-7 text-[#00D4A0]" />
              </div>
              <h1 className="text-xl font-bold text-[#0A2540]">Email envoye</h1>
              <p className="mt-2 text-sm text-[#8898AA]">
                Un lien de reinitialisation a ete envoye a <span className="font-semibold text-[#0A2540]">{getValues('email')}</span>.
                Verifiez votre boite de reception (et les spams).
              </p>
              <Link to="/login"
                className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0579DA] px-6 text-sm font-bold text-white transition-all hover:bg-[#0460B8]">
                <ArrowLeft className="h-4 w-4" /> Retour a la connexion
              </Link>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-[#0A2540]">Mot de passe oublie ?</h1>
              <p className="mt-1 text-sm text-[#8898AA]">
                Entrez votre email et nous vous enverrons un lien pour reinitialiser votre mot de passe.
              </p>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#CD3D64]/20 bg-[#CD3D64]/5 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#CD3D64]" />
                  <p className="text-xs text-[#CD3D64]">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-[12px] font-semibold text-[#425466]">Email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#8898AA]" />
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="vous@agence.com"
                      {...register('email')}
                      className={`h-[48px] w-full rounded-xl border bg-white pl-11 pr-4 text-[14px] text-[#0A2540] placeholder-[#B0BAC5] outline-none transition-all ${
                        errors.email ? 'border-[#CD3D64]' : 'border-[#E3E8EF] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10'
                      }`}
                    />
                  </div>
                  {errors.email && <p className="mt-1 text-[11px] text-[#CD3D64]">{errors.email.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="flex h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#0579DA] text-[14px] font-bold text-white transition-all hover:bg-[#0460B8] hover:shadow-lg hover:shadow-[#0579DA]/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /><span>Envoi...</span></>
                  ) : (
                    <><Send className="h-4 w-4" /><span>Envoyer le lien</span></>
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-[13px] text-[#8898AA]">
                <Link to="/login" className="inline-flex items-center gap-1 font-semibold text-[#0579DA] hover:underline">
                  <ArrowLeft className="h-3.5 w-3.5" /> Retour a la connexion
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
