import { useState } from 'react'
import { DollarSign, BarChart3, Megaphone } from 'lucide-react'
import { ExpensesTab } from './tabs/ExpensesTab'
import { AnalyticsTab } from './tabs/AnalyticsTab'
import { CampaignsTab } from './tabs/CampaignsTab'

type Tab = 'expenses' | 'analytics' | 'campaigns'

export function MarketingROIPage() {
  const [tab, setTab] = useState<Tab>('analytics')

  const TABS: Array<{ key: Tab; label: string; icon: typeof DollarSign }> = [
    { key: 'analytics', label: 'Analytique ROI', icon: BarChart3 },
    { key: 'expenses', label: 'Budgets & Depenses', icon: DollarSign },
    { key: 'campaigns', label: 'Campagnes', icon: Megaphone },
  ]

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-immo-border-default">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${tab === t.key ? 'border-immo-accent-green text-immo-accent-green' : 'border-transparent text-immo-text-muted hover:text-immo-text-primary'}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'campaigns' && <CampaignsTab />}
    </div>
  )
}
