import { Modal } from '@/components/common'

interface Template {
  id: string
  name: string
  description: string
  preview: string
  sections: Array<{ type: string; title: string; content: Record<string, unknown> }>
  accent: string
}

const TEMPLATES: Template[] = [
  {
    id: 'luxe',
    name: 'Luxe',
    description: 'Fond sombre, grandes images, ideal pour villas haut standing',
    preview: '🏰',
    accent: '#0A2540',
    sections: [
      { type: 'hero', title: 'Votre residence d\'exception', content: { subtitle: 'Le luxe a l\'etat pur', overlay_opacity: 0.6 } },
      { type: 'gallery', title: 'Un projet d\'exception', content: { images: [] } },
      { type: 'features', title: 'Prestations haut de gamme', content: { items: [] } },
      { type: 'virtual_tour', title: 'Visitez en immersion', content: { embed_url: '' } },
      { type: 'pricing', title: 'Investissez dans l\'excellence', content: { items: [] } },
      { type: 'testimonials', title: 'Ils nous font confiance', content: { items: [] } },
      { type: 'form', title: 'Visite privee sur rendez-vous', content: { fields: [
        { id: 'full_name', type: 'text', label: 'Nom complet', required: true, maps_to: 'full_name' },
        { id: 'phone', type: 'tel', label: 'Telephone', required: true, maps_to: 'phone' },
        { id: 'email', type: 'email', label: 'Email', maps_to: 'email' },
      ], submit_label: 'Demander une visite privee' } },
      { type: 'whatsapp', title: 'WhatsApp', content: { phone: '', message: 'Bonjour, je suis interesse par votre programme haut standing' } },
    ],
  },
  {
    id: 'moderne',
    name: 'Moderne',
    description: 'Design epure, cartes blanches, parfait pour appartements standing',
    preview: '🏢',
    accent: '#0579DA',
    sections: [
      { type: 'hero', title: 'Votre nouveau chez-vous', content: { subtitle: 'Appartements modernes au coeur de la ville' } },
      { type: 'stats', title: 'En chiffres', content: { items: [{ value: 150, label: 'Unites' }, { value: 98, suffix: '%', label: 'Satisfaction' }, { value: 3, label: 'Projets livres' }] } },
      { type: 'gallery', title: 'Decouvrez le projet', content: { images: [] } },
      { type: 'features', title: 'Equipements', content: { items: [] } },
      { type: 'pricing', title: 'Nos prix', content: { items: [] } },
      { type: 'calculator', title: 'Simulez votre credit', content: { default_price: 10000000, default_rate: 6.5, default_years: 20 } },
      { type: 'faq', title: 'Questions frequentes', content: { items: [] } },
      { type: 'multi_step_form', title: 'Trouvez votre bien ideal', content: {} },
      { type: 'whatsapp', title: 'WhatsApp', content: { phone: '' } },
    ],
  },
  {
    id: 'compact',
    name: 'Compact',
    description: 'Page courte, formulaire visible direct. Ideal pour campagnes Facebook rapides',
    preview: '⚡',
    accent: '#00D4A0',
    sections: [
      { type: 'hero', title: 'Offre speciale lancement', content: { subtitle: 'Places limitees — reservez maintenant' } },
      { type: 'countdown', title: 'Offre expire bientot', content: { label: 'Places limitees', units_left: 12 } },
      { type: 'form', title: 'Reservez votre place', content: { fields: [
        { id: 'full_name', type: 'text', label: 'Nom', required: true, maps_to: 'full_name' },
        { id: 'phone', type: 'tel', label: 'Telephone', required: true, maps_to: 'phone' },
      ], submit_label: 'Je reserve ma place' } },
      { type: 'whatsapp', title: 'WhatsApp', content: { phone: '' } },
      { type: 'social_proof', title: 'Social proof', content: { items: [{ name: 'Ahmed M.', action: 'vient de reserver', time: 'il y a 3 min' }], interval: 20 } },
    ],
  },
  {
    id: 'video_first',
    name: 'Video First',
    description: 'Video hero plein ecran + visite virtuelle. Ideal avec video drone',
    preview: '🎬',
    accent: '#0579DA',
    sections: [
      { type: 'hero', title: 'Decouvrez en video', content: { subtitle: 'Une experience immersive', background_video: '' } },
      { type: 'video', title: 'Le projet en images', content: { url: '' } },
      { type: 'virtual_tour', title: 'Visite virtuelle 360', content: { embed_url: '' } },
      { type: 'features', title: 'Points forts', content: { items: [] } },
      { type: 'cta', title: 'Convaincu ?', content: { text: 'Reservez votre visite maintenant', button_label: 'Je veux visiter' } },
      { type: 'form', title: 'Contactez-nous', content: { fields: [
        { id: 'full_name', type: 'text', label: 'Nom complet', required: true, maps_to: 'full_name' },
        { id: 'phone', type: 'tel', label: 'Telephone', required: true, maps_to: 'phone' },
        { id: 'message', type: 'textarea', label: 'Message', maps_to: 'message' },
      ] } },
    ],
  },
  {
    id: 'multi_projet',
    name: 'Multi-Projet',
    description: 'Presentation de plusieurs projets. Ideal pour promoteurs multi-sites',
    preview: '🏗️',
    accent: '#7C3AED',
    sections: [
      { type: 'hero', title: 'Nos programmes immobiliers', content: { subtitle: 'Decouvrez nos projets en cours' } },
      { type: 'stats', title: '', content: { items: [{ value: 500, label: 'Unites' }, { value: 5, label: 'Projets' }, { value: 200, label: 'Familles logees' }] } },
      { type: 'comparator', title: 'Comparez nos offres', content: { items: [] } },
      { type: 'gallery', title: 'Nos realisations', content: { images: [] } },
      { type: 'testimonials', title: 'Avis de nos clients', content: { items: [] } },
      { type: 'faq', title: 'FAQ', content: { items: [] } },
      { type: 'multi_step_form', title: 'Quel projet vous correspond ?', content: {} },
    ],
  },
]

interface TemplateSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (template: Template) => void
}

export function TemplateSelector({ isOpen, onClose, onSelect }: TemplateSelectorProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Choisir un template" subtitle="Commencez avec un modele pre-construit" size="xl">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {TEMPLATES.map(tpl => (
          <button
            key={tpl.id}
            onClick={() => { onSelect(tpl); onClose() }}
            className="group rounded-xl border border-immo-border-default bg-immo-bg-card p-5 text-left transition-all hover:border-immo-accent-green/30 hover:shadow-md"
          >
            <div className="mb-3 text-4xl">{tpl.preview}</div>
            <h3 className="text-sm font-bold text-immo-text-primary">{tpl.name}</h3>
            <p className="mt-1 text-xs text-immo-text-muted">{tpl.description}</p>
            <div className="mt-3 flex items-center gap-1">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: tpl.accent }} />
              <span className="text-[10px] text-immo-text-muted">{tpl.sections.length} sections</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

export type { Template }
export { TEMPLATES }
