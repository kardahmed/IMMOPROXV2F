import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, GripVertical, Eye, EyeOff, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'
import { ImageUploader } from './ImageUploader'

const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary text-sm'
const labelClass = 'text-[11px] font-medium text-immo-text-muted'

const SECTION_TYPES = [
  { type: 'hero', label: 'Hero (image/video de fond)', icon: '🖼️' },
  { type: 'gallery', label: 'Galerie photos', icon: '📸' },
  { type: 'features', label: 'Equipements / Caracteristiques', icon: '✅' },
  { type: 'video', label: 'Video YouTube/Vimeo', icon: '🎬' },
  { type: 'virtual_tour', label: 'Visite virtuelle 360', icon: '🏠' },
  { type: 'pricing', label: 'Grille de prix', icon: '💰' },
  { type: 'stats', label: 'Compteur stats anime', icon: '📊' },
  { type: 'comparator', label: 'Comparateur de biens', icon: '⚖️' },
  { type: 'calculator', label: 'Calculateur de credit', icon: '🧮' },
  { type: 'countdown', label: 'Compte a rebours', icon: '⏱️' },
  { type: 'testimonials', label: 'Avis clients', icon: '⭐' },
  { type: 'faq', label: 'FAQ', icon: '❓' },
  { type: 'cta', label: 'Appel a l\'action', icon: '🚀' },
  { type: 'form', label: 'Formulaire classique', icon: '📝' },
  { type: 'multi_step_form', label: 'Formulaire multi-etapes', icon: '📋' },
  { type: 'whatsapp', label: 'Widget WhatsApp flottant', icon: '💬' },
  { type: 'social_proof', label: 'Notifications social proof', icon: '🔔' },
]

interface Section {
  id: string
  type: string
  sort_order: number
  title: string | null
  content: Record<string, unknown>
  is_visible: boolean
}

export function SectionEditor({ pageId }: { pageId: string }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const { data: sections = [] } = useQuery({
    queryKey: ['landing-sections', pageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('landing_page_sections')
        .select('*')
        .eq('page_id', pageId)
        .order('sort_order')
      if (error) { handleSupabaseError(error); throw error }
      return data as Section[]
    },
  })

  const addSection = useMutation({
    mutationFn: async (type: string) => {
      const { error } = await supabase.from('landing_page_sections').insert({
        page_id: pageId,
        type,
        sort_order: sections.length,
        title: SECTION_TYPES.find(t => t.type === type)?.label ?? type,
        content: getDefaultContent(type),
      } as never)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-sections'] }); setShowAdd(false); toast.success('Section ajoutee') },
  })

  const updateSection = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Section> & { id: string }) => {
      const { error } = await supabase.from('landing_page_sections').update(data as never).eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landing-sections'] }),
  })

  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('landing_page_sections').delete().eq('id', id)
      if (error) { handleSupabaseError(error); throw error }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['landing-sections'] }); toast.success('Section supprimee') },
  })

  function moveSection(id: string, dir: -1 | 1) {
    const idx = sections.findIndex(s => s.id === id)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= sections.length) return

    const updates = sections.map((s, i) => {
      if (i === idx) return { id: s.id, sort_order: newIdx }
      if (i === newIdx) return { id: s.id, sort_order: idx }
      return null
    }).filter(Boolean) as Array<{ id: string; sort_order: number }>

    updates.forEach(u => updateSection.mutate(u))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-immo-accent-green">Sections de la page</h4>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="bg-immo-accent-green text-xs text-white hover:bg-immo-accent-green/90">
          <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
        </Button>
      </div>

      {/* Add section picker */}
      {showAdd && (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
          {SECTION_TYPES.map(st => (
            <button key={st.type} onClick={() => addSection.mutate(st.type)}
              className="flex items-center gap-2 rounded-lg border border-immo-border-default bg-immo-bg-card px-3 py-2 text-left text-xs text-immo-text-primary hover:border-immo-accent-green/30 hover:bg-immo-accent-green/5">
              <span>{st.icon}</span> {st.label}
            </button>
          ))}
        </div>
      )}

      {/* Sections list */}
      {sections.length === 0 ? (
        <p className="py-6 text-center text-xs text-immo-text-muted">Aucune section. Ajoutez des sections pour enrichir votre page.</p>
      ) : (
        sections.map(section => {
          const meta = SECTION_TYPES.find(t => t.type === section.type)
          const isExpanded = expanded === section.id
          return (
            <div key={section.id} className="rounded-lg border border-immo-border-default bg-immo-bg-card">
              {/* Section header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <GripVertical className="h-4 w-4 text-immo-text-muted cursor-grab" />
                <span className="text-sm">{meta?.icon}</span>
                <span className="flex-1 text-xs font-medium text-immo-text-primary">{section.title ?? meta?.label}</span>
                <button onClick={() => moveSection(section.id, -1)} className="p-1 text-immo-text-muted hover:text-immo-text-primary"><ChevronUp className="h-3.5 w-3.5" /></button>
                <button onClick={() => moveSection(section.id, 1)} className="p-1 text-immo-text-muted hover:text-immo-text-primary"><ChevronDown className="h-3.5 w-3.5" /></button>
                <button onClick={() => updateSection.mutate({ id: section.id, is_visible: !section.is_visible })} className="p-1 text-immo-text-muted hover:text-immo-text-primary">
                  {section.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-immo-status-red" />}
                </button>
                <button onClick={() => setExpanded(isExpanded ? null : section.id)} className="rounded-md bg-immo-bg-card-hover px-2 py-0.5 text-[10px] text-immo-text-muted">{isExpanded ? 'Fermer' : 'Editer'}</button>
                <button onClick={() => deleteSection.mutate(section.id)} className="p-1 text-immo-text-muted hover:text-immo-status-red"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>

              {/* Section editor */}
              {isExpanded && (
                <div className="border-t border-immo-border-default p-3 space-y-3">
                  <div><Label className={labelClass}>Titre de section</Label><Input value={section.title ?? ''} onChange={e => updateSection.mutate({ id: section.id, title: e.target.value })} className={inputClass} /></div>
                  <ContentEditor type={section.type} content={section.content} onUpdate={(content) => updateSection.mutate({ id: section.id, content })} />
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// Content editor per section type
function ContentEditor({ type, content, onUpdate }: { type: string; content: Record<string, unknown>; onUpdate: (c: Record<string, unknown>) => void }) {
  function set(key: string, value: unknown) { onUpdate({ ...content, [key]: value }) }

  switch (type) {
    case 'hero':
      return (
        <div className="space-y-3">
          <div><Label className="text-[10px] text-immo-text-muted">Sous-titre</Label><Input value={(content.subtitle as string) ?? ''} onChange={e => set('subtitle', e.target.value)} className={inputClass} /></div>
          <ImageUploader label="Image de fond" value={(content.background_image as string) ?? ''} onChange={url => set('background_image', url)} />
          <p className="text-[9px] text-immo-text-muted">Ou coller une URL :</p>
          <Input value={(content.background_image as string) ?? ''} onChange={e => set('background_image', e.target.value)} placeholder="https://..." className={inputClass} />
          <ImageUploader label="Video de fond (mp4)" value={(content.background_video as string) ?? ''} onChange={url => set('background_video', url)} />
          <Input value={(content.background_video as string) ?? ''} onChange={e => set('background_video', e.target.value)} placeholder="https://...mp4" className={inputClass} />
        </div>
      )

    case 'gallery': {
      const images = (content.images as Array<{url:string; caption?:string}>) ?? []
      return (
        <div className="space-y-3">
          {/* Current images */}
          {images.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {images.map((img, i) => (
                <div key={i} className="group relative">
                  <img src={img.url} alt="" className="h-16 w-full rounded-lg object-cover" />
                  <button onClick={() => set('images', images.filter((_, j) => j !== i))}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-immo-status-red text-white group-hover:flex">
                    <span className="text-[9px]">×</span>
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Upload */}
          <ImageUploader
            label="Uploader des images"
            multiple
            onMultiple={urls => set('images', [...images, ...urls.map(url => ({ url }))])}
            onChange={() => {}}
          />
          <p className="text-[9px] text-immo-text-muted">Ou coller des URLs (une par ligne) :</p>
          <textarea
            value={images.map(i => i.url).join('\n')}
            onChange={e => set('images', e.target.value.split('\n').filter(u => u.trim()).map(url => ({ url: url.trim() })))}
            rows={3} placeholder="https://image1.jpg&#10;https://image2.jpg" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
        </div>
      )
    }

    case 'video':
      return (
        <div className="space-y-2">
          <div><Label className="text-[10px] text-immo-text-muted">URL YouTube ou Vimeo</Label><Input value={(content.url as string) ?? ''} onChange={e => set('url', e.target.value)} placeholder="https://youtube.com/watch?v=..." className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Legende</Label><Input value={(content.caption as string) ?? ''} onChange={e => set('caption', e.target.value)} className={inputClass} /></div>
        </div>
      )

    case 'virtual_tour':
      return (
        <div className="space-y-2">
          <div><Label className="text-[10px] text-immo-text-muted">Lien de visite virtuelle (Matterport, Kuula, etc.)</Label><Input value={(content.embed_url as string) ?? ''} onChange={e => set('embed_url', e.target.value)} placeholder="https://my.matterport.com/show/?m=..." className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Legende</Label><Input value={(content.caption as string) ?? ''} onChange={e => set('caption', e.target.value)} className={inputClass} /></div>
          <p className="text-[10px] text-immo-text-muted">Supporte : Matterport, Kuula, 3DVista, Cupix, ou tout service avec un lien embed.</p>
        </div>
      )

    case 'features':
      return <FeaturesEditor content={content} onUpdate={onUpdate} />

    case 'pricing':
      return (
        <div className="space-y-2">
          <Label className="text-[10px] text-immo-text-muted">Types de biens (un par ligne : type | surface | prix | badge)</Label>
          <textarea
            value={((content.items as Array<{type:string; surface?:string; price:number; badge?:string}>) ?? []).map(i => `${i.type} | ${i.surface ?? ''} | ${i.price} | ${i.badge ?? ''}`).join('\n')}
            onChange={e => set('items', e.target.value.split('\n').filter(l => l.trim()).map(line => {
              const [type, surface, price, badge] = line.split('|').map(s => s.trim())
              return { type, surface: surface || undefined, price: Number(price) || 0, badge: badge || undefined }
            }))}
            rows={4} placeholder="F3 | 85 m² | 8500000 | Populaire&#10;F4 | 110 m² | 11000000 |" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
        </div>
      )

    case 'testimonials':
      return (
        <div className="space-y-2">
          <Label className="text-[10px] text-immo-text-muted">Avis (un par ligne : nom | texte | role)</Label>
          <textarea
            value={((content.items as Array<{name:string; text:string; role?:string}>) ?? []).map(i => `${i.name} | ${i.text} | ${i.role ?? ''}`).join('\n')}
            onChange={e => set('items', e.target.value.split('\n').filter(l => l.trim()).map(line => {
              const [name, text, role] = line.split('|').map(s => s.trim())
              return { name, text, role: role || undefined }
            }))}
            rows={4} placeholder="Mohammed A. | Excellent service, livraison dans les delais | Acheteur F3" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
        </div>
      )

    case 'faq':
      return (
        <div className="space-y-2">
          <Label className="text-[10px] text-immo-text-muted">Questions / Reponses (Q: ... puis R: ...)</Label>
          <textarea
            value={((content.items as Array<{question:string; answer:string}>) ?? []).map(i => `Q: ${i.question}\nR: ${i.answer}`).join('\n\n')}
            onChange={e => {
              const blocks = e.target.value.split('\n\n').filter(b => b.trim())
              set('items', blocks.map(block => {
                const lines = block.split('\n')
                const q = lines.find(l => l.startsWith('Q:'))?.replace('Q:', '').trim() ?? ''
                const a = lines.find(l => l.startsWith('R:'))?.replace('R:', '').trim() ?? ''
                return { question: q, answer: a }
              }).filter(i => i.question))
            }}
            rows={6} placeholder="Q: Quel est le prix du F3 ?&#10;R: A partir de 8 500 000 DA&#10;&#10;Q: Quand est la livraison ?&#10;R: Prevue pour juin 2026" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
        </div>
      )

    case 'cta':
      return (
        <div className="space-y-2">
          <div><Label className="text-[10px] text-immo-text-muted">Texte</Label><Input value={(content.text as string) ?? ''} onChange={e => set('text', e.target.value)} placeholder="Ne ratez pas cette opportunite..." className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Label du bouton</Label><Input value={(content.button_label as string) ?? ''} onChange={e => set('button_label', e.target.value)} placeholder="Contactez-nous" className={inputClass} /></div>
        </div>
      )

    case 'form':
      return <FormFieldsEditor content={content} onUpdate={onUpdate} />

    case 'multi_step_form':
      return (
        <div className="space-y-2">
          <p className="text-[10px] text-immo-text-muted">Le formulaire multi-etapes utilise un format progressif (type → budget → coordonnees). Configuration par defaut optimisee pour la conversion.</p>
          <div><Label className="text-[10px] text-immo-text-muted">Texte du bouton final</Label><Input value={(content.submit_label as string) ?? ''} onChange={e => set('submit_label', e.target.value)} placeholder="Envoyer" className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Message de succes</Label><Input value={(content.success_message as string) ?? ''} onChange={e => set('success_message', e.target.value)} placeholder="Merci !" className={inputClass} /></div>
        </div>
      )

    case 'countdown':
      return (
        <div className="space-y-2">
          <div><Label className="text-[10px] text-immo-text-muted">Date de fin</Label><Input type="datetime-local" value={(content.end_date as string) ?? ''} onChange={e => set('end_date', e.target.value)} className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Texte d'accroche</Label><Input value={(content.label as string) ?? ''} onChange={e => set('label', e.target.value)} placeholder="Offre de lancement limitee" className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Unites restantes (optionnel)</Label><Input type="number" value={String((content.units_left as number) ?? '')} onChange={e => set('units_left', Number(e.target.value) || null)} placeholder="12" className={inputClass} /></div>
        </div>
      )

    case 'stats':
      return (
        <div className="space-y-2">
          <Label className="text-[10px] text-immo-text-muted">Statistiques (une par ligne : valeur | suffixe | label)</Label>
          <textarea
            value={((content.items as Array<{value:number;suffix?:string;label:string}>) ?? []).map(i => `${i.value} | ${i.suffix ?? ''} | ${i.label}`).join('\n')}
            onChange={e => set('items', e.target.value.split('\n').filter(l => l.trim()).map(line => {
              const [v, s, l] = line.split('|').map(x => x.trim())
              return { value: Number(v) || 0, suffix: s || undefined, label: l || '' }
            }))}
            rows={4} placeholder="150 | | Unites vendues&#10;42 | | Familles logees&#10;98 | % | Satisfaction&#10;3 | | Projets livres" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
        </div>
      )

    case 'comparator':
      return (
        <div className="space-y-2">
          <Label className="text-[10px] text-immo-text-muted">Biens a comparer (un par ligne : type | surface | pieces | prix | features separees par virgules)</Label>
          <textarea
            value={((content.items as Array<{type:string;surface:string;rooms:string;price:number;features:string[]}>) ?? []).map(i => `${i.type} | ${i.surface} | ${i.rooms} | ${i.price} | ${i.features.join(',')}`).join('\n')}
            onChange={e => set('items', e.target.value.split('\n').filter(l => l.trim()).map(line => {
              const [type, surface, rooms, price, features] = line.split('|').map(x => x.trim())
              return { type, surface, rooms, price: Number(price) || 0, features: (features ?? '').split(',').map(f => f.trim()).filter(Boolean) }
            }))}
            rows={4} placeholder="F2 | 65 m² | 2 pieces | 6500000 | Balcon,Parking&#10;F3 | 85 m² | 3 pieces | 8500000 | Balcon,Parking,Cuisine equipee" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
        </div>
      )

    case 'calculator':
      return (
        <div className="space-y-2">
          <div><Label className="text-[10px] text-immo-text-muted">Prix par defaut (DA)</Label><Input type="number" value={String((content.default_price as number) ?? '')} onChange={e => set('default_price', Number(e.target.value) || null)} placeholder="10000000" className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Taux par defaut (%)</Label><Input type="number" step="0.1" value={String((content.default_rate as number) ?? '')} onChange={e => set('default_rate', Number(e.target.value) || null)} placeholder="6.5" className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Duree par defaut (annees)</Label><Input type="number" value={String((content.default_years as number) ?? '')} onChange={e => set('default_years', Number(e.target.value) || null)} placeholder="20" className={inputClass} /></div>
        </div>
      )

    case 'whatsapp':
      return (
        <div className="space-y-2">
          <div><Label className="text-[10px] text-immo-text-muted">Numero WhatsApp</Label><Input value={(content.phone as string) ?? ''} onChange={e => set('phone', e.target.value)} placeholder="0555 123 456" className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Message pre-rempli</Label><Input value={(content.message as string) ?? ''} onChange={e => set('message', e.target.value)} placeholder="Bonjour, je suis interesse..." className={inputClass} /></div>
        </div>
      )

    case 'social_proof':
      return (
        <div className="space-y-2">
          <Label className="text-[10px] text-immo-text-muted">Notifications (une par ligne : nom | action | temps)</Label>
          <textarea
            value={((content.items as Array<{name:string;action:string;time:string}>) ?? []).map(i => `${i.name} | ${i.action} | ${i.time}`).join('\n')}
            onChange={e => set('items', e.target.value.split('\n').filter(l => l.trim()).map(line => {
              const [name, action, time] = line.split('|').map(x => x.trim())
              return { name, action, time }
            }))}
            rows={4} placeholder="Mohammed A. | vient de reserver un F3 | il y a 5 min&#10;Fatima Z. | a visite le chantier | il y a 1h" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
          <div><Label className="text-[10px] text-immo-text-muted">Intervalle entre popups (secondes)</Label><Input type="number" value={String((content.interval as number) ?? 30)} onChange={e => set('interval', Number(e.target.value) || 30)} className={inputClass} /></div>
        </div>
      )

    default:
      return <p className="text-xs text-immo-text-muted">Section non configurable</p>
  }
}

/* ═══ Features Editor with Checkboxes ═══ */

const AMENITIES_CATALOG = {
  'Haut Standing': [
    { icon: 'piscine', title: 'Piscine', description: '' },
    { icon: 'ascenseur', title: 'Ascenseur', description: '' },
    { icon: 'parking', title: 'Parking sous-sol', description: '' },
    { icon: 'securite', title: 'Securite 24/7', description: 'Vigiles + cameras' },
    { icon: 'climatisation', title: 'Climatisation centrale', description: '' },
    { icon: 'chauffage', title: 'Chauffage central', description: '' },
    { icon: 'terrasse', title: 'Terrasse privative', description: '' },
    { icon: 'jardin', title: 'Jardin prive', description: '' },
    { icon: 'cuisine', title: 'Cuisine equipee', description: 'Electromenager integre' },
    { icon: 'vue', title: 'Vue panoramique', description: '' },
    { icon: 'default', title: 'Domotique', description: 'Maison intelligente' },
    { icon: 'default', title: 'Interphone video', description: '' },
    { icon: 'default', title: 'Double vitrage', description: '' },
    { icon: 'default', title: 'Isolation phonique', description: '' },
    { icon: 'default', title: 'Salle de sport', description: '' },
    { icon: 'default', title: 'Spa / Hammam', description: '' },
    { icon: 'default', title: 'Conciergerie', description: '' },
    { icon: 'default', title: 'Local poubelles', description: '' },
  ],
  'Moyen Standing': [
    { icon: 'parking', title: 'Parking exterieur', description: '' },
    { icon: 'ascenseur', title: 'Ascenseur', description: '' },
    { icon: 'securite', title: 'Gardien', description: '' },
    { icon: 'cuisine', title: 'Cuisine amenagee', description: '' },
    { icon: 'chauffage', title: 'Chauffage individuel', description: '' },
    { icon: 'default', title: 'Interphone', description: '' },
    { icon: 'default', title: 'Placard integre', description: '' },
    { icon: 'default', title: 'Balcon', description: '' },
    { icon: 'default', title: 'Cave', description: '' },
    { icon: 'default', title: 'Antenne collective', description: '' },
  ],
  'Environnement': [
    { icon: 'jardin', title: 'Espaces verts', description: '' },
    { icon: 'default', title: 'Aire de jeux enfants', description: '' },
    { icon: 'default', title: 'Centre commercial integre', description: '' },
    { icon: 'default', title: 'Pharmacie a proximite', description: '' },
    { icon: 'default', title: 'Ecole a proximite', description: '' },
    { icon: 'default', title: 'Mosquee a proximite', description: '' },
    { icon: 'default', title: 'Transport en commun', description: '' },
    { icon: 'default', title: 'Acces autoroute', description: '' },
  ],
  'Projet': [
    { icon: 'etages', title: 'R+5', description: '' },
    { icon: 'surface', title: '85 a 140 m²', description: 'Surfaces habitables' },
    { icon: 'livraison', title: 'Livraison 2026', description: '' },
    { icon: 'default', title: 'Titre de propriete', description: 'Acte notarie' },
    { icon: 'default', title: 'Conformite parasismique', description: '' },
    { icon: 'default', title: 'Garantie decennale', description: '' },
  ],
}

function FeaturesEditor({ content, onUpdate }: { content: Record<string, unknown>; onUpdate: (c: Record<string, unknown>) => void }) {
  const items = (content.items as Array<{ icon?: string; title: string; description?: string }>) ?? []

  function isChecked(title: string) {
    return items.some(i => i.title === title)
  }

  function toggle(amenity: { icon: string; title: string; description: string }) {
    if (isChecked(amenity.title)) {
      onUpdate({ ...content, items: items.filter(i => i.title !== amenity.title) })
    } else {
      onUpdate({ ...content, items: [...items, amenity] })
    }
  }

  function updateItem(idx: number, field: string, value: string) {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }
    onUpdate({ ...content, items: updated })
  }

  function addCustom() {
    onUpdate({ ...content, items: [...items, { icon: 'default', title: 'Nouveau', description: '' }] })
  }

  function removeItem(idx: number) {
    onUpdate({ ...content, items: items.filter((_, i) => i !== idx) })
  }

  return (
    <div className="space-y-4">
      {/* Checkbox catalog */}
      {Object.entries(AMENITIES_CATALOG).map(([category, amenities]) => (
        <div key={category}>
          <p className="mb-2 text-[11px] font-semibold text-immo-accent-green">{category}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {amenities.map(amenity => (
              <label key={amenity.title} className="flex cursor-pointer items-center gap-2 rounded-md border border-immo-border-default px-2.5 py-1.5 hover:bg-immo-bg-card-hover">
                <input
                  type="checkbox"
                  checked={isChecked(amenity.title)}
                  onChange={() => toggle(amenity)}
                  className="h-3.5 w-3.5 rounded accent-immo-accent-green"
                />
                <span className="text-[11px] text-immo-text-primary">{amenity.title}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {/* Selected items with editable descriptions */}
      {items.length > 0 && (
        <div className="border-t border-immo-border-default pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-immo-text-primary">Selectionnes ({items.length})</p>
            <button onClick={addCustom} className="text-[10px] text-immo-accent-green hover:underline">+ Ajouter un custom</button>
          </div>
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md bg-immo-bg-primary px-2.5 py-1.5">
                <Input
                  value={item.title}
                  onChange={e => updateItem(i, 'title', e.target.value)}
                  className={`h-6 flex-1 text-[11px] ${inputClass}`}
                />
                <Input
                  value={item.description ?? ''}
                  onChange={e => updateItem(i, 'description', e.target.value)}
                  placeholder="Detail..."
                  className={`h-6 flex-1 text-[11px] ${inputClass}`}
                />
                <button onClick={() => removeItem(i)} className="text-immo-status-red text-[10px]">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══ Form Fields Builder ═══ */

interface FormFieldDef {
  id: string
  type: string
  label: string
  placeholder?: string
  required?: boolean
  options?: string[]
  maps_to?: string
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texte' },
  { value: 'tel', label: 'Telephone' },
  { value: 'email', label: 'Email' },
  { value: 'number', label: 'Nombre' },
  { value: 'select', label: 'Liste deroulante' },
  { value: 'textarea', label: 'Zone de texte' },
  { value: 'checkbox', label: 'Case a cocher' },
  { value: 'date', label: 'Date' },
]

const MAPS_TO = [
  { value: '', label: 'Aucun (question custom)' },
  { value: 'full_name', label: '→ Nom client' },
  { value: 'phone', label: '→ Telephone client' },
  { value: 'email', label: '→ Email client' },
  { value: 'confirmed_budget', label: '→ Budget client' },
  { value: 'unit_type', label: '→ Type de bien' },
  { value: 'message', label: '→ Notes client' },
]

function FormFieldsEditor({ content, onUpdate }: { content: Record<string, unknown>; onUpdate: (c: Record<string, unknown>) => void }) {
  const fields = ((content.fields ?? []) as FormFieldDef[])

  function setFields(newFields: FormFieldDef[]) { onUpdate({ ...content, fields: newFields }) }

  function addField() {
    setFields([...fields, {
      id: `field_${Date.now()}`,
      type: 'text',
      label: 'Nouvelle question',
      placeholder: '',
      required: false,
      maps_to: '',
    }])
  }

  function updateField(idx: number, patch: Partial<FormFieldDef>) {
    const updated = [...fields]
    updated[idx] = { ...updated[idx], ...patch }
    setFields(updated)
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx))
  }

  function moveField(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= fields.length) return
    const updated = [...fields]
    ;[updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    setFields(updated)
  }

  return (
    <div className="space-y-4">
      {/* Form settings */}
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-[10px] text-immo-text-muted">Texte du bouton</Label><Input value={(content.submit_label as string) ?? ''} onChange={e => onUpdate({ ...content, submit_label: e.target.value })} placeholder="Envoyer ma demande" className={inputClass} /></div>
        <div><Label className="text-[10px] text-immo-text-muted">Couleur du bouton</Label><Input type="color" value={(content.button_color as string) ?? '#0579DA'} onChange={e => onUpdate({ ...content, button_color: e.target.value })} className="h-8 w-full" /></div>
      </div>
      <div><Label className="text-[10px] text-immo-text-muted">Titre apres soumission</Label><Input value={(content.success_title as string) ?? ''} onChange={e => onUpdate({ ...content, success_title: e.target.value })} placeholder="Merci !" className={inputClass} /></div>
      <div><Label className="text-[10px] text-immo-text-muted">Message apres soumission</Label><Input value={(content.success_message as string) ?? ''} onChange={e => onUpdate({ ...content, success_message: e.target.value })} placeholder="Un conseiller vous contactera..." className={inputClass} /></div>
      <div><Label className="text-[10px] text-immo-text-muted">Texte legal</Label><Input value={(content.legal_text as string) ?? ''} onChange={e => onUpdate({ ...content, legal_text: e.target.value })} placeholder="En soumettant ce formulaire..." className={inputClass} /></div>

      {/* Fields */}
      <div className="border-t border-immo-border-default pt-3">
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-[10px] font-semibold text-immo-text-primary">Champs du formulaire ({fields.length})</Label>
          <button onClick={addField} className="rounded-md bg-immo-accent-green/10 px-2 py-1 text-[10px] font-medium text-immo-accent-green hover:bg-immo-accent-green/20">
            + Ajouter un champ
          </button>
        </div>

        <div className="space-y-2">
          {fields.map((field, idx) => (
            <div key={field.id} className="rounded-lg border border-immo-border-default bg-immo-bg-primary p-3">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => moveField(idx, -1)} className="text-immo-text-muted hover:text-immo-text-primary text-[10px]">▲</button>
                <button onClick={() => moveField(idx, 1)} className="text-immo-text-muted hover:text-immo-text-primary text-[10px]">▼</button>
                <span className="flex-1 text-xs font-medium text-immo-text-primary">{field.label}</span>
                <label className="flex items-center gap-1 text-[10px] text-immo-text-muted">
                  <input type="checkbox" checked={field.required ?? false} onChange={e => updateField(idx, { required: e.target.checked })} className="h-3 w-3" />
                  Obligatoire
                </label>
                <button onClick={() => removeField(idx)} className="text-immo-status-red text-[10px] hover:underline">Supprimer</button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] text-immo-text-muted">Type</label>
                  <select value={field.type} onChange={e => updateField(idx, { type: e.target.value })} className={`h-7 w-full rounded border px-2 text-[11px] ${inputClass}`}>
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-immo-text-muted">Label</label>
                  <Input value={field.label} onChange={e => updateField(idx, { label: e.target.value })} className={`h-7 text-[11px] ${inputClass}`} />
                </div>
                <div>
                  <label className="text-[9px] text-immo-text-muted">Mappe vers</label>
                  <select value={field.maps_to ?? ''} onChange={e => updateField(idx, { maps_to: e.target.value || undefined })} className={`h-7 w-full rounded border px-2 text-[11px] ${inputClass}`}>
                    {MAPS_TO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              {field.type !== 'checkbox' && (
                <div className="mt-2">
                  <label className="text-[9px] text-immo-text-muted">Placeholder</label>
                  <Input value={field.placeholder ?? ''} onChange={e => updateField(idx, { placeholder: e.target.value })} className={`h-7 text-[11px] ${inputClass}`} />
                </div>
              )}
              {field.type === 'select' && (
                <div className="mt-2">
                  <label className="text-[9px] text-immo-text-muted">Options (separees par des virgules)</label>
                  <Input value={(field.options ?? []).join(', ')} onChange={e => updateField(idx, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Option 1, Option 2, Option 3" className={`h-7 text-[11px] ${inputClass}`} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function getDefaultContent(type: string): Record<string, unknown> {
  switch (type) {
    case 'hero': return { subtitle: '', background_image: '', overlay_opacity: 0.4 }
    case 'gallery': return { images: [], layout: 'grid' }
    case 'features': return { items: [] }
    case 'video': return { url: '', caption: '' }
    case 'virtual_tour': return { embed_url: '', caption: '' }
    case 'pricing': return { items: [] }
    case 'testimonials': return { items: [] }
    case 'faq': return { items: [] }
    case 'cta': return { text: '', button_label: 'Contactez-nous' }
    case 'form': return {
      fields: [
        { id: 'full_name', type: 'text', label: 'Nom complet', placeholder: 'Votre nom', required: true, maps_to: 'full_name' },
        { id: 'phone', type: 'tel', label: 'Telephone', placeholder: '0555 123 456', required: true, maps_to: 'phone' },
        { id: 'email', type: 'email', label: 'Email', placeholder: 'email@exemple.com', maps_to: 'email' },
      ],
      submit_label: 'Envoyer ma demande',
      success_title: '',
      success_message: '',
      legal_text: '',
    }
    case 'multi_step_form': return { steps: [], submit_label: 'Envoyer', success_message: '' }
    case 'countdown': return { end_date: '', label: '', units_left: null }
    case 'stats': return { items: [] }
    case 'comparator': return { items: [] }
    case 'calculator': return { default_price: 10000000, default_rate: 6.5, default_years: 20 }
    case 'whatsapp': return { phone: '', message: '' }
    case 'social_proof': return { items: [], interval: 30 }
    default: return {}
  }
}
