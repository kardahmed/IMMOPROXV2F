import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowLeft, Check, BarChart3, Globe, Zap, Shield, Users, Star, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import toast from 'react-hot-toast'

const WILAYAS = ['Adrar','Chlef','Laghouat','Oum El Bouaghi','Batna','Bejaia','Biskra','Bechar','Blida','Bouira','Tamanrasset','Tebessa','Tlemcen','Tiaret','Tizi Ouzou','Alger','Djelfa','Jijel','Setif','Saida','Skikda','Sidi Bel Abbes','Annaba','Guelma','Constantine','Medea','Mostaganem','M\'sila','Mascara','Ouargla','Oran','El Bayadh','Illizi','Bordj Bou Arreridj','Boumerdes','El Tarf','Tindouf','Tissemsilt','El Oued','Khenchela','Souk Ahras','Tipaza','Mila','Ain Defla','Naama','Ain Temouchent','Ghardaia','Relizane']

const PLANS = [
  { key: 'free', label: 'Free', priceMonthly: '0', priceYearly: '0', suffix: 'DA', desc: 'Pour decouvrir', features: ['2 agents', '1 projet', '20 unites', '50 clients'], color: '#8898AA' },
  { key: 'starter', label: 'Starter', priceMonthly: '9 900', priceYearly: '99 000', suffix: 'DA', desc: 'Petites agences', features: ['5 agents', '3 projets', '100 unites', 'Suggestions IA', 'Export CSV'], color: '#0579DA', popular: false },
  { key: 'pro', label: 'Pro', priceMonthly: '19 900', priceYearly: '199 000', suffix: 'DA', desc: 'Promoteurs ambitieux', features: ['15 agents', '10 projets', '500 unites', 'Scripts IA', 'Landing pages', 'PDF'], color: '#7C3AED', popular: true },
  { key: 'enterprise', label: 'Enterprise', priceMonthly: 'Sur devis', priceYearly: 'Sur devis', suffix: '', desc: 'Grands promoteurs', features: ['Agents illimites', 'Projets illimites', 'Unites illimitees', 'IA complete', 'Branding', 'API'], color: '#D4AF37', contact: true },
]

const FEATURES = [
  { icon: BarChart3, text: 'Pipeline de vente 9 etapes' },
  { icon: Globe, text: 'Landing pages & tracking' },
  { icon: Zap, text: 'Scripts d\'appel IA' },
  { icon: Shield, text: 'Taches automatisees' },
  { icon: Users, text: 'Multi-agents & equipes' },
]

type Step = 'plan' | 'info' | 'confirm'

export function RegisterPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('plan')
  const [plan, setPlan] = useState('free')
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    companyName: '', email: '', password: '', firstName: '', lastName: '', phone: '', wilaya: '',
  })
  const [termsAccepted, setTermsAccepted] = useState(false)

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit() {
    if (!form.companyName || !form.email || !form.password || !form.firstName || !form.lastName) {
      toast.error('Veuillez remplir tous les champs obligatoires'); return
    }
    if (!termsAccepted) {
      toast.error('Vous devez accepter les CGU et la politique de confidentialite'); return
    }
    setLoading(true)
    try {
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email, password: form.password,
        options: {
          data: { first_name: form.firstName, last_name: form.lastName },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })
      if (authErr) throw authErr
      if (!authData.user) throw new Error('Erreur creation compte')

      const { data: tenant, error: tenantErr } = await supabase.from('tenants').insert({
        name: form.companyName, email: form.email, phone: form.phone || null,
        wilaya: form.wilaya || null, plan, onboarding_completed: false,
        trial_ends_at: plan === 'free' ? null : new Date(Date.now() + 14 * 86400000).toISOString(),
      } as never).select('id').single()
      if (tenantErr) throw tenantErr

      const tenantId = (tenant as { id: string }).id
      await supabase.from('users').insert({
        id: authData.user.id, tenant_id: tenantId, email: form.email,
        first_name: form.firstName, last_name: form.lastName, phone: form.phone || null,
        role: 'admin', status: 'active', last_activity: new Date().toISOString(),
        terms_accepted_at: new Date().toISOString(),
      } as never)
      await supabase.from('tenant_settings').insert({ tenant_id: tenantId } as never)

      toast.success('Compte cree ! Verifiez votre email pour confirmer votre inscription.')
      navigate('/login')
    } catch (err) {
      toast.error((err as Error).message ?? 'Erreur lors de l\'inscription')
    } finally { setLoading(false) }
  }

  const selectedPlan = PLANS.find(p => p.key === plan) ?? PLANS[0]

  return (
    <div className="flex min-h-screen animate-in fade-in duration-500">
      {/* Left — Dark branding panel */}
      <div className="hidden w-[480px] shrink-0 flex-col justify-between overflow-hidden p-10 text-white lg:flex" style={{background:'linear-gradient(165deg,#050D1A 0%,#0A2540 35%,#0B3D6F 65%,#0579DA 100%)',position:'relative'}}>
        {/* Grid */}
        <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)',backgroundSize:'40px 40px',maskImage:'radial-gradient(ellipse 80% 80% at 50% 50%,black 30%,transparent 100%)'}} />
        <div style={{position:'absolute',top:'-100px',right:'-100px',width:'300px',height:'300px',borderRadius:'50%',background:'rgba(5,121,218,.3)',filter:'blur(80px)'}} />
        <div style={{position:'absolute',bottom:'-80px',left:'-80px',width:'250px',height:'250px',borderRadius:'50%',background:'rgba(6,182,212,.15)',filter:'blur(60px)'}} />

        <div style={{position:'relative',zIndex:1}}>
          <div className="flex items-center gap-3">
            <img src="/logo-180.png" alt="IMMO PRO-X" className="h-12 w-12" />
            <div>
              <span className="text-2xl font-black tracking-tight">IMMO PRO-X</span>
              <p className="text-[10px] text-white/40">CRM Immobilier v2.0</p>
            </div>
          </div>
          <h2 className="mt-8 text-2xl font-extrabold leading-tight">
            +107 appartements vendus<br/>
            <span style={{background:'linear-gradient(135deg,#3BA3FF,#06B6D4)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>grace a IMMO PRO-X</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/55">
            Creez votre compte en 2 minutes et commencez a gerer vos projets immobiliers avec les meilleurs outils.
          </p>
        </div>

        <div style={{position:'relative',zIndex:1}} className="space-y-3">
          {FEATURES.map(f => (
            <div key={f.text} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <f.icon className="h-4 w-4 text-white/80" />
              </div>
              <span className="text-[13px] font-medium text-white/80">{f.text}</span>
            </div>
          ))}
        </div>

        <div style={{position:'relative',zIndex:1}} className="space-y-4">
          {/* Testimonial */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-sm">
            <div className="mb-2 flex gap-0.5">{[1,2,3,4,5].map(i => <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />)}</div>
            <p className="text-[12px] leading-relaxed text-white/60 italic">"On est passe d'Excel a IMMO PRO-X en une journee. Nos 8 agents l'utilisent maintenant au quotidien."</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[9px] font-bold">YM</div>
              <div><div className="text-[11px] font-semibold">Youcef M.</div><div className="text-[9px] text-white/35">DG — Groupe Batiplan, Oran</div></div>
            </div>
          </div>
          <p className="text-[9px] text-white/20">© 2026 IMMO PRO-X. Concu en Algerie.</p>
        </div>
      </div>

      {/* Right — Form */}
      <div className="flex flex-1 items-center justify-center bg-[#F6F9FC] px-4 py-8">
        <div className="w-full max-w-lg">
          {/* Mobile logo */}
          <div className="mb-6 flex items-center justify-center gap-3 lg:hidden">
            <img src="/logo-180.png" alt="" className="h-10 w-10" />
            <span className="text-lg font-bold text-[#0A2540]">IMMO PRO-X</span>
          </div>

          {/* Steps indicator */}
          <div className="mb-6 flex items-center justify-center gap-2">
            {(['plan', 'info', 'confirm'] as const).map((s, i) => {
              const done = (['plan','info','confirm'] as const).indexOf(step) > i
              const active = step === s
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                    active ? 'bg-[#0579DA] text-white shadow-lg shadow-[#0579DA]/25' :
                    done ? 'bg-[#00D4A0] text-white' : 'bg-[#E3E8EF] text-[#8898AA]'
                  }`}>
                    {done ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className={`text-xs hidden sm:block ${active ? 'font-semibold text-[#0A2540]' : 'text-[#8898AA]'}`}>
                    {s === 'plan' ? 'Plan' : s === 'info' ? 'Informations' : 'Confirmation'}
                  </span>
                  {i < 2 && <div className={`mx-1 h-px w-8 ${done ? 'bg-[#00D4A0]' : 'bg-[#E3E8EF]'}`} />}
                </div>
              )
            })}
          </div>

          <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-lg shadow-black/[0.04] sm:p-8">

            {/* Step 1: Plan */}
            {step === 'plan' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h1 className="text-xl font-bold text-[#0A2540]">Choisissez votre plan</h1>
                <p className="mt-1 text-sm text-[#8898AA]">Changez a tout moment. Essai 14 jours gratuit sur les plans payants.</p>

                {/* Monthly / Yearly toggle */}
                <div className="mt-4 flex items-center justify-center gap-3">
                  <span className={`text-xs font-medium ${billing === 'monthly' ? 'text-[#0A2540]' : 'text-[#8898AA]'}`}>Mensuel</span>
                  <button onClick={() => setBilling(prev => prev === 'monthly' ? 'yearly' : 'monthly')}
                    className={`relative h-6 w-11 rounded-full transition-all ${billing === 'yearly' ? 'bg-[#0579DA]' : 'bg-[#E3E8EF]'}`}>
                    <div className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: billing === 'yearly' ? '22px' : '2px' }} />
                  </button>
                  <span className={`text-xs font-medium ${billing === 'yearly' ? 'text-[#0A2540]' : 'text-[#8898AA]'}`}>Annuel</span>
                  {billing === 'yearly' && <span className="rounded-full bg-[#00D4A0]/10 px-2 py-0.5 text-[9px] font-bold text-[#00D4A0]">-17%</span>}
                </div>

                <div className="mt-5 space-y-3">
                  {PLANS.map(p => {
                    const isContact = 'contact' in p && p.contact
                    if (isContact) {
                      return (
                        <a key={p.key} href="https://wa.me/213542766068?text=Bonjour%2C%20je%20suis%20int%C3%A9ress%C3%A9%20par%20le%20plan%20Enterprise%20IMMO%20PRO-X" target="_blank" rel="noopener noreferrer"
                          className="flex w-full items-start gap-4 rounded-xl border-2 border-[#D4AF37]/30 bg-[#D4AF37]/[0.03] p-4 text-left transition-all hover:border-[#D4AF37]/60 hover:shadow-sm">
                          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#D4AF37] bg-[#D4AF37]">
                            <MessageCircle className="h-3 w-3 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#0A2540]">{p.label}</span>
                                <span className="rounded-full bg-[#D4AF37]/10 px-2 py-0.5 text-[9px] font-bold text-[#D4AF37]">Sur mesure</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-[#D4AF37]">Nous contacter</span>
                              </div>
                            </div>
                            <p className="mt-0.5 text-xs text-[#8898AA]">{p.desc}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {p.features.map(f => (
                                <span key={f} className="flex items-center gap-1 rounded-md bg-[#D4AF37]/5 px-2 py-0.5 text-[10px] text-[#425466]">
                                  <Check className="h-2.5 w-2.5 text-[#D4AF37]" />{f}
                                </span>
                              ))}
                            </div>
                          </div>
                        </a>
                      )
                    }
                    return (
                    <button key={p.key} onClick={() => setPlan(p.key)}
                      className={`flex w-full items-start gap-4 rounded-xl border-2 p-4 text-left transition-all ${
                        plan === p.key ? 'border-[#0579DA] bg-[#0579DA]/[0.03] shadow-sm' : 'border-[#E3E8EF] hover:border-[#0579DA]/30'
                      }`}>
                      <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        plan === p.key ? 'border-[#0579DA] bg-[#0579DA]' : 'border-[#E3E8EF]'
                      }`}>
                        {plan === p.key && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#0A2540]">{p.label}</span>
                            {p.popular && <span className="rounded-full bg-[#7C3AED]/10 px-2 py-0.5 text-[9px] font-bold text-[#7C3AED]">Populaire</span>}
                          </div>
                          <div className="text-right">
                            <span className="text-lg font-black text-[#0A2540]">{billing === 'yearly' ? p.priceYearly : p.priceMonthly}</span>
                            <span className="ml-1 text-xs text-[#8898AA]">{p.suffix ? (billing === 'yearly' ? 'DA/an' : 'DA/mois') : ''}</span>
                          </div>
                        </div>
                        <p className="mt-0.5 text-xs text-[#8898AA]">{p.desc}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {p.features.map(f => (
                            <span key={f} className="flex items-center gap-1 rounded-md bg-[#F0F4F8] px-2 py-0.5 text-[10px] text-[#425466]">
                              <Check className="h-2.5 w-2.5 text-[#00D4A0]" />{f}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                    )
                  })}
                </div>

                <button onClick={() => setStep('info')}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0579DA] text-sm font-bold text-white transition-all hover:bg-[#0460B8] hover:shadow-lg hover:shadow-[#0579DA]/20">
                  Continuer <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Step 2: Info */}
            {step === 'info' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h1 className="text-xl font-bold text-[#0A2540]">Vos informations</h1>
                <p className="mt-1 text-sm text-[#8898AA]">Creez votre compte administrateur en quelques secondes.</p>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#425466]">Nom de l'agence / promoteur *</label>
                    <input value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Ex: Promotion El Feth"
                      className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none transition-all placeholder:text-[#8898AA] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#425466]">Prenom *</label>
                      <input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Ahmed"
                        className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none transition-all placeholder:text-[#8898AA] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#425466]">Nom *</label>
                      <input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Benali"
                        className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none transition-all placeholder:text-[#8898AA] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#425466]">Email *</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@monagence.dz"
                      className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none transition-all placeholder:text-[#8898AA] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#425466]">Mot de passe *</label>
                    <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Minimum 6 caracteres"
                      className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none transition-all placeholder:text-[#8898AA] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#425466]">Telephone</label>
                      <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0555 12 34 56"
                        className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none transition-all placeholder:text-[#8898AA] focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#425466]">Wilaya</label>
                      <select value={form.wilaya} onChange={e => set('wilaya', e.target.value)}
                        className="h-11 w-full rounded-xl border border-[#E3E8EF] bg-white px-3 text-sm text-[#0A2540] outline-none transition-all focus:border-[#0579DA] focus:ring-2 focus:ring-[#0579DA]/10">
                        <option value="">Selectionnez</option>
                        {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex gap-3">
                  <button onClick={() => setStep('plan')}
                    className="flex h-11 items-center gap-1.5 rounded-xl border border-[#E3E8EF] bg-white px-5 text-sm font-medium text-[#425466] transition-all hover:bg-[#F0F4F8]">
                    <ArrowLeft className="h-4 w-4" /> Retour
                  </button>
                  <button onClick={() => setStep('confirm')}
                    disabled={!form.companyName || !form.email || !form.password || !form.firstName || !form.lastName}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0579DA] text-sm font-bold text-white transition-all hover:bg-[#0460B8] hover:shadow-lg hover:shadow-[#0579DA]/20 disabled:opacity-50">
                    Continuer <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 'confirm' && (
              <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                <h1 className="text-xl font-bold text-[#0A2540]">Confirmation</h1>
                <p className="mt-1 text-sm text-[#8898AA]">Verifiez vos informations avant de creer votre compte.</p>

                <div className="mt-5 space-y-3">
                  <div className="rounded-xl border border-[#E3E8EF] bg-[#F6F9FC] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#8898AA]">PLAN CHOISI</span>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{backgroundColor: selectedPlan.color + '15', color: selectedPlan.color}}>{selectedPlan.label}</span>
                    </div>
                    <div className="text-2xl font-black text-[#0A2540]">{billing === 'yearly' ? selectedPlan.priceYearly : selectedPlan.priceMonthly} <span className="text-sm font-medium text-[#8898AA]">{selectedPlan.suffix ? (billing === 'yearly' ? 'DA/an' : 'DA/mois') : ''}</span></div>
                    {plan !== 'free' && <p className="mt-1 text-[11px] text-[#00D4A0] font-medium">14 jours d'essai gratuit inclus</p>}
                  </div>

                  <div className="rounded-xl border border-[#E3E8EF] p-4 space-y-2.5">
                    <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Agence</span><span className="font-semibold text-[#0A2540]">{form.companyName}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Admin</span><span className="font-semibold text-[#0A2540]">{form.firstName} {form.lastName}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Email</span><span className="font-semibold text-[#0A2540]">{form.email}</span></div>
                    {form.phone && <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Telephone</span><span className="font-semibold text-[#0A2540]">{form.phone}</span></div>}
                    {form.wilaya && <div className="flex justify-between text-sm"><span className="text-[#8898AA]">Wilaya</span><span className="font-semibold text-[#0A2540]">{form.wilaya}</span></div>}
                  </div>
                </div>

                <label className="mt-5 flex cursor-pointer items-start gap-2.5">
                  <button type="button" onClick={() => setTermsAccepted(!termsAccepted)}
                    className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-all ${termsAccepted ? 'border-[#0579DA] bg-[#0579DA]' : 'border-[#D0D5DD]'}`}>
                    {termsAccepted && <Check className="h-3 w-3 text-white" />}
                  </button>
                  <span className="text-[11px] leading-relaxed text-[#425466]">
                    J'accepte les <a href="/marketing/cgu.html" target="_blank" rel="noopener noreferrer" className="text-[#0579DA] hover:underline">CGU</a> et la <a href="/marketing/confidentialite.html" target="_blank" rel="noopener noreferrer" className="text-[#0579DA] hover:underline">politique de confidentialite</a> d'IMMO PRO-X.
                  </span>
                </label>

                <div className="mt-5 flex gap-3">
                  <button onClick={() => setStep('info')}
                    className="flex h-11 items-center gap-1.5 rounded-xl border border-[#E3E8EF] bg-white px-5 text-sm font-medium text-[#425466] transition-all hover:bg-[#F0F4F8]">
                    <ArrowLeft className="h-4 w-4" /> Retour
                  </button>
                  <button onClick={handleSubmit} disabled={loading || !termsAccepted}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0579DA] text-sm font-bold text-white transition-all hover:bg-[#0460B8] hover:shadow-lg hover:shadow-[#0579DA]/20 disabled:opacity-50">
                    {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <><Check className="h-4 w-4" /> Creer mon compte</>}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <p className="mt-4 text-center text-[13px] text-[#8898AA]">
            Deja inscrit ? <Link to="/login" className="font-medium text-[#0579DA] hover:underline">Se connecter</Link>
          </p>
          <p className="mt-2 text-center">
            <a href="/marketing/index.html" className="text-xs text-[#8898AA] hover:text-[#0579DA]">← Retour au site</a>
          </p>
          <div className="mt-2 flex justify-center gap-4 text-[10px] text-[#8898AA]">
            <a href="#" className="hover:text-[#425466]">CGU</a>
            <span>·</span>
            <a href="#" className="hover:text-[#425466]">Confidentialite</a>
            <span>·</span>
            <a href="#" className="hover:text-[#425466]">Contact</a>
          </div>
        </div>
      </div>
    </div>
  )
}
