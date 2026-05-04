import { useState, useMemo } from 'react'
import { Mail, Send, Eye, Search, CheckCircle, XCircle, Clock, FileText, TestTube } from 'lucide-react'
import { useEmailLogs, useSendTestEmail, type EmailLog } from '@/hooks/useEmailLogs'
import { Card, LoadingSpinner, PageHeader, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'

// ─── Template metadata (mirrored from edge function for UI) ─────────────────

const TEMPLATE_META = [
  {
    id: 'payment_reminder',
    label: "Rappel d'echeance",
    description: "Envoye 3 jours avant la date d'echeance d'un paiement.",
    trigger: 'Cron: check-reminders',
    icon: Clock,
    color: 'text-amber-600 bg-amber-50',
    sampleData: { client_name: 'Karim Bouzid', unit_code: 'A-204', installment_number: 3, amount: 850000, due_date: '2026-04-20', days_until_due: 3 },
  },
  {
    id: 'payment_overdue',
    label: 'Paiement en retard',
    description: 'Envoye quand un paiement est marque comme en retard.',
    trigger: 'Cron: check-payments',
    icon: XCircle,
    color: 'text-red-600 bg-red-50',
    sampleData: { client_name: 'Amina Ferhat', client_phone: '0555 12 34 56', unit_code: 'B-102', installment_number: 5, amount: 1200000, due_date: '2026-04-10' },
  },
  {
    id: 'reservation_expiring',
    label: 'Reservation bientot expiree',
    description: "Envoye 2 jours avant l'expiration d'une reservation.",
    trigger: 'Cron: check-reminders',
    icon: Clock,
    color: 'text-orange-600 bg-orange-50',
    sampleData: { client_name: 'Youcef Mebarki', unit_code: 'C-301', expires_at: '2026-04-18 14:00' },
  },
  {
    id: 'reservation_expired',
    label: 'Reservation expiree',
    description: 'Envoye quand une reservation expire automatiquement.',
    trigger: 'Cron: check-reservations',
    icon: XCircle,
    color: 'text-red-600 bg-red-50',
    sampleData: { client_name: 'Nadia Khelif', unit_code: 'D-105', reservation_id: 'res-001' },
  },
  {
    id: 'client_relaunch',
    label: 'Client a relancer',
    description: "Envoye quand un client n'a pas ete contacte depuis 3+ jours.",
    trigger: 'Cron: check-reminders',
    icon: Send,
    color: 'text-blue-600 bg-blue-50',
    sampleData: { client_name: 'Mohamed Slimani', days_since_contact: 5, pipeline_stage: 'negociation' },
  },
  {
    id: 'welcome',
    label: 'Bienvenue',
    description: 'Email de bienvenue pour les nouveaux utilisateurs.',
    trigger: 'Manuel / Onboarding',
    icon: CheckCircle,
    color: 'text-green-600 bg-green-50',
    sampleData: { user_name: 'Ahmed Benali', tenant_name: 'Agence Sahel Immobilier' },
  },
  {
    id: 'generic',
    label: 'Email generique',
    description: 'Template generique pour envois manuels.',
    trigger: 'Manuel',
    icon: FileText,
    color: 'text-gray-600 bg-gray-50',
    sampleData: { title: 'Information importante', body: 'Ceci est un email generique envoye depuis la plateforme IMMO PRO-X.\n\nMerci de votre attention.' },
  },
] as const

// ─── Status badge config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; type: 'green' | 'red' | 'blue' | 'muted' }> = {
  sent: { label: 'Envoye', type: 'green' },
  failed: { label: 'Echec', type: 'red' },
  test: { label: 'Test', type: 'blue' },
}

// ─── Component ──────────────────────────────────────────────────────────────

type Tab = 'logs' | 'templates' | 'test'

export function EmailsPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('logs')
  const [search, setSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  // Logs query
  const { data: logs = [], isLoading } = useEmailLogs({
    template: templateFilter !== 'all' ? templateFilter : undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  })

  // Filtered logs
  const filteredLogs = useMemo(() => {
    if (!search) return logs
    const s = search.toLowerCase()
    return logs.filter(l =>
      l.to_email.toLowerCase().includes(s) ||
      l.subject.toLowerCase().includes(s) ||
      (l.template_slug ?? '').toLowerCase().includes(s)
    )
  }, [logs, search])

  // Test email state
  const [testEmail, setTestEmail] = useState('')
  const [testTemplate, setTestTemplate] = useState('payment_reminder')
  const sendTest = useSendTestEmail()

  // Preview modal
  const [previewTemplate, setPreviewTemplate] = useState<string | null>(null)

  const handleSendTest = async () => {
    if (!testEmail) return toast.error('Entrez un email destinataire')
    const meta = TEMPLATE_META.find(t => t.id === testTemplate)
    if (!meta) return

    try {
      await sendTest.mutateAsync({
        to: testEmail,
        template: testTemplate,
        template_data: { ...meta.sampleData },
      })
      toast.success(`Email test envoye a ${testEmail}`)
    } catch {
      toast.error("Erreur lors de l'envoi")
    }
  }

  const tabs: Array<{ id: Tab; label: string; icon: typeof Mail }> = [
    { id: 'logs', label: t('emails.tabs.logs', 'Historique'), icon: Mail },
    { id: 'templates', label: t('emails.tabs.templates', 'Templates'), icon: FileText },
    { id: 'test', label: t('emails.tabs.test', 'Envoi test'), icon: TestTube },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('emails.title', 'Gestion Emails')}
        subtitle={t('emails.subtitle', 'Templates, historique et envoi test')}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-immo-border-default">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id
                ? 'border-[#0579DA] text-[#0579DA]'
                : 'border-transparent text-immo-text-secondary hover:text-immo-text-primary'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'logs' && (
        <LogsTab
          logs={filteredLogs}
          isLoading={isLoading}
          search={search}
          onSearchChange={setSearch}
          templateFilter={templateFilter}
          onTemplateFilterChange={setTemplateFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      )}

      {tab === 'templates' && (
        <TemplatesTab
          previewTemplate={previewTemplate}
          onPreview={setPreviewTemplate}
        />
      )}

      {tab === 'test' && (
        <TestTab
          email={testEmail}
          onEmailChange={setTestEmail}
          template={testTemplate}
          onTemplateChange={setTestTemplate}
          onSend={handleSendTest}
          isSending={sendTest.isPending}
        />
      )}
    </div>
  )
}

// ─── Logs Tab ───────────────────────────────────────────────────────────────

function LogsTab({
  logs,
  isLoading,
  search,
  onSearchChange,
  templateFilter,
  onTemplateFilterChange,
  statusFilter,
  onStatusFilterChange,
}: {
  logs: EmailLog[]
  isLoading: boolean
  search: string
  onSearchChange: (v: string) => void
  templateFilter: string
  onTemplateFilterChange: (v: string) => void
  statusFilter: string
  onStatusFilterChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-immo-text-muted" />
          <input
            type="text"
            placeholder="Rechercher par email, sujet..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-immo-border-default bg-immo-bg-card py-2 ps-10 pe-4 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-[#0579DA] focus:outline-none"
          />
        </div>
        <select
          value={templateFilter}
          onChange={e => onTemplateFilterChange(e.target.value)}
          className="rounded-lg border border-immo-border-default bg-immo-bg-card px-3 py-2 text-sm text-immo-text-primary focus:border-[#0579DA] focus:outline-none"
        >
          <option value="all">Tous les templates</option>
          {TEMPLATE_META.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => onStatusFilterChange(e.target.value)}
          className="rounded-lg border border-immo-border-default bg-immo-bg-card px-3 py-2 text-sm text-immo-text-primary focus:border-[#0579DA] focus:outline-none"
        >
          <option value="all">Tous les statuts</option>
          <option value="sent">Envoye</option>
          <option value="failed">Echec</option>
          <option value="test">Test</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-12 text-center">
          <Mail className="mx-auto h-10 w-10 text-immo-text-muted mb-3" />
          <p className="text-sm text-immo-text-muted">Aucun email envoye</p>
        </Card>
      ) : (
        <Card noPadding className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-immo-border-default bg-immo-bg-primary/50">
                <th className="px-4 py-3 text-start font-medium text-immo-text-secondary">Date</th>
                <th className="px-4 py-3 text-start font-medium text-immo-text-secondary">Destinataire</th>
                <th className="px-4 py-3 text-start font-medium text-immo-text-secondary">Sujet</th>
                <th className="px-4 py-3 text-start font-medium text-immo-text-secondary">Template</th>
                <th className="px-4 py-3 text-start font-medium text-immo-text-secondary">Statut</th>
                <th className="px-4 py-3 text-start font-medium text-immo-text-secondary">Provider</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const statusKey = log.status ?? 'unknown'
                const statusConf = STATUS_CONFIG[statusKey] ?? { label: statusKey, type: 'muted' as const }
                const templateMeta = TEMPLATE_META.find(t => t.id === log.template_slug)
                return (
                  <tr key={log.id} className="border-b border-immo-border-default/50 hover:bg-immo-bg-primary/30">
                    <td className="px-4 py-3 text-immo-text-muted whitespace-nowrap">
                      {log.created_at ? format(new Date(log.created_at), 'dd/MM/yy HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3 text-immo-text-primary font-medium">{log.to_email}</td>
                    <td className="px-4 py-3 text-immo-text-primary max-w-[300px] truncate">{log.subject}</td>
                    <td className="px-4 py-3">
                      {templateMeta ? (
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${templateMeta.color}`}>
                          {templateMeta.label}
                        </span>
                      ) : (
                        <span className="text-immo-text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={statusConf.label} type={statusConf.type} />
                    </td>
                    <td className="px-4 py-3 text-immo-text-muted text-xs">{log.error_message ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-immo-text-muted text-end">{logs.length} email(s)</p>
    </div>
  )
}

// ─── Templates Tab ──────────────────────────────────────────────────────────

function TemplatesTab({
  previewTemplate,
  onPreview,
}: {
  previewTemplate: string | null
  onPreview: (id: string | null) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TEMPLATE_META.map(tmpl => {
          const Icon = tmpl.icon
          return (
            <Card
              key={tmpl.id}
              className="space-y-3 transition-colors hover:border-[#0579DA]/30"
            >
              <div className="flex items-start justify-between">
                <div className={`rounded-lg p-2 ${tmpl.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-md bg-immo-bg-primary px-2 py-0.5 text-[10px] font-medium text-immo-text-muted uppercase tracking-wide">
                  {tmpl.trigger}
                </span>
              </div>
              <div>
                <h3 className="font-semibold text-immo-text-primary text-sm">{tmpl.label}</h3>
                <p className="text-xs text-immo-text-muted mt-1 leading-relaxed">{tmpl.description}</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPreview(previewTemplate === tmpl.id ? null : tmpl.id)}
                  className="text-xs gap-1"
                >
                  <Eye className="h-3 w-3" />
                  {previewTemplate === tmpl.id ? 'Fermer' : 'Apercu'}
                </Button>
              </div>

              {/* Preview */}
              {previewTemplate === tmpl.id && (
                <div className="mt-3 rounded-lg border border-immo-border-default overflow-hidden">
                  <div className="bg-immo-bg-primary px-3 py-1.5 text-[10px] font-medium text-immo-text-muted uppercase tracking-wider border-b border-immo-border-default">
                    Apercu avec donnees exemple
                  </div>
                  <div className="bg-white p-1">
                    <TemplatePreview sampleData={tmpl.sampleData} />
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ─── Template Preview (renders via edge function call) ───────────────────────

function TemplatePreview({ sampleData }: { sampleData: Record<string, unknown> }) {
  const fields = Object.entries(sampleData)

  return (
    <div className="p-3 space-y-2">
      <div className="text-center py-3">
        <div className="inline-block bg-[#0579DA] text-white rounded-lg px-3 py-1.5 text-sm font-bold">IP</div>
        <p className="text-[#0579DA] font-semibold text-sm mt-2">IMMO PRO-X</p>
      </div>
      <div className="border border-gray-200 rounded-lg p-3 space-y-1.5">
        {fields.map(([key, value]) => (
          <div key={key} className="flex justify-between text-xs">
            <span className="text-gray-400 uppercase text-[10px]">{key.replace(/_/g, ' ')}</span>
            <span className="text-gray-700 font-medium">{String(value)}</span>
          </div>
        ))}
      </div>
      <p className="text-center text-gray-400 text-[10px] mt-2">IMMO PRO-X — CRM Immobilier</p>
    </div>
  )
}

// ─── Test Tab ───────────────────────────────────────────────────────────────

function TestTab({
  email,
  onEmailChange,
  template,
  onTemplateChange,
  onSend,
  isSending,
}: {
  email: string
  onEmailChange: (v: string) => void
  template: string
  onTemplateChange: (v: string) => void
  onSend: () => void
  isSending: boolean
}) {
  const selectedMeta = TEMPLATE_META.find(t => t.id === template)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-5 p-6">
        <h3 className="font-semibold text-immo-text-primary flex items-center gap-2">
          <TestTube className="h-4 w-4 text-[#0579DA]" />
          Envoyer un email de test
        </h3>

        {/* Template select */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-immo-text-secondary uppercase tracking-wide">Template</label>
          <select
            value={template}
            onChange={e => onTemplateChange(e.target.value)}
            className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2.5 text-sm text-immo-text-primary focus:border-[#0579DA] focus:outline-none"
          >
            {TEMPLATE_META.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          {selectedMeta && (
            <p className="text-xs text-immo-text-muted">{selectedMeta.description}</p>
          )}
        </div>

        {/* Email input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-immo-text-secondary uppercase tracking-wide">Email destinataire</label>
          <input
            type="email"
            value={email}
            onChange={e => onEmailChange(e.target.value)}
            placeholder="test@example.com"
            className="w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2.5 text-sm text-immo-text-primary placeholder:text-immo-text-muted focus:border-[#0579DA] focus:outline-none"
          />
        </div>

        {/* Send button */}
        <Button
          onClick={onSend}
          disabled={isSending || !email}
          variant="blue"
          className="w-full gap-2"
        >
          {isSending ? (
            <LoadingSpinner />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isSending ? 'Envoi en cours...' : 'Envoyer le test'}
        </Button>

        <p className="text-xs text-immo-text-muted">
          L'email sera envoye avec le statut "test" et apparaitra dans l'historique.
        </p>
      </Card>

      {/* Sample data preview */}
      {selectedMeta && (
        <Card className="space-y-3 p-6">
          <h3 className="text-sm font-semibold text-immo-text-primary">Donnees exemple utilisees</h3>
          <p className="text-xs text-immo-text-muted">Ces valeurs remplacent les variables du template lors de l'envoi de test.</p>
          <div className="divide-y divide-immo-border-default/60 rounded-lg border border-immo-border-default bg-immo-bg-primary">
            {Object.entries(selectedMeta.sampleData).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <span className="text-immo-text-muted">{key.replace(/_/g, ' ')}</span>
                <span className="truncate text-immo-text-primary font-medium">{String(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
