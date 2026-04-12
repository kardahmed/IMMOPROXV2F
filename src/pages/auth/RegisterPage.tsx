import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

const WILAYAS = ['Adrar','Chlef','Laghouat','Oum El Bouaghi','Batna','Bejaia','Biskra','Bechar','Blida','Bouira','Tamanrasset','Tebessa','Tlemcen','Tiaret','Tizi Ouzou','Alger','Djelfa','Jijel','Setif','Saida','Skikda','Sidi Bel Abbes','Annaba','Guelma','Constantine','Medea','Mostaganem','M\'sila','Mascara','Ouargla','Oran','El Bayadh','Illizi','Bordj Bou Arreridj','Boumerdes','El Tarf','Tindouf','Tissemsilt','El Oued','Khenchela','Souk Ahras','Tipaza','Mila','Ain Defla','Naama','Ain Temouchent','Ghardaia','Relizane']

const PLANS = [
  { key: 'free', label: 'Free', price: 'Gratuit', features: ['2 agents', '1 projet', '20 unites', '50 clients'] },
  { key: 'starter', label: 'Starter', price: '9 900 DA/mois', features: ['5 agents', '3 projets', '100 unites', 'Export CSV', 'Suggestions IA'] },
  { key: 'pro', label: 'Pro', price: '19 900 DA/mois', features: ['15 agents', '10 projets', '500 unites', 'Scripts IA', 'PDF', 'Landing pages'] },
]

type Step = 'plan' | 'info' | 'confirm'

export function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('plan')
  const [plan, setPlan] = useState('free')
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    companyName: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    wilaya: '',
  })

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.companyName || !form.email || !form.password || !form.firstName || !form.lastName) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }

    setLoading(true)
    try {
      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { first_name: form.firstName, last_name: form.lastName } },
      })
      if (authErr) throw authErr
      if (!authData.user) throw new Error('Erreur creation compte')

      // 2. Create tenant
      const { data: tenant, error: tenantErr } = await supabase.from('tenants').insert({
        name: form.companyName,
        email: form.email,
        phone: form.phone || null,
        wilaya: form.wilaya || null,
        plan,
        onboarding_completed: false,
        trial_ends_at: plan === 'free' ? null : new Date(Date.now() + 14 * 86400000).toISOString(),
      } as never).select('id').single()
      if (tenantErr) throw tenantErr

      const tenantId = (tenant as { id: string }).id

      // 3. Create user profile
      const { error: profileErr } = await supabase.from('users').insert({
        id: authData.user.id,
        tenant_id: tenantId,
        email: form.email,
        first_name: form.firstName,
        last_name: form.lastName,
        phone: form.phone || null,
        role: 'admin',
        status: 'active',
        last_activity: new Date().toISOString(),
      } as never)
      if (profileErr) throw profileErr

      // 4. Create tenant settings
      await supabase.from('tenant_settings').insert({ tenant_id: tenantId } as never)

      toast.success('Compte cree avec succes !')
      navigate('/login')
    } catch (err) {
      toast.error((err as Error).message ?? 'Erreur lors de l\'inscription')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F6F9FC]">
      {/* Left side — branding */}
      <div className="hidden w-[400px] flex-col justify-between bg-gradient-to-b from-[#0579DA] to-[#0456A0] p-10 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <img src="/logo-180.png" alt="IMMO PRO-X" className="h-10 w-10" />
            <span className="text-xl font-bold">IMMO PRO-X</span>
          </div>
          <p className="mt-4 text-sm text-white/70">La plateforme CRM immobilier complete pour les promoteurs algeriens.</p>
        </div>
        <div className="space-y-4">
          {['Pipeline de vente complet', 'Landing pages & tracking', 'Scripts d\'appel IA', 'Multi-agent & multi-projet'].map(f => (
            <div key={f} className="flex items-center gap-2 text-sm text-white/80">
              <Check className="h-4 w-4 text-white/60" /> {f}
            </div>
          ))}
        </div>
        <p className="text-xs text-white/40">© 2026 IMMO PRO-X. Tous droits reserves.</p>
      </div>

      {/* Right side — form */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="w-full max-w-lg">
          {/* Steps indicator */}
          <div className="mb-8 flex items-center gap-3">
            {(['plan', 'info', 'confirm'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step === s ? 'bg-[#0579DA] text-white' : 'bg-[#E3E8EF] text-[#8898AA]'}`}>
                  {i + 1}
                </div>
                <span className={`text-xs ${step === s ? 'font-medium text-[#0A2540]' : 'text-[#8898AA]'}`}>
                  {s === 'plan' ? 'Plan' : s === 'info' ? 'Informations' : 'Confirmation'}
                </span>
                {i < 2 && <div className="mx-1 h-px w-8 bg-[#E3E8EF]" />}
              </div>
            ))}
          </div>

          {/* Step 1: Choose plan */}
          {step === 'plan' && (
            <div>
              <h1 className="text-2xl font-bold text-[#0A2540]">Choisissez votre plan</h1>
              <p className="mt-1 text-sm text-[#425466]">Vous pouvez changer de plan a tout moment.</p>

              <div className="mt-6 space-y-3">
                {PLANS.map(p => (
                  <button key={p.key} onClick={() => setPlan(p.key)}
                    className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all ${plan === p.key ? 'border-[#0579DA] bg-[#0579DA]/5' : 'border-[#E3E8EF] hover:border-[#0579DA]/30'}`}>
                    <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 ${plan === p.key ? 'border-[#0579DA] bg-[#0579DA]' : 'border-[#E3E8EF]'}`}>
                      {plan === p.key && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#0A2540]">{p.label}</span>
                        <span className="text-sm font-medium text-[#0579DA]">{p.price}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {p.features.map(f => (
                          <span key={f} className="rounded-full bg-[#F0F4F8] px-2 py-0.5 text-[10px] text-[#425466]">{f}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <Button onClick={() => setStep('info')} className="mt-6 w-full bg-[#0579DA] text-white hover:bg-[#0460B8]">
                Continuer <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Company & user info */}
          {step === 'info' && (
            <div>
              <h1 className="text-2xl font-bold text-[#0A2540]">Informations</h1>
              <p className="mt-1 text-sm text-[#425466]">Creez votre compte administrateur.</p>

              <div className="mt-6 space-y-4">
                <div>
                  <Label className="text-xs font-medium text-[#425466]">Nom de l'agence / promoteur *</Label>
                  <Input value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Ex: Promotion El Feth" className="mt-1 border-[#E3E8EF]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs font-medium text-[#425466]">Prenom *</Label><Input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Ahmed" className="mt-1 border-[#E3E8EF]" /></div>
                  <div><Label className="text-xs font-medium text-[#425466]">Nom *</Label><Input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Benali" className="mt-1 border-[#E3E8EF]" /></div>
                </div>
                <div><Label className="text-xs font-medium text-[#425466]">Email *</Label><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@monagence.dz" className="mt-1 border-[#E3E8EF]" /></div>
                <div><Label className="text-xs font-medium text-[#425466]">Mot de passe *</Label><Input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Minimum 6 caracteres" className="mt-1 border-[#E3E8EF]" /></div>
                <div><Label className="text-xs font-medium text-[#425466]">Telephone</Label><Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0555 12 34 56" className="mt-1 border-[#E3E8EF]" /></div>
                <div>
                  <Label className="text-xs font-medium text-[#425466]">Wilaya</Label>
                  <select value={form.wilaya} onChange={e => set('wilaya', e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#E3E8EF] bg-white px-3 text-sm text-[#0A2540]">
                    <option value="">Selectionnez</option>
                    {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <Button onClick={() => setStep('plan')} className="border border-[#E3E8EF] bg-white text-[#425466] hover:bg-[#F0F4F8]">Retour</Button>
                <Button onClick={() => setStep('confirm')} disabled={!form.companyName || !form.email || !form.password || !form.firstName || !form.lastName}
                  className="flex-1 bg-[#0579DA] text-white hover:bg-[#0460B8]">
                  Continuer <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm */}
          {step === 'confirm' && (
            <div>
              <h1 className="text-2xl font-bold text-[#0A2540]">Confirmer l'inscription</h1>
              <p className="mt-1 text-sm text-[#425466]">Verifiez vos informations avant de creer votre compte.</p>

              <div className="mt-6 rounded-xl border border-[#E3E8EF] bg-white p-5 space-y-3">
                <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Agence</span><span className="font-medium text-[#0A2540]">{form.companyName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Admin</span><span className="font-medium text-[#0A2540]">{form.firstName} {form.lastName}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Email</span><span className="font-medium text-[#0A2540]">{form.email}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Telephone</span><span className="font-medium text-[#0A2540]">{form.phone || '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Wilaya</span><span className="font-medium text-[#0A2540]">{form.wilaya || '-'}</span></div>
                <div className="border-t border-[#E3E8EF] pt-3 flex justify-between text-sm">
                  <span className="text-[#8898AA]">Plan</span>
                  <span className="font-bold text-[#0579DA]">{PLANS.find(p => p.key === plan)?.label} — {PLANS.find(p => p.key === plan)?.price}</span>
                </div>
                {plan !== 'free' && <p className="text-[10px] text-[#8898AA]">14 jours d'essai gratuit inclus</p>}
              </div>

              <div className="mt-6 flex gap-3">
                <Button onClick={() => setStep('info')} className="border border-[#E3E8EF] bg-white text-[#425466] hover:bg-[#F0F4F8]">Retour</Button>
                <Button onClick={handleSubmit} disabled={loading} className="flex-1 bg-[#0579DA] text-white hover:bg-[#0460B8]">
                  {loading ? <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
                  Creer mon compte
                </Button>
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-[#8898AA]">
            Deja inscrit ? <Link to="/login" className="text-[#0579DA] hover:underline">Se connecter</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
