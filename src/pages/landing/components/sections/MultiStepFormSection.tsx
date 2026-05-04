import { useState } from 'react'
import { ChevronRight, ChevronLeft, CheckCircle } from 'lucide-react'

interface MultiStepContent {
  steps?: Array<{
    title: string
    fields: Array<{
      id: string
      type: string
      label: string
      options?: string[]
      required?: boolean
      placeholder?: string
    }>
  }>
  submit_label?: string
  success_message?: string
}

interface MultiStepFormProps {
  title?: string
  accent: string
  slug: string
  content?: MultiStepContent
  tenantName?: string
}

export function MultiStepFormSection({ title, accent, slug, content }: MultiStepFormProps) {
  const steps = content?.steps ?? [
    { title: 'Type de bien', fields: [{ id: 'unit_type', type: 'select', label: 'Quel type de bien vous interesse ?', options: ['Appartement F2', 'Appartement F3', 'Appartement F4', 'Villa', 'Local commercial'], required: true }] },
    { title: 'Budget', fields: [{ id: 'budget', type: 'number', label: 'Votre budget (DA)', placeholder: '10 000 000', required: true }] },
    { title: 'Coordonnees', fields: [
      { id: 'full_name', type: 'text', label: 'Nom complet', placeholder: 'Votre nom', required: true },
      { id: 'phone', type: 'tel', label: 'Telephone', placeholder: '0555 123 456', required: true },
      { id: 'email', type: 'email', label: 'Email', placeholder: 'email@exemple.com' },
    ]},
  ]

  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const currentStep = steps[step]
  const isLast = step === steps.length - 1
  const isFirst = step === 0

  function canProceed() {
    return currentStep.fields.filter(f => f.required).every(f => (values[f.id] ?? '').trim() !== '')
  }

  async function handleSubmit() {
    if (!canProceed()) return
    if (!isLast) { setStep(step + 1); return }

    setLoading(true)
    try {
      const params = new URLSearchParams(window.location.search)
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          full_name: values.full_name || 'Sans nom',
          phone: values.phone || '0000000000',
          email: values.email,
          budget: values.budget,
          unit_type: values.unit_type,
          message: Object.entries(values).filter(([k]) => !['full_name', 'phone', 'email', 'budget', 'unit_type'].includes(k)).map(([k, v]) => `${k}: ${v}`).join('\n') || undefined,
          source_utm: params.get('utm_source') || undefined,
          event_id: crypto.randomUUID(),
          agent_slug: params.get('agent') || undefined,
        }),
      })
      setSubmitted(true)
    } catch { alert('Erreur') } finally { setLoading(false) }
  }

  if (submitted) {
    return (
      <div className="py-16 px-4" id="landing-form">
        <div className="mx-auto max-w-md text-center">
          <CheckCircle className="mx-auto mb-4 h-16 w-16" style={{ color: accent }} />
          <h2 className="text-2xl font-bold text-[#0A2540]">{content?.success_message ?? 'Merci !'}</h2>
          <p className="mt-2 text-[#425466]">Un conseiller vous contactera dans les plus brefs delais.</p>
        </div>
      </div>
    )
  }

  const inputCls = "h-12 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none focus:border-[color:var(--accent)] transition-all"

  return (
    <div className="py-12 px-4" id="landing-form">
      <div className="mx-auto max-w-lg">
        {title && <h2 className="mb-2 text-center text-lg font-semibold text-[#0A2540]">{title}</h2>}

        {/* Progress bar */}
        <div className="mb-6 flex items-center gap-2">
          {steps.map((_, i) => (
            <div key={i} className="flex flex-1 items-center gap-2">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                i < step ? 'bg-[#00D4A0] text-white' : i === step ? 'text-white' : 'bg-[#F0F4F8] text-[#8898AA]'
              }`} style={i === step ? { backgroundColor: accent } : undefined}>
                {i < step ? '✓' : i + 1}
              </div>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? 'bg-[#00D4A0]' : 'bg-[#E3E8EF]'}`} />}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-sm">
          <h3 className="mb-6 text-center text-base font-semibold text-[#0A2540]">{currentStep.title}</h3>

          <div className="space-y-4">
            {currentStep.fields.map(field => (
              <div key={field.id}>
                <label className="mb-1.5 block text-xs font-medium text-[#425466]">
                  {field.label} {field.required && <span className="text-[#CD3D64]">*</span>}
                </label>
                {field.type === 'select' && field.options ? (
                  <div className="grid grid-cols-1 gap-2">
                    {field.options.map(opt => (
                      <button key={opt} type="button" onClick={() => setValues({ ...values, [field.id]: opt })}
                        className={`rounded-xl border px-4 py-3 text-start text-sm transition-all ${
                          values[field.id] === opt
                            ? 'border-2 font-medium' : 'border-[#E3E8EF] text-[#425466] hover:border-[#C1C9D2]'
                        }`}
                        style={values[field.id] === opt ? { borderColor: accent, color: accent, background: `${accent}08` } : undefined}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : (
                  <input
                    type={field.type}
                    value={values[field.id] ?? ''}
                    onChange={e => setValues({ ...values, [field.id]: e.target.value })}
                    placeholder={field.placeholder}
                    required={field.required}
                    className={inputCls}
                    style={{ '--accent': accent } as React.CSSProperties}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="mt-6 flex gap-3">
            {!isFirst && (
              <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 rounded-xl border border-[#E3E8EF] px-4 py-3 text-sm text-[#425466] hover:bg-[#F6F9FC]">
                <ChevronLeft className="h-4 w-4" /> Retour
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white transition-all hover:shadow-lg disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> :
                isLast ? (content?.submit_label ?? 'Envoyer') : <>Suivant <ChevronRight className="h-4 w-4" /></>
              }
            </button>
          </div>

          <p className="mt-4 text-center text-[10px] text-[#8898AA]">Etape {step + 1} sur {steps.length}</p>
        </div>
      </div>
    </div>
  )
}
