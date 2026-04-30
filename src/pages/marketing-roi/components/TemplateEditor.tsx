import { useState, useCallback } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Type, ImageIcon, MousePointer, Columns, Minus, ArrowUpDown, GripVertical, Trash2, Save, Eye, X } from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { blocksToHtml, STARTER_BLOCKS } from '@/lib/blocksToHtml'
import type { EmailBlock } from '@/lib/blocksToHtml'
import { useSaveTemplate } from '@/hooks/useEmailMarketing'
import { DragDropZone } from '@/components/common/DragDropZone'
import toast from 'react-hot-toast'

// Sanitize HTML used inside text blocks. Allowed tags = simple
// formatting only. Event handlers, script, iframe, and javascript:
// URLs are stripped by DOMPurify defaults.
function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  })
}

// ─── Block type palette ─────────────────────────────────────────────────────

const BLOCK_TYPES = [
  { type: 'text' as const, icon: Type, label: 'Texte' },
  { type: 'image' as const, icon: ImageIcon, label: 'Image' },
  { type: 'button' as const, icon: MousePointer, label: 'Bouton' },
  { type: 'columns' as const, icon: Columns, label: 'Colonnes' },
  { type: 'divider' as const, icon: Minus, label: 'Séparateur' },
  { type: 'spacer' as const, icon: ArrowUpDown, label: 'Espace' },
]

function newBlock(type: EmailBlock['type']): EmailBlock {
  const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  switch (type) {
    case 'text': return { id, type, content: { text: '<p>Votre texte ici</p>' }, styles: {} }
    case 'image': return { id, type, content: { src: '', alt: '' }, styles: { width: '100%', borderRadius: '8px' } }
    case 'button': return { id, type, content: { text: 'Cliquer ici', url: '#' }, styles: { backgroundColor: '#0579DA', color: '#ffffff', borderRadius: '8px', textAlign: 'center' } }
    case 'columns': return { id, type, content: { children: [
      { id: `${id}_c1`, type: 'text', content: { text: '<p>Colonne 1</p>' }, styles: {} },
      { id: `${id}_c2`, type: 'text', content: { text: '<p>Colonne 2</p>' }, styles: {} },
    ] }, styles: { gap: '16px' } }
    case 'divider': return { id, type, content: {}, styles: { borderColor: '#E3E8EF' } }
    case 'spacer': return { id, type, content: {}, styles: { height: '24px' } }
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  initialTemplate?: { id: string; name: string; subject: string; blocks: EmailBlock[] }
  onClose: () => void
}

export function TemplateEditor({ initialTemplate, onClose }: Props) {
  const { tenantId } = useAuthStore()
  const [name, setName] = useState(initialTemplate?.name ?? 'Nouveau template')
  const [subject, setSubject] = useState(initialTemplate?.subject ?? '')
  const [blocks, setBlocks] = useState<EmailBlock[]>(initialTemplate?.blocks ?? [...STARTER_BLOCKS])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const saveTemplate = useSaveTemplate()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const selectedBlock = blocks.find(b => b.id === selectedId)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setBlocks(prev => {
        const oldIndex = prev.findIndex(b => b.id === active.id)
        const newIndex = prev.findIndex(b => b.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const addBlock = (type: EmailBlock['type']) => {
    setBlocks(prev => [...prev, newBlock(type)])
  }

  const removeBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const updateBlock = useCallback((id: string, updates: Partial<Pick<EmailBlock, 'content' | 'styles'>>) => {
    setBlocks(prev => prev.map(b => b.id === id ? {
      ...b,
      content: updates.content ? { ...b.content, ...updates.content } : b.content,
      styles: updates.styles ? { ...b.styles, ...updates.styles } : b.styles,
    } : b))
  }, [])

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Nom requis'); return }
    const htmlCache = blocksToHtml(blocks)
    try {
      await saveTemplate.mutateAsync({ id: initialTemplate?.id, name, subject, blocks, html_cache: htmlCache })
      toast.success('Template sauvegardé')
      onClose()
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    }
  }

  const handleImageUpload = async (files: File[], blockId: string) => {
    const file = files[0]
    if (!file || !tenantId) return
    const ext = file.name.split('.').pop()
    const path = `${tenantId}/email/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`
    const { error } = await supabase.storage.from('email-assets').upload(path, file)
    if (error) { toast.error('Erreur upload'); return }
    const { data: urlData } = supabase.storage.from('email-assets').getPublicUrl(path)
    updateBlock(blockId, { content: { src: urlData.publicUrl } })
    toast.success('Image uploadée')
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-immo-bg-primary">
      {/* Left: Block palette */}
      <div className="w-[200px] shrink-0 border-r border-immo-border-default bg-immo-bg-card p-4 space-y-3">
        <h3 className="text-xs font-bold text-immo-text-secondary uppercase tracking-wider">Blocs</h3>
        <div className="space-y-1.5">
          {BLOCK_TYPES.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => addBlock(type)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary transition-colors"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <div className="my-3 h-px bg-immo-border-default" />
        <p className="text-[10px] text-immo-text-muted">Cliquez pour ajouter un bloc. Glissez pour réorganiser.</p>
      </div>

      {/* Center: Preview */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Toolbar */}
        <div className="mb-4 flex items-center gap-3">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du template" className="max-w-[250px] text-sm" />
          <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Objet de l'email" className="flex-1 text-sm" />
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} className="gap-1 text-xs">
            <Eye className="h-3.5 w-3.5" /> {showPreview ? 'Éditeur' : 'Aperçu'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saveTemplate.isPending} className="gap-1 text-xs bg-immo-accent-green hover:bg-immo-accent-green/90 text-white">
            <Save className="h-3.5 w-3.5" /> Sauvegarder
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {showPreview ? (
          <div className="mx-auto max-w-[640px] rounded-xl border border-immo-border-default bg-white shadow-sm">
            <iframe
              srcDoc={blocksToHtml(blocks)}
              className="w-full rounded-xl"
              style={{ minHeight: 600, border: 'none' }}
              sandbox="allow-same-origin"
              title="Email preview"
            />
          </div>
        ) : (
          <div className="mx-auto max-w-[640px]">
            <div className="rounded-xl border border-immo-border-default bg-white shadow-sm">
              {/* Email header */}
              <div className="text-center py-6 border-b border-immo-border-default/50">
                <div className="inline-block bg-[#0579DA] text-white rounded-xl w-12 h-12 leading-[48px] text-xl font-bold">IP</div>
                <p className="text-[#0579DA] font-bold text-base mt-2">IMMO PRO-X</p>
              </div>

              {/* Blocks */}
              <div className="p-6">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    {blocks.length === 0 ? (
                      <div className="py-12 text-center text-sm text-immo-text-muted">
                        Ajoutez des blocs depuis le panneau de gauche
                      </div>
                    ) : (
                      blocks.map(block => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          isSelected={selectedId === block.id}
                          onSelect={() => setSelectedId(block.id === selectedId ? null : block.id)}
                          onRemove={() => removeBlock(block.id)}
                          onImageUpload={(files) => handleImageUpload(files, block.id)}
                        />
                      ))
                    )}
                  </SortableContext>
                </DndContext>
              </div>

              {/* Footer */}
              <div className="text-center py-4 text-[11px] text-[#8898AA] border-t border-immo-border-default/50">
                IMMO PRO-X — CRM Immobilier
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right: Properties */}
      <div className="w-[260px] shrink-0 border-l border-immo-border-default bg-immo-bg-card p-4 overflow-y-auto">
        <h3 className="text-xs font-bold text-immo-text-secondary uppercase tracking-wider mb-3">Propriétés</h3>
        {selectedBlock ? (
          <BlockProperties block={selectedBlock} onChange={(updates) => updateBlock(selectedBlock.id, updates)} />
        ) : (
          <p className="text-xs text-immo-text-muted">Sélectionnez un bloc pour modifier ses propriétés</p>
        )}
      </div>
    </div>
  )
}

// ─── Sortable Block ─────────────────────────────────────────────────────────

function SortableBlock({
  block, isSelected, onSelect, onRemove, onImageUpload,
}: {
  block: EmailBlock
  isSelected: boolean
  onSelect: () => void
  onRemove: () => void
  onImageUpload: (files: File[]) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group relative rounded-lg border mb-2 transition-colors cursor-pointer ${
        isSelected ? 'border-[#0579DA] ring-1 ring-[#0579DA]/20' : 'border-transparent hover:border-immo-border-default'
      }`}
    >
      {/* Controls */}
      <div className={`absolute -top-3 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10`}>
        <button {...attributes} {...listeners} className="rounded bg-white border border-immo-border-default p-1 shadow-sm cursor-grab">
          <GripVertical className="h-3 w-3 text-immo-text-muted" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="rounded bg-white border border-immo-border-default p-1 shadow-sm hover:bg-red-50">
          <Trash2 className="h-3 w-3 text-immo-status-red" />
        </button>
      </div>

      {/* Block content preview */}
      <div className="p-2">
        <BlockPreview block={block} onImageUpload={onImageUpload} />
      </div>
    </div>
  )
}

// ─── Block Preview ──────────────────────────────────────────────────────────

function BlockPreview({ block, onImageUpload }: { block: EmailBlock; onImageUpload: (files: File[]) => void }) {
  switch (block.type) {
    case 'text':
      // Audit (CRIT): the previous version dropped raw HTML straight
      // into the DOM via dangerouslySetInnerHTML, so any admin /
      // imported template that included <img src=x onerror=…> or
      // <script> would execute. DOMPurify with a tight allowlist
      // keeps formatting (bold, italic, links) but strips scripts,
      // event handlers and javascript: URLs.
      return (
        <div
          className="text-sm text-immo-text-primary"
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(String(block.content.text ?? '')) }}
        />
      )
    case 'image': {
      const src = String(block.content.src ?? '')
      if (!src) {
        return (
          <DragDropZone
            onFilesSelected={onImageUpload}
            accept="image/*"
            maxSizeMB={5}
            compact
            label="Glissez une image ou cliquez"
          />
        )
      }
      return <img src={src} alt={String(block.content.alt ?? '')} className="max-w-full rounded-lg" style={{ maxHeight: 200 }} />
    }
    case 'button': {
      const s = block.styles
      return (
        <div style={{ textAlign: (s.textAlign ?? 'center') as 'center' | 'left' | 'right' }}>
          <span
            className="inline-block px-6 py-3 rounded-lg font-semibold text-sm"
            style={{ background: s.backgroundColor ?? '#0579DA', color: s.color ?? '#fff', borderRadius: s.borderRadius ?? '8px' }}
          >
            {String(block.content.text ?? 'Bouton')}
          </span>
        </div>
      )
    }
    case 'columns': {
      const children = (block.content.children ?? []) as EmailBlock[]
      return (
        <div className="flex gap-3">
          {children.map((child, i) => (
            <div key={i} className="flex-1 rounded-lg border border-dashed border-immo-border-default p-2 text-xs text-immo-text-muted">
              <BlockPreview block={child} onImageUpload={onImageUpload} />
            </div>
          ))}
        </div>
      )
    }
    case 'divider':
      return <hr className="border-t" style={{ borderColor: block.styles.borderColor ?? '#E3E8EF' }} />
    case 'spacer':
      return <div className="bg-immo-bg-primary/50 rounded text-center text-[10px] text-immo-text-muted py-1" style={{ height: block.styles.height ?? '24px' }}>↕ {block.styles.height ?? '24px'}</div>
    default:
      return null
  }
}

// ─── Block Properties Panel ─────────────────────────────────────────────────

function BlockProperties({ block, onChange }: { block: EmailBlock; onChange: (u: Partial<Pick<EmailBlock, 'content' | 'styles'>>) => void }) {
  const fieldClass = "w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2 text-xs text-immo-text-primary focus:border-[#0579DA] focus:outline-none"
  const labelClass = "text-[10px] font-medium text-immo-text-muted uppercase tracking-wider"

  switch (block.type) {
    case 'text':
      return (
        <div className="space-y-3">
          <div><label className={labelClass}>Contenu HTML</label>
            <textarea
              value={String(block.content.text ?? '')}
              onChange={e => onChange({ content: { text: e.target.value } })}
              rows={6}
              className={`${fieldClass} font-mono resize-none mt-1`}
            />
          </div>
          <div><label className={labelClass}>Taille police</label>
            <Input value={block.styles.fontSize ?? '14px'} onChange={e => onChange({ styles: { fontSize: e.target.value } })} className={`${fieldClass} mt-1`} />
          </div>
          <div><label className={labelClass}>Couleur</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={block.styles.color ?? '#1A2B3D'} onChange={e => onChange({ styles: { color: e.target.value } })} className="h-8 w-8 rounded border cursor-pointer" />
              <Input value={block.styles.color ?? '#1A2B3D'} onChange={e => onChange({ styles: { color: e.target.value } })} className={fieldClass} />
            </div>
          </div>
          <div><label className={labelClass}>Alignement</label>
            <div className="flex gap-1 mt-1">
              {['left', 'center', 'right'].map(a => (
                <button key={a} onClick={() => onChange({ styles: { textAlign: a } })}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium ${block.styles.textAlign === a ? 'bg-[#0579DA]/10 text-[#0579DA]' : 'bg-immo-bg-primary text-immo-text-muted'}`}>
                  {a === 'left' ? 'Gauche' : a === 'center' ? 'Centre' : 'Droite'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )

    case 'image':
      return (
        <div className="space-y-3">
          <div><label className={labelClass}>URL image</label>
            <Input value={String(block.content.src ?? '')} onChange={e => onChange({ content: { src: e.target.value } })} placeholder="https://..." className={`${fieldClass} mt-1`} />
          </div>
          <div><label className={labelClass}>Texte alternatif</label>
            <Input value={String(block.content.alt ?? '')} onChange={e => onChange({ content: { alt: e.target.value } })} className={`${fieldClass} mt-1`} />
          </div>
          <div><label className={labelClass}>Largeur</label>
            <Input value={block.styles.width ?? '100%'} onChange={e => onChange({ styles: { width: e.target.value } })} className={`${fieldClass} mt-1`} />
          </div>
          <div><label className={labelClass}>Arrondi</label>
            <Input value={block.styles.borderRadius ?? '8px'} onChange={e => onChange({ styles: { borderRadius: e.target.value } })} className={`${fieldClass} mt-1`} />
          </div>
        </div>
      )

    case 'button':
      return (
        <div className="space-y-3">
          <div><label className={labelClass}>Texte</label>
            <Input value={String(block.content.text ?? '')} onChange={e => onChange({ content: { text: e.target.value } })} className={`${fieldClass} mt-1`} />
          </div>
          <div><label className={labelClass}>URL</label>
            <Input value={String(block.content.url ?? '')} onChange={e => onChange({ content: { url: e.target.value } })} placeholder="https://..." className={`${fieldClass} mt-1`} />
          </div>
          <div><label className={labelClass}>Couleur fond</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={block.styles.backgroundColor ?? '#0579DA'} onChange={e => onChange({ styles: { backgroundColor: e.target.value } })} className="h-8 w-8 rounded border cursor-pointer" />
              <Input value={block.styles.backgroundColor ?? '#0579DA'} onChange={e => onChange({ styles: { backgroundColor: e.target.value } })} className={fieldClass} />
            </div>
          </div>
          <div><label className={labelClass}>Couleur texte</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={block.styles.color ?? '#ffffff'} onChange={e => onChange({ styles: { color: e.target.value } })} className="h-8 w-8 rounded border cursor-pointer" />
              <Input value={block.styles.color ?? '#ffffff'} onChange={e => onChange({ styles: { color: e.target.value } })} className={fieldClass} />
            </div>
          </div>
          <div><label className={labelClass}>Alignement</label>
            <div className="flex gap-1 mt-1">
              {['left', 'center', 'right'].map(a => (
                <button key={a} onClick={() => onChange({ styles: { textAlign: a } })}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium ${block.styles.textAlign === a ? 'bg-[#0579DA]/10 text-[#0579DA]' : 'bg-immo-bg-primary text-immo-text-muted'}`}>
                  {a === 'left' ? 'Gauche' : a === 'center' ? 'Centre' : 'Droite'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )

    case 'divider':
      return (
        <div className="space-y-3">
          <div><label className={labelClass}>Couleur</label>
            <div className="flex gap-2 mt-1">
              <input type="color" value={block.styles.borderColor ?? '#E3E8EF'} onChange={e => onChange({ styles: { borderColor: e.target.value } })} className="h-8 w-8 rounded border cursor-pointer" />
              <Input value={block.styles.borderColor ?? '#E3E8EF'} onChange={e => onChange({ styles: { borderColor: e.target.value } })} className={fieldClass} />
            </div>
          </div>
        </div>
      )

    case 'spacer':
      return (
        <div className="space-y-3">
          <div><label className={labelClass}>Hauteur</label>
            <Input value={block.styles.height ?? '24px'} onChange={e => onChange({ styles: { height: e.target.value } })} className={`${fieldClass} mt-1`} />
          </div>
        </div>
      )

    default:
      return <p className="text-xs text-immo-text-muted">Aucune propriété</p>
  }
}
