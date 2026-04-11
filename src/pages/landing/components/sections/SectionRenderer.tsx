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
import { CountdownSection } from './CountdownSection'
import { StatsCounterSection } from './StatsCounterSection'
import { ComparatorSection } from './ComparatorSection'
import { CreditCalculatorSection } from './CreditCalculatorSection'
import { MultiStepFormSection } from './MultiStepFormSection'
import { AnimateOnScroll } from './AnimateOnScroll'
import { WhatsAppWidget } from './WhatsAppWidget'
import { SocialProofPopup } from './SocialProofSection'

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
  slug?: string
  tenantName?: string
  tenantPhone?: string
}

export function SectionRenderer({ sections, accent, slug, tenantName, tenantPhone }: SectionRendererProps) {
  const visible = sections.filter(s => s.is_visible).sort((a, b) => a.sort_order - b.sort_order)

  // Find special sections
  const whatsappSection = visible.find(s => s.type === 'whatsapp')
  const socialProofSection = visible.find(s => s.type === 'social_proof')

  return (
    <>
      {visible.map(section => {
        const props = { key: section.id, title: section.title ?? undefined, content: section.content as never, accent }

        // Wrap non-hero sections with scroll animation
        const wrap = (node: React.ReactNode, anim: 'fade-up' | 'fade-in' | 'zoom-in' = 'fade-up') => (
          <AnimateOnScroll key={section.id} animation={anim}>{node}</AnimateOnScroll>
        )

        switch (section.type) {
          case 'hero': return <HeroSection {...props} />
          case 'gallery': return wrap(<GallerySection {...props} />, 'fade-in')
          case 'features': return wrap(<FeaturesSection {...props} />)
          case 'video': return wrap(<VideoSection {...props} />, 'zoom-in')
          case 'virtual_tour': return wrap(<VirtualTourSection {...props} />, 'zoom-in')
          case 'pricing': return wrap(<PricingSection {...props} />)
          case 'testimonials': return wrap(<TestimonialsSection {...props} />)
          case 'faq': return wrap(<FAQSection {...props} />)
          case 'cta': return <CTASection {...props} />
          case 'countdown': return <CountdownSection {...props} />
          case 'stats': return wrap(<StatsCounterSection {...props} />)
          case 'comparator': return wrap(<ComparatorSection {...props} />)
          case 'calculator': return wrap(<CreditCalculatorSection {...props} />)
          case 'form': return (
            <FormSection key={section.id} title={section.title ?? undefined} accent={accent} slug={slug ?? ''} content={section.content as never} tenantName={tenantName} />
          )
          case 'multi_step_form': return (
            <MultiStepFormSection key={section.id} title={section.title ?? undefined} accent={accent} slug={slug ?? ''} content={section.content as never} tenantName={tenantName} />
          )
          // whatsapp and social_proof are rendered as floating widgets, not inline
          case 'whatsapp': return null
          case 'social_proof': return null
          default: return null
        }
      })}

      {/* Floating widgets */}
      {whatsappSection && (
        <WhatsAppWidget
          phone={(whatsappSection.content as { phone?: string }).phone ?? tenantPhone ?? ''}
          message={(whatsappSection.content as { message?: string }).message}
        />
      )}
      {socialProofSection && (
        <SocialProofPopup content={socialProofSection.content as never} />
      )}
    </>
  )
}
