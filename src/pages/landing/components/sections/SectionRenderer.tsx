import { HeroSection } from './HeroSection'
import { GallerySection } from './GallerySection'
import { FeaturesSection } from './FeaturesSection'
import { VideoSection } from './VideoSection'
import { VirtualTourSection } from './VirtualTourSection'
import { PricingSection } from './PricingSection'
import { TestimonialsSection } from './TestimonialsSection'
import { FAQSection } from './FAQSection'
import { CTASection } from './CTASection'
import { FormSection } from './FormSection'

export interface SectionData {
  id: string
  type: string
  sort_order: number
  title: string | null
  content: Record<string, unknown>
  is_visible: boolean
}

interface SectionRendererProps {
  sections: SectionData[]
  accent: string
  /** Required for form section */
  slug?: string
  formFields?: string[]
  tenantName?: string
}

export function SectionRenderer({ sections, accent, slug, formFields, tenantName }: SectionRendererProps) {
  const visible = sections.filter(s => s.is_visible).sort((a, b) => a.sort_order - b.sort_order)

  return (
    <>
      {visible.map(section => {
        const props = { key: section.id, title: section.title ?? undefined, content: section.content as never, accent }

        switch (section.type) {
          case 'hero': return <HeroSection {...props} />
          case 'gallery': return <GallerySection {...props} />
          case 'features': return <FeaturesSection {...props} />
          case 'video': return <VideoSection {...props} />
          case 'virtual_tour': return <VirtualTourSection {...props} />
          case 'pricing': return <PricingSection {...props} />
          case 'testimonials': return <TestimonialsSection {...props} />
          case 'faq': return <FAQSection {...props} />
          case 'cta': return <CTASection {...props} />
          case 'form': return (
            <FormSection
              key={section.id}
              title={section.title ?? undefined}
              accent={accent}
              slug={slug ?? ''}
              fields={formFields ?? ['full_name', 'phone', 'email', 'budget', 'message']}
              tenantName={tenantName}
            />
          )
          default: return null
        }
      })}
    </>
  )
}
