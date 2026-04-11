import { useState } from 'react'

interface FormSectionProps {
  title?: string
  accent: string
  slug: string
  fields: string[]
  tenantName?: string
}

export function FormSection({ title, accent, slug, fields, tenantName }: FormSectionProps) {
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', budget: '', unit_type: '', message: '', website_url: '' })
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name || !form.phone) return

    setLoading(true)
    const eventId = crypto.randomUUID()

    try {
      const params = new URLSearchParams(window.location.search)
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          full_name: form.full_name,
          phone: form.phone,
          email: form.email || undefined,
          budget: form.budget || undefined,
          unit_type: form.unit_type || undefined,
          message: form.message || undefined,
          source_utm: params.get('utm_source') || params.get('source') || undefined,
          event_id: eventId,
          website_url: form.website_url,
          agent_slug: params.get('agent') || undefined,
        }),
      })

      if (!response.ok) throw new Error('Submit failed')

      // Fire pixel events
      const w = window as unknown as Record<string, (...args: unknown[]) => void>
      if (w.fbq) w.fbq('track', 'Lead', {}, { eventID: eventId })
      if (w.gtag) w.gtag('event', 'conversion', { event_id: eventId })

      setSubmitted(true)
    } catch {
      alert('Erreur, veuillez reessayer')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="py-16 px-4">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: accent + '15' }}>
            <svg className="h-8 w-8" style={{ color: accent }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-[#0A2540]">Merci {form.full_name} !</h2>
          <p className="mt-2 text-[#425466]">Votre demande a ete enregistree. Un conseiller vous contactera dans les plus brefs delais.</p>
        </div>
      </div>
    )
  }

  const inputStyle = { '--accent': accent } as React.CSSProperties
  const inputCls = "h-11 w-full rounded-lg border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none transition-colors focus:border-[color:var(--accent)]"

  return (
    <div className="py-12 px-4" id="landing-form">
      <div className="mx-auto max-w-lg">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-lg shadow-black/[0.03]">
          <h2 className="mb-6 text-center text-lg font-semibold text-[#0A2540]">{title ?? 'Demander des informations'}</h2>

          {/* Honeypot */}
          <input type="text" name="website_url" value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} className="hidden" tabIndex={-1} autoComplete="off" />

          <div className="space-y-4">
            {fields.includes('full_name') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Nom complet *</label>
                <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Votre nom" />
              </div>
            )}
            {fields.includes('phone') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Telephone *</label>
                <input required type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} style={inputStyle} placeholder="0555 123 456" />
              </div>
            )}
            {fields.includes('email') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} style={inputStyle} placeholder="email@exemple.com" />
              </div>
            )}
            {fields.includes('budget') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Budget (DA)</label>
                <input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} className={inputCls} style={inputStyle} placeholder="10 000 000" />
              </div>
            )}
            {fields.includes('unit_type') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Type de bien</label>
                <select value={form.unit_type} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))} className={inputCls}>
                  <option value="">Selectionnez</option>
                  <option value="apartment">Appartement</option>
                  <option value="villa">Villa</option>
                  <option value="local">Local commercial</option>
                  <option value="parking">Parking</option>
                </select>
              </div>
            )}
            {fields.includes('message') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Message</label>
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className="w-full resize-none rounded-lg border border-[#E3E8EF] bg-white p-4 text-sm text-[#0A2540] outline-none focus:border-[color:var(--accent)]" style={inputStyle} placeholder="Votre message..." />
              </div>
            )}
          </div>

          <button type="submit" disabled={loading || !form.full_name || !form.phone}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-lg text-sm font-bold text-white transition-all hover:shadow-lg disabled:opacity-50"
            style={{ backgroundColor: accent }}>
            {loading ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Envoyer ma demande'}
          </button>

          <p className="mt-4 text-center text-[10px] text-[#8898AA]">
            En soumettant ce formulaire, vous acceptez d'etre contacte par {tenantName ?? 'notre equipe'}.
          </p>
        </form>
      </div>
    </div>
  )
}
