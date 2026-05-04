import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Send, Calendar, Mail, ChevronRight } from 'lucide-react'
import { useEmailCampaigns, useEmailTemplates, useSaveCampaign, useSendCampaign } from '@/hooks/useEmailMarketing'
import { LoadingSpinner, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/common'
import { SegmentBuilder } from '../components/SegmentBuilder'
import { CampaignDetail } from '../components/CampaignDetail'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import type { SegmentRules, EmailCampaign } from '@/hooks/useEmailMarketing'

const CAMPAIGN_STATUS: Record<string, { label: string; type: 'green' | 'orange' | 'blue' | 'red' | 'muted' }> = {
  draft: { label: 'Brouillon', type: 'muted' },
  scheduled: { label: 'Planifiée', type: 'blue' },
  sending: { label: 'En cours', type: 'orange' },
  sent: { label: 'Envoyée', type: 'green' },
  cancelled: { label: 'Annulée', type: 'red' },
}

export function EmailCampaignsTab() {
  const { t } = useTranslation()
  const { data: campaigns = [], isLoading } = useEmailCampaigns()
  const { data: templates = [] } = useEmailTemplates()
  const saveCampaign = useSaveCampaign()
  const sendCampaign = useSendCampaign()

  const [showCreate, setShowCreate] = useState(false)
  const [detailCampaign, setDetailCampaign] = useState<EmailCampaign | null>(null)

  // Create form state
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [segmentRules, setSegmentRules] = useState<SegmentRules>({})
  const [scheduledAt, setScheduledAt] = useState('')
  const [step, setStep] = useState(1)

  const resetForm = () => {
    setName(''); setSubject(''); setTemplateId(''); setSegmentRules({}); setScheduledAt(''); setStep(1)
  }

  const handleCreate = async () => {
    if (!name.trim() || !subject.trim()) { toast.error('Nom et objet requis'); return }
    if (!templateId) { toast.error('Sélectionnez un template'); return }
    try {
      const id = await saveCampaign.mutateAsync({
        name, subject,
        template_id: templateId,
        segment_rules: segmentRules,
        scheduled_at: scheduledAt || null,
        status: scheduledAt ? 'scheduled' : 'draft',
      })
      toast.success('Campagne créée')
      setShowCreate(false)
      resetForm()
      // If no schedule, offer to send now
      if (!scheduledAt && id) {
        const go = window.confirm('Envoyer la campagne maintenant ?')
        if (go) {
          await sendCampaign.mutateAsync(id)
          toast.success('Campagne en cours d\'envoi')
        }
      }
    } catch {
      toast.error('Erreur lors de la création')
    }
  }

  const handleSendNow = async (campaignId: string) => {
    try {
      await sendCampaign.mutateAsync(campaignId)
      toast.success('Campagne en cours d\'envoi')
    } catch {
      toast.error('Erreur lors de l\'envoi')
    }
  }

  // Detail view
  if (detailCampaign) {
    return <CampaignDetail campaign={detailCampaign} onBack={() => setDetailCampaign(null)} />
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-immo-text-primary">Campagnes Email</h3>
          <p className="text-xs text-immo-text-muted mt-0.5">{campaigns.length} campagne(s)</p>
        </div>
        <Button onClick={() => { resetForm(); setShowCreate(true) }} className="gap-1.5 bg-immo-accent-green hover:bg-immo-accent-green/90 text-white text-xs">
          <Plus className="h-3.5 w-3.5" /> Nouvelle campagne
        </Button>
      </div>

      {/* Campaigns list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingSpinner /></div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-immo-border-default p-12 text-center">
          <Mail className="mx-auto h-10 w-10 text-immo-text-muted mb-3" />
          <p className="text-sm font-medium text-immo-text-primary">Aucune campagne</p>
          <p className="text-xs text-immo-text-muted mt-1">Créez votre première campagne email</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map(c => {
            const st = CAMPAIGN_STATUS[c.status] ?? { label: c.status, type: 'muted' as const }
            const openRate = c.total_sent > 0 ? ((c.total_opened / c.total_sent) * 100).toFixed(1) : '—'
            const clickRate = c.total_sent > 0 ? ((c.total_clicked / c.total_sent) * 100).toFixed(1) : '—'
            return (
              <div
                key={c.id}
                onClick={() => setDetailCampaign(c)}
                className="flex items-center gap-4 rounded-xl border border-immo-border-default bg-immo-bg-card p-4 hover:border-immo-accent-green/30 cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-immo-text-primary truncate">{c.name}</h4>
                    <StatusBadge label={st.label} type={st.type} />
                  </div>
                  <p className="text-xs text-immo-text-muted mt-0.5 truncate">
                    {c.subject} · Template: {c.marketing_email_templates?.name ?? '—'}
                  </p>
                  <p className="text-[10px] text-immo-text-muted mt-1">
                    {c.sent_at ? `Envoyée le ${format(new Date(c.sent_at), 'dd/MM/yy HH:mm')}` :
                     c.scheduled_at ? `Planifiée le ${format(new Date(c.scheduled_at), 'dd/MM/yy HH:mm')}` :
                     `Créée le ${format(new Date(c.created_at), 'dd/MM/yy')}`}
                  </p>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-lg font-bold text-immo-text-primary">{c.total_sent}</p>
                    <p className="text-[10px] text-immo-text-muted">Envoyés</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#0579DA]">{openRate}%</p>
                    <p className="text-[10px] text-immo-text-muted">Ouvertures</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-[#0579DA]">{clickRate}%</p>
                    <p className="text-[10px] text-immo-text-muted">Clics</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                  {c.status === 'draft' && (
                    <Button variant="outline" size="sm" onClick={() => handleSendNow(c.id)} className="gap-1 text-xs" disabled={sendCampaign.isPending}>
                      <Send className="h-3 w-3" /> Envoyer
                    </Button>
                  )}
                  <ChevronRight className="h-4 w-4 text-immo-text-muted" />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); resetForm() }} title="Nouvelle campagne email" size="lg">
        <div className="space-y-5">
          {/* Steps indicator */}
          <div className="flex gap-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${step >= s ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`} />
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-immo-text-primary">1. Informations</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-immo-text-secondary">Nom de la campagne</label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promo Ramadan 2026" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-immo-text-secondary">Objet de l'email</label>
                  <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex: Offre spéciale — Réservez maintenant !" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-immo-text-secondary">Template</label>
                  <select
                    value={templateId}
                    onChange={e => setTemplateId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2.5 text-sm text-immo-text-primary focus:border-immo-accent-green focus:outline-none"
                  >
                    <option value="">— Sélectionner un template —</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {templates.length === 0 && (
                    <p className="text-xs text-immo-status-orange mt-1">Créez d'abord un template dans l'onglet Templates</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => { if (!name || !subject || !templateId) { toast.error(t('toast.fill_all_fields')); return } setStep(2) }} className="gap-1 text-xs bg-immo-accent-green text-white">
                  Suivant <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-immo-text-primary">2. Audience</h4>
              <SegmentBuilder rules={segmentRules} onChange={setSegmentRules} />
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(1)} className="text-xs">Retour</Button>
                <Button onClick={() => setStep(3)} className="gap-1 text-xs bg-immo-accent-green text-white">
                  Suivant <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-immo-text-primary">3. Planification</h4>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <button
                    onClick={() => setScheduledAt('')}
                    className={`flex-1 rounded-xl border p-4 text-start transition-colors ${!scheduledAt ? 'border-immo-accent-green bg-immo-accent-green/5' : 'border-immo-border-default hover:border-immo-text-muted'}`}
                  >
                    <Send className="h-5 w-5 text-immo-accent-green mb-1" />
                    <p className="text-sm font-medium text-immo-text-primary">Envoyer maintenant</p>
                    <p className="text-xs text-immo-text-muted">L'envoi démarre immédiatement</p>
                  </button>
                  <button
                    onClick={() => setScheduledAt(new Date(Date.now() + 86400000).toISOString().slice(0, 16))}
                    className={`flex-1 rounded-xl border p-4 text-start transition-colors ${scheduledAt ? 'border-[#0579DA] bg-[#0579DA]/5' : 'border-immo-border-default hover:border-immo-text-muted'}`}
                  >
                    <Calendar className="h-5 w-5 text-[#0579DA] mb-1" />
                    <p className="text-sm font-medium text-immo-text-primary">Planifier</p>
                    <p className="text-xs text-immo-text-muted">Choisir une date et heure</p>
                  </button>
                </div>
                {scheduledAt && (
                  <div>
                    <label className="text-xs font-medium text-immo-text-secondary">Date et heure d'envoi</label>
                    <Input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={e => setScheduledAt(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)} className="text-xs">Retour</Button>
                <Button onClick={handleCreate} disabled={saveCampaign.isPending} className="gap-1 text-xs bg-immo-accent-green text-white">
                  {saveCampaign.isPending ? <LoadingSpinner /> : <Send className="h-3.5 w-3.5" />}
                  {scheduledAt ? 'Planifier la campagne' : 'Créer et envoyer'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
