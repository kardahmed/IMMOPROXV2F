import { Users, Filter } from 'lucide-react'
import { useSegmentCount, useProjectsList } from '@/hooks/useEmailMarketing'
import type { SegmentRules } from '@/hooks/useEmailMarketing'
import { PIPELINE_STAGES as STAGE_LABELS } from '@/types'
import { PIPELINE_ORDER } from '@/lib/constants'

// Derived from the canonical sources — types/index.ts holds the
// label/colour map, lib/constants.ts holds the order. This component
// used to inline its own copy of the pairs which drifted whenever a
// stage was renamed; now {value, label} is built from the two
// authoritative exports.
const PIPELINE_STAGES = PIPELINE_ORDER.map(value => ({
  value,
  label: STAGE_LABELS[value]?.label ?? value,
}))

const CLIENT_SOURCES = [
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'instagram_ads', label: 'Instagram Ads' },
  { value: 'appel_entrant', label: 'Appel entrant' },
  { value: 'reception', label: 'Réception' },
  { value: 'bouche_a_oreille', label: 'Bouche à oreille' },
  { value: 'reference_client', label: 'Référence client' },
  { value: 'site_web', label: 'Site web' },
  { value: 'portail_immobilier', label: 'Portail immobilier' },
  { value: 'autre', label: 'Autre' },
]

interface Props {
  rules: SegmentRules
  onChange: (rules: SegmentRules) => void
}

export function SegmentBuilder({ rules, onChange }: Props) {
  const { data: count = 0, isLoading: countLoading } = useSegmentCount(rules)
  const { data: projects = [] } = useProjectsList()

  const toggleValue = (field: keyof SegmentRules, value: string) => {
    const current = (rules[field] ?? []) as string[]
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    onChange({ ...rules, [field]: next.length > 0 ? next : undefined })
  }

  return (
    <div className="space-y-5">
      {/* Recipient count */}
      <div className="flex items-center gap-3 rounded-xl border border-immo-accent-green/30 bg-immo-accent-green/5 px-4 py-3">
        <Users className="h-5 w-5 text-immo-accent-green" />
        <div>
          <p className="text-sm font-semibold text-immo-text-primary">
            {countLoading ? '...' : count} destinataire(s)
          </p>
          <p className="text-xs text-immo-text-muted">Clients avec email correspondant aux critères</p>
        </div>
      </div>

      {/* Pipeline stages */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-immo-text-secondary uppercase tracking-wider mb-2">
          <Filter className="h-3 w-3" /> Étape pipeline
        </label>
        <div className="flex flex-wrap gap-2">
          {PIPELINE_STAGES.map(stage => {
            const active = rules.pipeline_stages?.includes(stage.value)
            return (
              <button
                key={stage.value}
                onClick={() => toggleValue('pipeline_stages', stage.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-immo-accent-green/15 text-immo-accent-green ring-1 ring-immo-accent-green/30'
                    : 'bg-immo-bg-primary text-immo-text-muted hover:bg-immo-bg-card-hover'
                }`}
              >
                {stage.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sources */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-immo-text-secondary uppercase tracking-wider mb-2">
          <Filter className="h-3 w-3" /> Source
        </label>
        <div className="flex flex-wrap gap-2">
          {CLIENT_SOURCES.map(source => {
            const active = rules.sources?.includes(source.value)
            return (
              <button
                key={source.value}
                onClick={() => toggleValue('sources', source.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#0579DA]/15 text-[#0579DA] ring-1 ring-[#0579DA]/30'
                    : 'bg-immo-bg-primary text-immo-text-muted hover:bg-immo-bg-card-hover'
                }`}
              >
                {source.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Projects */}
      {projects.length > 0 && (
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-immo-text-secondary uppercase tracking-wider mb-2">
            <Filter className="h-3 w-3" /> Projet
          </label>
          <div className="flex flex-wrap gap-2">
            {projects.map((project: { id: string; name: string }) => {
              const active = rules.project_ids?.includes(project.id)
              return (
                <button
                  key={project.id}
                  onClick={() => toggleValue('project_ids', project.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[#7C3AED]/15 text-[#7C3AED] ring-1 ring-[#7C3AED]/30'
                      : 'bg-immo-bg-primary text-immo-text-muted hover:bg-immo-bg-card-hover'
                  }`}
                >
                  {project.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!rules.pipeline_stages?.length && !rules.sources?.length && !rules.project_ids?.length && (
        <p className="text-xs text-immo-text-muted italic">Aucun filtre = tous les clients avec un email</p>
      )}
    </div>
  )
}
