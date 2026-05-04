import { Mail, Users, MousePointerClick, Eye, BarChart3, ArrowLeft, CheckCircle, XCircle, Clock } from 'lucide-react'
import { useCampaignRecipients } from '@/hooks/useEmailMarketing'
import { LoadingSpinner, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { KPICard } from '@/components/common'
import { format } from 'date-fns'
import type { EmailCampaign } from '@/hooks/useEmailMarketing'

const STATUS_MAP: Record<string, { label: string; type: 'green' | 'blue' | 'orange' | 'red' | 'muted' }> = {
  pending: { label: 'En attente', type: 'muted' },
  sent: { label: 'Envoyé', type: 'green' },
  opened: { label: 'Ouvert', type: 'blue' },
  clicked: { label: 'Cliqué', type: 'green' },
  failed: { label: 'Échec', type: 'red' },
}

interface Props {
  campaign: EmailCampaign
  onBack: () => void
}

export function CampaignDetail({ campaign, onBack }: Props) {
  const { data: recipients = [], isLoading } = useCampaignRecipients(campaign.id)

  const openRate = campaign.total_sent > 0 ? ((campaign.total_opened / campaign.total_sent) * 100).toFixed(1) : '0'
  const clickRate = campaign.total_sent > 0 ? ((campaign.total_clicked / campaign.total_sent) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Retour
        </Button>
        <div className="flex-1">
          <h3 className="text-base font-bold text-immo-text-primary">{campaign.name}</h3>
          <p className="text-xs text-immo-text-muted">Objet : {campaign.subject}</p>
        </div>
        <StatusBadge
          label={campaign.status === 'sent' ? 'Envoyée' : campaign.status === 'sending' ? 'En cours' : campaign.status === 'scheduled' ? 'Planifiée' : 'Brouillon'}
          type={campaign.status === 'sent' ? 'green' : campaign.status === 'sending' ? 'orange' : 'muted'}
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<Users className="h-5 w-5" />} label="Destinataires" value={campaign.total_recipients} accent="blue" />
        <KPICard icon={<Mail className="h-5 w-5" />} label="Envoyés" value={campaign.total_sent} accent="green" />
        <KPICard icon={<Eye className="h-5 w-5" />} label={`Ouvertures (${openRate}%)`} value={campaign.total_opened} accent="blue" />
        <KPICard icon={<MousePointerClick className="h-5 w-5" />} label={`Clics (${clickRate}%)`} value={campaign.total_clicked} accent="orange" />
      </div>

      {/* Progress bars */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-immo-text-secondary">Taux d'ouverture</span>
            <span className="text-sm font-bold text-[#0579DA]">{openRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-immo-bg-primary">
            <div className="h-2 rounded-full bg-[#0579DA] transition-all" style={{ width: `${Math.min(Number(openRate), 100)}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-immo-border-default bg-immo-bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-immo-text-secondary">Taux de clics</span>
            <span className="text-sm font-bold text-[#0579DA]">{clickRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-immo-bg-primary">
            <div className="h-2 rounded-full bg-[#0579DA] transition-all" style={{ width: `${Math.min(Number(clickRate), 100)}%` }} />
          </div>
        </div>
      </div>

      {/* Recipients table */}
      <div>
        <h4 className="text-sm font-semibold text-immo-text-primary mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-immo-text-muted" />
          Destinataires ({recipients.length})
        </h4>

        {isLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : recipients.length === 0 ? (
          <div className="rounded-xl border border-immo-border-default p-8 text-center text-sm text-immo-text-muted">
            Aucun destinataire
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-immo-border-default bg-immo-bg-primary/50">
                  <th className="px-4 py-3 text-start text-xs font-medium text-immo-text-secondary">Nom</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-immo-text-secondary">Email</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-immo-text-secondary">Statut</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-immo-text-secondary">Envoyé</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-immo-text-secondary">Ouvert</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-immo-text-secondary">Cliqué</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map(r => {
                  const st = STATUS_MAP[r.status] ?? { label: r.status, type: 'muted' as const }
                  return (
                    <tr key={r.id} className="border-b border-immo-border-default/50 hover:bg-immo-bg-primary/30">
                      <td className="px-4 py-2.5 font-medium text-immo-text-primary">{r.full_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-immo-text-muted">{r.email}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge label={st.label} type={st.type} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-immo-text-muted">
                        {r.sent_at ? format(new Date(r.sent_at), 'dd/MM HH:mm') : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.opened_at ? <CheckCircle className="h-4 w-4 text-[#0579DA]" /> : <Clock className="h-4 w-4 text-immo-text-muted" />}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.clicked_at ? <CheckCircle className="h-4 w-4 text-[#0579DA]" /> : <XCircle className="h-4 w-4 text-immo-text-muted/30" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
