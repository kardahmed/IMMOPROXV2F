import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, GitBranch, Bookmark, FileText, Bell, Globe, Shield, Palette, Sparkles, MessageCircle, Calendar, ToggleLeft } from 'lucide-react'
import {
  CompanySection,
  PipelineSection,
  BrandingSection,
  ReservationsSection,
  TemplatesSection,
  NotificationsSection,
  LanguageSection,
  SecuritySection,
} from './sections'
// PlaybookSection moved to Super Admin
import { TaskConfigSection } from './sections/TaskConfigSection'
import { WhatsAppSection } from './sections/WhatsAppSection'
import { VisitScheduleSection } from './sections/VisitScheduleSection'
import { PermissionProfilesSection } from './sections/PermissionProfilesSection'
import { FeaturesSection } from './sections/FeaturesSection'

type Section = 'company' | 'pipeline' | 'playbook' | 'tasks' | 'visits' | 'profiles' | 'features' | 'whatsapp' | 'branding' | 'reservations' | 'templates' | 'notifications' | 'language' | 'security'

const SECTION_ICONS: Record<Section, typeof Building2> = {
  company: Building2,
  pipeline: GitBranch,
  playbook: Sparkles,
  tasks: Bell,
  visits: Calendar,
  profiles: Shield,
  features: ToggleLeft,
  whatsapp: MessageCircle,
  branding: Palette,
  reservations: Bookmark,
  templates: FileText,
  notifications: Bell,
  language: Globe,
  security: Shield,
}

const SECTION_KEYS: Section[] = ['company', 'pipeline', 'tasks', 'visits', 'features', 'whatsapp', 'branding', 'reservations', 'templates', 'notifications', 'language', 'security']

const SECTION_LABELS: Record<Section, string> = {
  company: 'Agence',
  pipeline: 'Pipeline',
  playbook: 'Playbook IA',
  tasks: 'Taches auto',
  visits: 'Visites',
  profiles: 'Permissions',
  features: 'Fonctionnalites',
  whatsapp: 'WhatsApp',
  branding: 'Personnalisation',
  reservations: 'Reservations',
  templates: 'Documents',
  notifications: 'Notifications',
  language: 'Langue',
  security: 'Securite',
}

export function SettingsPage() {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('company')

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/* Mobile: select dropdown */}
      <div className="lg:hidden">
        <select
          value={section}
          onChange={(e) => setSection(e.target.value as Section)}
          className="h-11 w-full rounded-lg border border-immo-border-default bg-immo-bg-card px-3 text-sm text-immo-text-primary focus:border-immo-accent-green focus:outline-none"
        >
          {SECTION_KEYS.map((key) => (
            <option key={key} value={key}>{t(SECTION_LABELS[key])}</option>
          ))}
        </select>
      </div>

      {/* Desktop: side menu */}
      <div className="hidden w-[220px] shrink-0 space-y-1 lg:block">
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
              {t(SECTION_LABELS[key])}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {section === 'company' && <CompanySection />}
        {section === 'pipeline' && <PipelineSection />}
        {section === 'tasks' && <TaskConfigSection />}
        {section === 'visits' && <VisitScheduleSection />}
        {section === 'profiles' && <PermissionProfilesSection />}
        {section === 'features' && <FeaturesSection />}
        {section === 'whatsapp' && <WhatsAppSection />}
        {section === 'branding' && <BrandingSection />}
        {section === 'reservations' && <ReservationsSection />}
        {section === 'templates' && <TemplatesSection />}
        {section === 'notifications' && <NotificationsSection />}
        {section === 'language' && <LanguageSection />}
        {section === 'security' && <SecuritySection />}
      </div>
    </div>
  )
}
