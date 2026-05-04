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
import { Plus, Trash2, GripVertical } from 'lucide-react'
import toast from 'react-hot-toast'
import { SectionEditor } from './components/SectionEditor'

interface CustomQuestion {
  id: string
  label: string
  type: 'text' | 'select' | 'textarea' | 'number' | 'date' | 'checkbox'
  options?: string[]
  required?: boolean
  placeholder?: string
}

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
  // Custom questions
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([])
  // Multi-lang + A/B
  const [language, setLanguage] = useState('fr')
  const [variant, setVariant] = useState('A')
  const [abTestGroup, setAbTestGroup] = useState('')

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
      setCustomQuestions((editPage.custom_questions as CustomQuestion[]) ?? [])
      setLanguage(editPage.language as string || 'fr')
      setVariant(editPage.variant as string || 'A')
      setAbTestGroup(editPage.ab_test_group as string || '')
    } else {
      setTitle(''); setSlug(''); setDescription(''); setProjectId(''); setAccentColor('#0579DA')
      setAgentId(''); setDistribution('fixed'); setSource('facebook_ads')
      setMetaPixelId(''); setMetaAccessToken(''); setMetaTestCode('')
      setGoogleTagId(''); setGoogleApiSecret(''); setGoogleMeasurementId('')
      setTiktokPixelId(''); setTiktokAccessToken('')
      setCustomQuestions([])
      setLanguage('fr'); setVariant('A'); setAbTestGroup('')
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
        custom_questions: customQuestions.length > 0 ? customQuestions : [],
        language,
        variant,
        ab_test_group: abTestGroup || null,
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
      <div className="max-h-[70vh] overflow-y-auto space-y-5 pe-2">
        {/* Section: Contenu */}
        <div>
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
        </div>

        {/* Section: Sections dynamiques (edit mode only) */}
        {isEdit && editPage && (editPage as Record<string, string>).id && (
          <>
            <Separator className="bg-immo-border-default" />
            <SectionEditor pageId={String(editPage!.id)} />
          </>
        )}

        <Separator className="bg-immo-border-default" />

        {/* Section: Custom Questions */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-immo-accent-green">Questions personnalisees</h4>
            <Button onClick={() => setCustomQuestions(prev => [...prev, { id: `q${Date.now()}`, label: '', type: 'text', required: false }])} size="sm" className="h-7 bg-immo-accent-green text-[10px] text-white">
              <Plus className="me-1 h-3 w-3" /> Ajouter
            </Button>
          </div>
          <p className="mb-3 text-[10px] text-immo-text-muted">Ces questions s'affichent apres les champs standard du formulaire (nom, telephone, email, budget).</p>

          {customQuestions.length === 0 && (
            <div className="rounded-lg border border-dashed border-immo-border-default bg-immo-bg-primary p-4 text-center text-xs text-immo-text-muted">
              Aucune question supplementaire. Cliquez "Ajouter" pour creer une question.
            </div>
          )}

          <div className="space-y-2">
            {customQuestions.map((q, idx) => (
              <div key={q.id} className="flex gap-2 rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
                <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-immo-text-muted" />
                <div className="flex-1 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Input value={q.label} onChange={e => {
                        const next = [...customQuestions]; next[idx] = { ...next[idx], label: e.target.value }; setCustomQuestions(next)
                      }} placeholder="Libelle de la question" className="h-8 text-xs border-immo-border-default bg-immo-bg-card" />
                    </div>
                    <select value={q.type} onChange={e => {
                      const next = [...customQuestions]; next[idx] = { ...next[idx], type: e.target.value as CustomQuestion['type'] }; setCustomQuestions(next)
                    }} className="h-8 rounded-md border border-immo-border-default bg-immo-bg-card px-2 text-xs text-immo-text-primary">
                      <option value="text">Texte</option>
                      <option value="select">Liste deroulante</option>
                      <option value="textarea">Zone de texte</option>
                      <option value="number">Nombre</option>
                      <option value="date">Date</option>
                      <option value="checkbox">Case a cocher</option>
                    </select>
                  </div>

                  {q.type === 'select' && (
                    <div>
                      <Input value={(q.options ?? []).join(', ')} onChange={e => {
                        const next = [...customQuestions]; next[idx] = { ...next[idx], options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }; setCustomQuestions(next)
                      }} placeholder="Options separees par virgule (ex: Oui, Non, Peut-etre)" className="h-8 text-xs border-immo-border-default bg-immo-bg-card" />
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[10px] text-immo-text-muted">
                      <input type="checkbox" checked={q.required ?? false} onChange={e => {
                        const next = [...customQuestions]; next[idx] = { ...next[idx], required: e.target.checked }; setCustomQuestions(next)
                      }} className="h-3 w-3 rounded" />
                      Obligatoire
                    </label>
                    <Input value={q.placeholder ?? ''} onChange={e => {
                      const next = [...customQuestions]; next[idx] = { ...next[idx], placeholder: e.target.value }; setCustomQuestions(next)
                    }} placeholder="Placeholder (optionnel)" className="h-7 flex-1 text-[10px] border-immo-border-default bg-immo-bg-card" />
                  </div>
                </div>

                <button onClick={() => setCustomQuestions(prev => prev.filter((_, i) => i !== idx))}
                  className="mt-1 shrink-0 rounded p-1 text-immo-text-muted hover:bg-immo-status-red/10 hover:text-immo-status-red">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <Separator className="bg-immo-border-default" />

        {/* Section: Distribution */}
        <div>
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
        </div>

        <Separator className="bg-immo-border-default" />

        {/* Section: Tracking */}
        <div>
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
        </div>
        <Separator className="bg-immo-border-default" />

        {/* Section: Langue + A/B Testing */}
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-immo-accent-green">Langue & A/B Testing</h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className={labelClass}>Langue</Label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
                <option value="fr">Francais</option>
                <option value="ar">Arabe</option>
                <option value="en">Anglais</option>
              </select>
            </div>
            <div>
              <Label className={labelClass}>Variante</Label>
              <select value={variant} onChange={e => setVariant(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputClass}`}>
                <option value="A">Variante A</option>
                <option value="B">Variante B</option>
                <option value="C">Variante C</option>
              </select>
            </div>
            <div>
              <Label className={labelClass}>Groupe A/B Test</Label>
              <Input value={abTestGroup} onChange={e => setAbTestGroup(e.target.value)} placeholder="test-hero-2024" className={inputClass} />
            </div>
          </div>
          <p className="mt-2 text-[10px] text-immo-text-muted">Pour l'A/B testing : creez 2 pages avec le meme slug de base (ex: el-feth-a, el-feth-b) et le meme groupe. Les stats permettront de comparer les taux de conversion.</p>
        </div>
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
