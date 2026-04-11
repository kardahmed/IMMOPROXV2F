import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { useAuthStore } from '@/store/authStore'
import { useProjects } from '@/hooks/useProjects'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import toast from 'react-hot-toast'

const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary'
const labelClass = 'text-[11px] font-medium text-immo-text-muted'

interface LandingPageEditorProps {
  isOpen: boolean
  onClose: () => void
  editPage: Record<string, unknown> | null
}

export function LandingPageEditor({ isOpen, onClose, editPage }: LandingPageEditorProps) {
  const isEdit = !!editPage
  const tenantId = useAuthStore(s => s.tenantId)
  const { projects } = useProjects()
  const qc = useQueryClient()

  // Agents
  const { data: agents = [] } = useQuery({
    queryKey: ['landing-agents', tenantId],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('id, first_name, last_name').eq('tenant_id', tenantId!).in('role', ['agent', 'admin']).eq('status', 'active')
      return (data ?? []) as Array<{ id: string; first_name: string; last_name: string }>
    },
    enabled: !!tenantId && isOpen,
  })

  // Form state
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [accentColor, setAccentColor] = useState('#0579DA')
  const [agentId, setAgentId] = useState('')
  const [distribution, setDistribution] = useState('fixed')
  const [source, setSource] = useState('facebook_ads')
  // Tracking
  const [metaPixelId, setMetaPixelId] = useState('')
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [metaTestCode, setMetaTestCode] = useState('')
  const [googleTagId, setGoogleTagId] = useState('')
  const [googleApiSecret, setGoogleApiSecret] = useState('')
  const [googleMeasurementId, setGoogleMeasurementId] = useState('')
  const [tiktokPixelId, setTiktokPixelId] = useState('')
  const [tiktokAccessToken, setTiktokAccessToken] = useState('')

  // Pre-fill on edit
  useEffect(() => {
    if (editPage) {
      setTitle(editPage.title as string || '')
      setSlug(editPage.slug as string || '')
      setDescription(editPage.description as string || '')
      setProjectId(editPage.project_id as string || '')
      setAccentColor(editPage.accent_color as string || '#0579DA')
      setAgentId(editPage.default_agent_id as string || '')
      setDistribution(editPage.distribution_mode as string || 'fixed')
      setSource(editPage.default_source as string || 'facebook_ads')
      setMetaPixelId(editPage.meta_pixel_id as string || '')
      setMetaAccessToken(editPage.meta_access_token as string || '')
      setMetaTestCode(editPage.meta_test_event_code as string || '')
      setGoogleTagId(editPage.google_tag_id as string || '')
      setGoogleApiSecret(editPage.google_api_secret as string || '')
      setGoogleMeasurementId(editPage.google_measurement_id as string || '')
      setTiktokPixelId(editPage.tiktok_pixel_id as string || '')
      setTiktokAccessToken(editPage.tiktok_access_token as string || '')
    } else {
      setTitle(''); setSlug(''); setDescription(''); setProjectId(''); setAccentColor('#0579DA')
      setAgentId(''); setDistribution('fixed'); setSource('facebook_ads')
      setMetaPixelId(''); setMetaAccessToken(''); setMetaTestCode('')
      setGoogleTagId(''); setGoogleApiSecret(''); setGoogleMeasurementId('')
      setTiktokPixelId(''); setTiktokAccessToken('')
    }
  }, [editPage, isOpen])

  // Auto-generate slug from title
  useEffect(() => {
    if (!isEdit && title) {
      setSlug(title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }, [title, isEdit])

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        tenant_id: tenantId,
        title, slug, description,
        project_id: projectId || null,
        accent_color: accentColor,
        default_agent_id: agentId || null,
        distribution_mode: distribution,
        default_source: source,
        meta_pixel_id: metaPixelId || null,
        meta_access_token: metaAccessToken || null,
        meta_test_event_code: metaTestCode || null,
        google_tag_id: googleTagId || null,
        google_api_secret: googleApiSecret || null,
        google_measurement_id: googleMeasurementId || null,
        tiktok_pixel_id: tiktokPixelId || null,
        tiktok_access_token: tiktokAccessToken || null,
      }

      if (isEdit) {
        const { error } = await supabase.from('landing_pages').update(payload as never).eq('id', editPage!.id as string)
        if (error) { handleSupabaseError(error); throw error }
      } else {
        const { error } = await supabase.from('landing_pages').insert(payload as never)
        if (error) { handleSupabaseError(error); throw error }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['landing-pages'] })
      toast.success(isEdit ? 'Page mise a jour' : 'Page creee')
      onClose()
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Modifier la page' : 'Nouvelle page de capture'} size="xl">
      <div className="max-h-[70vh] overflow-y-auto space-y-5 pr-2">
        {/* Section: Contenu */}
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-immo-accent-green">Contenu</h4>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={labelClass}>Titre *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Decouvrez Residence El Feth" className={inputClass} /></div>
            <div><Label className={labelClass}>Slug (URL) *</Label><Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="residence-el-feth" className={inputClass} /></div>
            <div className="col-span-2"><Label className={labelClass}>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Texte d'accroche..." className={inputClass} /></div>
            <div>
              <Label className={labelClass}>Projet lie</Label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
                <option value="">Aucun (page generale)</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><Label className={labelClass}>Couleur accent</Label><Input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="h-9 w-full" /></div>
          </div>
        </section>

        <Separator className="bg-immo-border-default" />

        {/* Section: Distribution */}
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-immo-accent-green">Distribution des leads</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className={labelClass}>Mode</Label>
              <select value={distribution} onChange={e => setDistribution(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
                <option value="fixed">Agent fixe</option>
                <option value="round_robin">Round-robin (tour de role)</option>
                <option value="per_agent">Lien par agent</option>
              </select>
            </div>
            {distribution === 'fixed' && (
              <div>
                <Label className={labelClass}>Agent assigne</Label>
                <select value={agentId} onChange={e => setAgentId(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
                  <option value="">Non assigne</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <Label className={labelClass}>Source par defaut</Label>
              <select value={source} onChange={e => setSource(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
                <option value="facebook_ads">Facebook Ads</option>
                <option value="google_ads">Google Ads</option>
                <option value="instagram_ads">Instagram Ads</option>
                <option value="tiktok_ads">TikTok Ads</option>
                <option value="site_web">Site web</option>
                <option value="landing_page">Landing page</option>
              </select>
            </div>
          </div>
        </section>

        <Separator className="bg-immo-border-default" />

        {/* Section: Tracking */}
        <section>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-immo-accent-green">Tracking & Conversions</h4>
          <p className="mb-3 text-[11px] text-immo-text-muted">Les pixels s'affichent sur la page. Les tokens API envoient les conversions cote serveur (CAPI).</p>

          {/* Facebook */}
          <p className="mb-2 mt-3 text-xs font-medium text-immo-text-secondary">Meta (Facebook / Instagram)</p>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className={labelClass}>Pixel ID</Label><Input value={metaPixelId} onChange={e => setMetaPixelId(e.target.value)} placeholder="1234567890" className={inputClass} /></div>
            <div><Label className={labelClass}>Access Token (CAPI)</Label><Input value={metaAccessToken} onChange={e => setMetaAccessToken(e.target.value)} placeholder="EAAx..." className={inputClass} /></div>
            <div><Label className={labelClass}>Test Event Code</Label><Input value={metaTestCode} onChange={e => setMetaTestCode(e.target.value)} placeholder="TEST12345" className={inputClass} /></div>
          </div>

          {/* Google */}
          <p className="mb-2 mt-4 text-xs font-medium text-immo-text-secondary">Google (Ads / Analytics)</p>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className={labelClass}>Tag ID (gtag)</Label><Input value={googleTagId} onChange={e => setGoogleTagId(e.target.value)} placeholder="AW-1234567890" className={inputClass} /></div>
            <div><Label className={labelClass}>Measurement ID</Label><Input value={googleMeasurementId} onChange={e => setGoogleMeasurementId(e.target.value)} placeholder="G-XXXXXXXXXX" className={inputClass} /></div>
            <div><Label className={labelClass}>API Secret</Label><Input value={googleApiSecret} onChange={e => setGoogleApiSecret(e.target.value)} placeholder="xxxx" className={inputClass} /></div>
          </div>

          {/* TikTok */}
          <p className="mb-2 mt-4 text-xs font-medium text-immo-text-secondary">TikTok</p>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className={labelClass}>Pixel ID</Label><Input value={tiktokPixelId} onChange={e => setTiktokPixelId(e.target.value)} placeholder="C1234567890" className={inputClass} /></div>
            <div><Label className={labelClass}>Access Token</Label><Input value={tiktokAccessToken} onChange={e => setTiktokAccessToken(e.target.value)} placeholder="xxxx" className={inputClass} /></div>
          </div>
        </section>
      </div>

      {/* Actions */}
      <div className="mt-5 flex justify-end gap-3 border-t border-immo-border-default pt-4">
        <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary">Annuler</Button>
        <Button onClick={() => save.mutate()} disabled={!title || !slug || save.isPending} className="bg-immo-accent-green font-semibold text-white hover:bg-immo-accent-green/90">
          {save.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : isEdit ? 'Enregistrer' : 'Creer la page'}
        </Button>
      </div>
    </Modal>
  )
}
