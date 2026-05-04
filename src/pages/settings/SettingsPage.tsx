import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, GitBranch, Bookmark, FileText, Bell, Globe, Shield, Palette, MessageCircle, Calendar, ToggleLeft, Gauge, Bot, Plug, Phone } from 'lucide-react'
// Lazy-load sections — only the active section is rendered, no point bundling all 13 up-front
const CompanySection = lazy(() => import('./sections').then(m => ({ default: m.CompanySection })))
const PipelineSection = lazy(() => import('./sections').then(m => ({ default: m.PipelineSection })))
const BrandingSection = lazy(() => import('./sections').then(m => ({ default: m.BrandingSection })))
const IntegrationsSection = lazy(() => import('./sections').then(m => ({ default: m.IntegrationsSection })))
const ReservationsSection = lazy(() => import('./sections').then(m => ({ default: m.ReservationsSection })))
const TemplatesSection = lazy(() => import('./sections').then(m => ({ default: m.TemplatesSection })))
const NotificationsSection = lazy(() => import('./sections').then(m => ({ default: m.NotificationsSection })))
const LanguageSection = lazy(() => import('./sections').then(m => ({ default: m.LanguageSection })))
const SecuritySection = lazy(() => import('./sections').then(m => ({ default: m.SecuritySection })))
const TaskConfigSection = lazy(() => import('./sections/TaskConfigSection').then(m => ({ default: m.TaskConfigSection })))
const WhatsAppSection = lazy(() => import('./sections/WhatsAppSection').then(m => ({ default: m.WhatsAppSection })))
const VisitScheduleSection = lazy(() => import('./sections/VisitScheduleSection').then(m => ({ default: m.VisitScheduleSection })))
const PermissionProfilesSection = lazy(() => import('./sections/PermissionProfilesSection').then(m => ({ default: m.PermissionProfilesSection })))
const FeaturesSection = lazy(() => import('./sections/FeaturesSection').then(m => ({ default: m.FeaturesSection })))
const QuotasSection = lazy(() => import('./sections/QuotasSection').then(m => ({ default: m.QuotasSection })))
const AutomationsSection = lazy(() => import('./sections/AutomationsSection').then(m => ({ default: m.AutomationsSection })))
const CallScriptOverridesSection = lazy(() => import('./sections/CallScriptOverridesSection').then(m => ({ default: m.CallScriptOverridesSection })))

function SectionFallback() {
  return <div className="flex justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" /></div>
}

type Section = 'company' | 'pipeline' | 'automations' | 'tasks' | 'visits' | 'profiles' | 'features' | 'quotas' | 'whatsapp' | 'call_scripts' | 'integrations' | 'branding' | 'reservations' | 'templates' | 'notifications' | 'language' | 'security'

const SECTION_ICONS: Record<Section, typeof Building2> = {
  company: Building2,
  pipeline: GitBranch,
  automations: Bot,
  tasks: Bell,
  visits: Calendar,
  profiles: Shield,
  features: ToggleLeft,
  quotas: Gauge,
  whatsapp: MessageCircle,
  call_scripts: Phone,
  integrations: Plug,
  branding: Palette,
  reservations: Bookmark,
  templates: FileText,
  notifications: Bell,
  language: Globe,
  security: Shield,
}

const SECTION_KEYS: Section[] = ['company', 'pipeline', 'automations', 'tasks', 'visits', 'features', 'quotas', 'whatsapp', 'call_scripts', 'integrations', 'branding', 'reservations', 'templates', 'notifications', 'language', 'security']

export function SettingsPage() {
  const { t } = useTranslation()
  // Audit (MED): the active section was held in local state, so F5
  // and deep-link both reset to "company". Sync with the URL query
  // string so /settings?section=branding bookmarks correctly.
  const [searchParams, setSearchParams] = useSearchParams()
  const urlSection = searchParams.get('section') as Section | null
  const section: Section = urlSection && SECTION_KEYS.includes(urlSection) ? urlSection : 'company'
  const setSection = (s: Section) => setSearchParams({ section: s }, { replace: true })

  return (
    <div className="flex gap-6">
      {/* Side menu */}
      <div className="w-[220px] shrink-0 space-y-1">
        {SECTION_KEYS.map((key) => {
          const Icon = SECTION_ICONS[key]
          return (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                section === key
                  ? 'bg-immo-accent-green/10 font-medium text-immo-accent-green'
                  : 'text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t(`settings_page.section_${key}`)}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <Suspense fallback={<SectionFallback />}>
          {section === 'company' && <CompanySection />}
          {section === 'pipeline' && <PipelineSection />}
          {section === 'automations' && <AutomationsSection />}
          {section === 'tasks' && <TaskConfigSection />}
          {section === 'visits' && <VisitScheduleSection />}
          {section === 'profiles' && <PermissionProfilesSection />}
          {section === 'features' && <FeaturesSection />}
          {section === 'quotas' && <QuotasSection />}
          {section === 'whatsapp' && <WhatsAppSection />}
          {section === 'call_scripts' && <CallScriptOverridesSection />}
          {section === 'integrations' && <IntegrationsSection />}
          {section === 'branding' && <BrandingSection />}
          {section === 'reservations' && <ReservationsSection />}
          {section === 'templates' && <TemplatesSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'language' && <LanguageSection />}
          {section === 'security' && <SecuritySection />}
        </Suspense>
      </div>
    </div>
  )
}
