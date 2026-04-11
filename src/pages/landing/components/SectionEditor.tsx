import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, GripVertical, Eye, EyeOff, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import toast from 'react-hot-toast'

const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary text-sm'
const labelClass = 'text-[11px] font-medium text-immo-text-muted'

const SECTION_TYPES = [
  { type: 'hero', label: 'Hero (image/video de fond)', icon: '🖼️' },
  { type: 'gallery', label: 'Galerie photos', icon: '📸' },
  { type: 'features', label: 'Caracteristiques', icon: '✅' },
  { type: 'video', label: 'Video YouTube/Vimeo', icon: '🎬' },
  { type: 'virtual_tour', label: 'Visite virtuelle 360', icon: '🏠' },
  { type: 'pricing', label: 'Grille de prix', icon: '💰' },
  { type: 'testimonials', label: 'Avis clients', icon: '⭐' },
  { type: 'faq', label: 'FAQ', icon: '❓' },
  { type: 'cta', label: 'Appel a l\'action', icon: '🚀' },
  { type: 'form', label: 'Formulaire de contact', icon: '📝' },
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
        <div className="space-y-2">
          <div><Label className="text-[10px] text-immo-text-muted">Sous-titre</Label><Input value={(content.subtitle as string) ?? ''} onChange={e => set('subtitle', e.target.value)} className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Image de fond (URL)</Label><Input value={(content.background_image as string) ?? ''} onChange={e => set('background_image', e.target.value)} placeholder="https://..." className={inputClass} /></div>
          <div><Label className="text-[10px] text-immo-text-muted">Video de fond (URL mp4)</Label><Input value={(content.background_video as string) ?? ''} onChange={e => set('background_video', e.target.value)} placeholder="https://...mp4" className={inputClass} /></div>
        </div>
      )

    case 'gallery':
      return (
        <div className="space-y-2">
          <Label className="text-[10px] text-immo-text-muted">URLs des images (une par ligne)</Label>
          <textarea
            value={((content.images as Array<{url:string}>) ?? []).map(i => i.url).join('\n')}
            onChange={e => set('images', e.target.value.split('\n').filter(u => u.trim()).map(url => ({ url: url.trim() })))}
            rows={5} placeholder="https://image1.jpg&#10;https://image2.jpg" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
        </div>
      )

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
      return (
        <div className="space-y-2">
          <Label className="text-[10px] text-immo-text-muted">Caracteristiques (une par ligne : titre | description)</Label>
          <textarea
            value={((content.items as Array<{title:string; description?:string}>) ?? []).map(i => i.description ? `${i.title} | ${i.description}` : i.title).join('\n')}
            onChange={e => set('items', e.target.value.split('\n').filter(l => l.trim()).map(line => {
              const [title, description] = line.split('|').map(s => s.trim())
              return { title, description }
            }))}
            rows={5} placeholder="Parking sous-sol | 2 places&#10;Surface | 85 a 140 m²&#10;Livraison | Juin 2026" className={`w-full rounded-md border p-2 text-xs ${inputClass}`}
          />
        </div>
      )

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

    default:
      return <p className="text-xs text-immo-text-muted">Section non configurable</p>
  }
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
    default: return {}
  }
}
