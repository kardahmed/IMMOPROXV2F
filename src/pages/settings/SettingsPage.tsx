import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, GitBranch, Bookmark, FileText, Bell, Globe, Shield, Palette, Sparkles } from 'lucide-react'
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
import { PlaybookSection } from './sections/PlaybookSection'
import { TaskConfigSection } from './sections/TaskConfigSection'

type Section = 'company' | 'pipeline' | 'playbook' | 'tasks' | 'branding' | 'reservations' | 'templates' | 'notifications' | 'language' | 'security'

const SECTION_ICONS: Record<Section, typeof Building2> = {
  company: Building2,
  pipeline: GitBranch,
  playbook: Sparkles,
  tasks: Bell,
  branding: Palette,
  reservations: Bookmark,
  templates: FileText,
  notifications: Bell,
  language: Globe,
  security: Shield,
}

const SECTION_KEYS: Section[] = ['company', 'pipeline', 'playbook', 'tasks', 'branding', 'reservations', 'templates', 'notifications', 'language', 'security']

const SECTION_LABELS: Record<Section, string> = {
  company: 'Agence',
  pipeline: 'Pipeline',
  playbook: 'Playbook IA',
  tasks: 'Taches auto',
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
              {t(SECTION_LABELS[key])}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {section === 'company' && <CompanySection />}
        {section === 'pipeline' && <PipelineSection />}
        {section === 'playbook' && <PlaybookSection />}
        {section === 'tasks' && <TaskConfigSection />}
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
