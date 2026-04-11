import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MapPin, Phone, CheckCircle, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SectionRenderer } from './components/sections/SectionRenderer'
import type { SectionData } from './components/sections/SectionRenderer'
import { SEOHead } from './components/SEOHead'

interface PageData {
  id: string
  title: string
  description: string
  accent_color: string
  cover_image_url: string | null
  form_fields: string[]
  slug: string
  meta_pixel_id: string | null
  google_tag_id: string | null
  tiktok_pixel_id: string | null
  project: { name: string; location: string | null } | null
  tenant: { name: string; phone: string | null; email: string | null; logo_url: string | null } | null
}

export function PublicLandingPage() {
  const { slug } = useParams<{ slug: string }>()
  const [submitted, setSubmitted] = useState(false)

  // Fetch sections
  const { data: sections = [] } = useQuery({
    queryKey: ['public-landing-sections', slug],
    queryFn: async () => {
      // Get page ID first
      const { data: pg } = await supabase.from('landing_pages').select('id').eq('slug', slug!).eq('is_active', true).single()
      if (!pg) return []
      const pgId = (pg as unknown as { id: string }).id
      const { data } = await supabase.from('landing_page_sections').select('*').eq('page_id', pgId).order('sort_order')
      return (data ?? []) as SectionData[]
    },
    enabled: !!slug,
  })
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', budget: '', unit_type: '', message: '', website_url: '' })

  const { data: page, isLoading } = useQuery({
    queryKey: ['public-landing', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landing_pages')
        .select('*, projects(name, location), tenants(name, phone, email, logo_url)')
        .eq('slug', slug!)
        .eq('is_active', true)
        .single()
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any

      // Increment views
      supabase.from('landing_pages').update({ views_count: (d.views_count ?? 0) + 1 } as never).eq('id', d.id)

      return {
        id: d.id,
        title: d.title,
        description: d.description ?? '',
        accent_color: d.accent_color ?? '#0579DA',
        cover_image_url: d.cover_image_url,
        form_fields: d.form_fields ?? ['full_name', 'phone', 'email', 'budget', 'message'],
        slug: d.slug,
        meta_pixel_id: d.meta_pixel_id,
        google_tag_id: d.google_tag_id,
        tiktok_pixel_id: d.tiktok_pixel_id,
        project: d.projects ?? null,
        tenant: d.tenants ?? null,
      } as PageData
    },
    enabled: !!slug,
  })

  // Inject pixels
  useEffect(() => {
    if (!page) return

    // Meta Pixel
    if (page.meta_pixel_id) {
      const script = document.createElement('script')
      script.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${page.meta_pixel_id}');fbq('track','PageView');`
      document.head.appendChild(script)
      return () => { document.head.removeChild(script) }
    }
  }, [page?.meta_pixel_id])

  useEffect(() => {
    if (!page) return

    // Google Tag
    if (page.google_tag_id) {
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${page.google_tag_id}`
      document.head.appendChild(script)
      const script2 = document.createElement('script')
      script2.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${page.google_tag_id}');`
      document.head.appendChild(script2)
      return () => { document.head.removeChild(script); document.head.removeChild(script2) }
    }
  }, [page?.google_tag_id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name || !form.phone || !page) return

    setLoading(true)
    const eventId = crypto.randomUUID()

    try {
      // Get UTM source from URL
      const params = new URLSearchParams(window.location.search)
      const sourceUtm = params.get('utm_source') || params.get('source') || undefined

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capture-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: page.slug,
          full_name: form.full_name,
          phone: form.phone,
          email: form.email || undefined,
          budget: form.budget || undefined,
          unit_type: form.unit_type || undefined,
          message: form.message || undefined,
          source_utm: sourceUtm,
          event_id: eventId,
          website_url: form.website_url, // honeypot
          agent_slug: params.get('agent') || undefined,
        }),
      })

      if (!response.ok) throw new Error('Submit failed')

      // Fire pixel Lead events (browser-side)
      const w = window as unknown as Record<string, (...args: unknown[]) => void>
      if (page.meta_pixel_id && w.fbq) {
        w.fbq('track', 'Lead', {}, { eventID: eventId })
      }
      if (page.google_tag_id && w.gtag) {
        w.gtag('event', 'conversion', { send_to: page.google_tag_id, event_id: eventId })
      }

      setSubmitted(true)
    } catch {
      alert('Erreur, veuillez reessayer')
    } finally {
      setLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC]">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#0579DA] border-t-transparent" />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC]">
        <p className="text-lg text-[#425466]">Page introuvable</p>
      </div>
    )
  }

  const accent = page.accent_color || '#0579DA'

  // Thank you page
  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC] px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: accent + '15' }}>
            <CheckCircle className="h-8 w-8" style={{ color: accent }} />
          </div>
          <h1 className="text-2xl font-bold text-[#0A2540]">Merci {form.full_name} !</h1>
          <p className="mt-2 text-[#425466]">Votre demande a ete enregistree. Un conseiller vous contactera dans les plus brefs delais.</p>
          {page.tenant && (
            <div className="mt-6 text-sm text-[#8898AA]">
              <p>{page.tenant.name}</p>
              {page.tenant.phone && <p>{page.tenant.phone}</p>}
            </div>
          )}
        </div>
      </div>
    )
  }

  const fields = page.form_fields || ['full_name', 'phone', 'email', 'budget', 'message']

  // Find hero section background as OG image
  const heroSection = sections.find(s => s.type === 'hero')
  const ogImage = (heroSection?.content as Record<string, string>)?.background_image ?? page.cover_image_url ?? undefined

  return (
    <div className="min-h-screen bg-[#F6F9FC]">
      {/* SEO */}
      <SEOHead title={page.title} description={page.description} ogImage={ogImage} slug={page.slug} tenantName={page.tenant?.name ?? undefined} />

      {/* Hero */}
      <div className="relative overflow-hidden py-16 px-4" style={{ background: `linear-gradient(135deg, ${accent}15, ${accent}05)` }}>
        <div className="mx-auto max-w-2xl text-center">
          {page.tenant?.logo_url && (
            <img src={page.tenant.logo_url} alt={page.tenant.name} className="mx-auto mb-4 h-12 object-contain" />
          )}
          {!page.tenant?.logo_url && page.tenant && (
            <p className="mb-4 text-sm font-semibold text-[#8898AA]">{page.tenant.name}</p>
          )}
          <h1 className="text-3xl font-bold text-[#0A2540] sm:text-4xl">{page.title}</h1>
          {page.description && <p className="mt-3 text-lg text-[#425466]">{page.description}</p>}
          {page.project && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#E3E8EF] bg-white px-4 py-2 text-sm text-[#425466]">
              <Building2 className="h-4 w-4" style={{ color: accent }} />
              {page.project.name}
              {page.project.location && (
                <span className="flex items-center gap-1 text-[#8898AA]">
                  <MapPin className="h-3 w-3" /> {page.project.location}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dynamic sections */}
      {sections.length > 0 && (
        <SectionRenderer
          sections={sections}
          accent={accent}
          slug={page.slug}
          tenantName={page.tenant?.name ?? undefined}
          tenantPhone={page.tenant?.phone ?? undefined}
        />
      )}

      {/* Form (only if no form section exists in dynamic sections) */}
      {!sections.some(s => s.type === 'form') && (
      <div className="mx-auto -mt-4 max-w-lg px-4 pb-16">
        <form id="landing-form" onSubmit={handleSubmit} className="rounded-2xl border border-[#E3E8EF] bg-white p-8 shadow-lg shadow-black/[0.03]">
          <h2 className="mb-6 text-center text-lg font-semibold text-[#0A2540]">Demander des informations</h2>

          {/* Honeypot */}
          <input type="text" name="website_url" value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))} className="hidden" tabIndex={-1} autoComplete="off" />

          <div className="space-y-4">
            {fields.includes('full_name') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Nom complet *</label>
                <input required value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="h-11 w-full rounded-lg border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none transition-colors focus:border-[color:var(--accent)]" style={{ '--accent': accent } as React.CSSProperties} placeholder="Votre nom" />
              </div>
            )}
            {fields.includes('phone') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Telephone *</label>
                <input required type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-11 w-full rounded-lg border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none focus:border-[color:var(--accent)]" style={{ '--accent': accent } as React.CSSProperties} placeholder="0555 123 456" />
              </div>
            )}
            {fields.includes('email') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Email</label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-11 w-full rounded-lg border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none focus:border-[color:var(--accent)]" style={{ '--accent': accent } as React.CSSProperties} placeholder="email@exemple.com" />
              </div>
            )}
            {fields.includes('budget') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Budget (DA)</label>
                <input type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} className="h-11 w-full rounded-lg border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none focus:border-[color:var(--accent)]" style={{ '--accent': accent } as React.CSSProperties} placeholder="10 000 000" />
              </div>
            )}
            {fields.includes('unit_type') && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[#425466]">Type de bien souhaite</label>
                <select value={form.unit_type} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value }))} className="h-11 w-full rounded-lg border border-[#E3E8EF] bg-white px-4 text-sm text-[#0A2540] outline-none">
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
                <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} className="w-full resize-none rounded-lg border border-[#E3E8EF] bg-white p-4 text-sm text-[#0A2540] outline-none focus:border-[color:var(--accent)]" style={{ '--accent': accent } as React.CSSProperties} placeholder="Votre message..." />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !form.full_name || !form.phone}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-lg text-sm font-bold text-white transition-all hover:shadow-lg disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              'Envoyer ma demande'
            )}
          </button>

          <p className="mt-4 text-center text-[10px] text-[#8898AA]">
            En soumettant ce formulaire, vous acceptez d'etre contacte par {page.tenant?.name ?? 'notre equipe'}.
          </p>
        </form>

        {/* Footer */}
        {page.tenant && (
          <div className="mt-8 text-center text-xs text-[#8898AA]">
            <p className="font-medium">{page.tenant.name}</p>
            <div className="mt-1 flex items-center justify-center gap-4">
              {page.tenant.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {page.tenant.phone}</span>}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Footer (always visible) */}
      {page.tenant && !sections.some(s => s.type === 'form') && (
        <div className="pb-8" />
      )}
    </div>
  )
}

