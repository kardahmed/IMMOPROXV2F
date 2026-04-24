import { useState, lazy, Suspense } from 'react'
import { DollarSign, BarChart3, Megaphone, Mail, FileText } from 'lucide-react'
// Lazy-load tabs — only the active tab is rendered, so no point downloading all 5 up-front
const ExpensesTab = lazy(() => import('./tabs/ExpensesTab').then(m => ({ default: m.ExpensesTab })))
const AnalyticsTab = lazy(() => import('./tabs/AnalyticsTab').then(m => ({ default: m.AnalyticsTab })))
const CampaignsTab = lazy(() => import('./tabs/CampaignsTab').then(m => ({ default: m.CampaignsTab })))
const EmailCampaignsTab = lazy(() => import('./tabs/EmailCampaignsTab').then(m => ({ default: m.EmailCampaignsTab })))
const EmailTemplatesTab = lazy(() => import('./tabs/EmailTemplatesTab').then(m => ({ default: m.EmailTemplatesTab })))

function TabFallback() {
  return <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-immo-accent-green border-t-transparent" /></div>
}

type Tab = 'expenses' | 'analytics' | 'campaigns' | 'email_campaigns' | 'email_templates'

export function MarketingROIPage() {
  const [tab, setTab] = useState<Tab>('analytics')

  const TABS: Array<{ key: Tab; label: string; icon: typeof DollarSign }> = [
    { key: 'analytics', label: 'Analytique ROI', icon: BarChart3 },
    { key: 'expenses', label: 'Budgets & Dépenses', icon: DollarSign },
    { key: 'campaigns', label: 'Campagnes Ads', icon: Megaphone },
    { key: 'email_campaigns', label: 'Email Marketing', icon: Mail },
    { key: 'email_templates', label: 'Templates Email', icon: FileText },
  ]

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-immo-border-default overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${tab === t.key ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<TabFallback />}>
        {tab === 'analytics' && <AnalyticsTab />}
        {tab === 'expenses' && <ExpensesTab />}
        {tab === 'campaigns' && <CampaignsTab />}
        {tab === 'email_campaigns' && <EmailCampaignsTab />}
        {tab === 'email_templates' && <EmailTemplatesTab />}
      </Suspense>
    </div>
  )
}
