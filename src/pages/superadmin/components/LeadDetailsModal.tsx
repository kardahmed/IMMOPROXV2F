import type { ReactNode } from 'react'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Mail, Phone, Building2, Calendar, UserPlus, Compass } from 'lucide-react'

type LeadStatus = 'new' | 'contacted' | 'demo_booked' | 'demo_done' | 'won' | 'lost' | 'nurture'

interface Lead {
  id: string
  full_name: string
  email: string
  phone: string
  company_name: string | null
  activity_type: string | null
  agents_count: string | null
  wilayas: string[] | null
  leads_per_month: string | null
  marketing_budget_monthly: string | null
  acquisition_channels: string[] | null
  current_tools: string | null
  decision_maker: string | null
  decision_maker_names: string | null
  frustration_score: number | null
  timeline: string | null
  message: string | null
  source: string | null
  medium: string | null
  campaign: string | null
  referrer: string | null
  status: LeadStatus
  step_completed: number
  created_at: string
}

interface Props {
  lead: Lead
  isOpen: boolean
  onClose: () => void
  onStatusChange: (status: LeadStatus) => void
  onCreateTenant: () => void
}

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nouveau',
  contacted: 'Contacte',
  demo_booked: 'RDV pris',
  demo_done: 'RDV fait',
  won: 'Converti',
  lost: 'Perdu',
  nurture: 'Nurture',
}

const ACTIVITY_LABELS: Record<string, string> = {
  agence: 'Agence immo',
  promoteur: 'Promoteur',
  freelance: 'Freelance',
  entreprise: 'Entreprise',
}

const TIMELINE_LABELS: Record<string, string> = {
  this_week: 'Cette semaine',
  this_month: 'Ce mois',
  '3_months': '3 mois',
  browsing: 'En reflexion',
}

const DECISION_MAKER_LABELS: Record<string, string> = {
  me: 'Moi-meme',
  boss: 'Mon patron',
  partners: 'Mes associes',
  committee: 'Comite de decision',
}

const CURRENT_TOOLS_LABELS: Record<string, string> = {
  excel: 'Excel',
  whatsapp: 'WhatsApp',
  crm: 'Autre CRM',
  nothing: 'Rien',
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-immo-text-secondary">{label}</div>
      <div className="mt-0.5 text-sm text-immo-text-primary">{value}</div>
    </div>
  )
}

export function LeadDetailsModal({ lead, isOpen, onClose, onStatusChange, onCreateTenant }: Props) {
  const qualified = lead.step_completed === 2

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={lead.full_name}
      subtitle={`Recu le ${new Date(lead.created_at).toLocaleString('fr-FR')}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary hover:bg-immo-bg-card-hover hover:text-immo-text-primary">
            Fermer
          </Button>
          <Button
            onClick={onCreateTenant}
            disabled={lead.status === 'won'}
            variant="blue"
            className="gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            {lead.status === 'won' ? 'Deja converti' : 'Creer tenant depuis ce lead'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Status + step badge */}
        <div className="flex items-center gap-2">
          <select
            value={lead.status}
            onChange={e => onStatusChange(e.target.value as LeadStatus)}
            className="rounded-md border border-immo-border-default bg-immo-bg-primary px-3 py-1.5 text-xs text-immo-text-primary"
          >
            {(Object.keys(STATUS_LABELS) as LeadStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          {qualified ? (
            <span className="rounded-full bg-green-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-green-400">
              Qualifie (etape 2)
            </span>
          ) : (
            <span className="rounded-full bg-gray-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Etape 1 (abandon)
            </span>
          )}
        </div>

        {/* Contact — always present */}
        <div>
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#0579DA]">Contact</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm text-immo-text-primary">
              <Mail className="h-4 w-4 shrink-0 text-immo-text-secondary" />
              <a href={`mailto:${lead.email}`} className="truncate text-[#0579DA] hover:underline">{lead.email}</a>
            </div>
            <div className="flex items-center gap-2 text-sm text-immo-text-primary">
              <Phone className="h-4 w-4 shrink-0 text-immo-text-secondary" />
              <a href={`tel:${lead.phone}`} className="text-[#0579DA] hover:underline">{lead.phone}</a>
            </div>
            {lead.phone && (
              <div className="flex items-center gap-2 text-sm text-immo-text-primary">
                <a
                  href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-400 hover:underline"
                >
                  → Ouvrir dans WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Qualification — only if step 2 done */}
        {qualified ? (
          <>
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#0579DA]">Entreprise</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Societe"
                  value={lead.company_name ? <span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" />{lead.company_name}</span> : null}
                />
                <Field label="Type activite" value={lead.activity_type ? ACTIVITY_LABELS[lead.activity_type] ?? lead.activity_type : null} />
                <Field label="Nombre d'agents" value={lead.agents_count} />
                <Field label="Wilayas" value={lead.wilayas?.join(', ') ?? null} />
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#0579DA]">Business</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Leads / mois" value={lead.leads_per_month} />
                <Field label="Budget marketing / mois" value={lead.marketing_budget_monthly} />
                <Field label="Canaux d'acquisition" value={lead.acquisition_channels?.join(', ') ?? null} />
                <Field label="Outil actuel" value={lead.current_tools ? CURRENT_TOOLS_LABELS[lead.current_tools] ?? lead.current_tools : null} />
              </div>
            </div>

            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#0579DA]">Decision</h4>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Decideur" value={lead.decision_maker ? DECISION_MAKER_LABELS[lead.decision_maker] ?? lead.decision_maker : null} />
                <Field label="Si autre, noms" value={lead.decision_maker_names} />
                <Field
                  label="Score frustration"
                  value={lead.frustration_score !== null ? `${lead.frustration_score}/10` : null}
                />
                <Field
                  label="Timeline"
                  value={lead.timeline ? <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />{TIMELINE_LABELS[lead.timeline] ?? lead.timeline}</span> : null}
                />
              </div>
            </div>

            {lead.message && (
              <div>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#0579DA]">Message</h4>
                <p className="whitespace-pre-wrap rounded-md border border-immo-border-default bg-immo-bg-primary p-3 text-sm text-immo-text-primary">
                  {lead.message}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-md border border-dashed border-immo-border-default p-4 text-center text-xs text-immo-text-secondary">
            Ce lead n'a pas complete l'etape 2 du formulaire (qualification).
            <br />
            Relance-le par WhatsApp ou email pour obtenir plus de contexte.
          </div>
        )}

        {/* Provenance — UTM + referrer */}
        {(lead.source || lead.medium || lead.campaign || lead.referrer) && (
          <div>
            <h4 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#0579DA]">
              <Compass className="h-3 w-3" />
              Provenance
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Source" value={lead.source} />
              <Field label="Medium" value={lead.medium} />
              <Field label="Campagne" value={lead.campaign} />
              <Field
                label="Referrer"
                value={lead.referrer ? <span className="break-all text-xs">{lead.referrer}</span> : null}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
