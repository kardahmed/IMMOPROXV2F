import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Modal } from '@/components/common'
import { Button } from '@/components/ui/button'
import { usePlanLimits, PLAN_LABELS, formatPlanPrice } from '../hooks/usePlanLimits'
import type { PlanKey } from '../hooks/usePlanLimits'
import toast from 'react-hot-toast'

interface ChangePlanModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  tenantName: string
  currentPlan: PlanKey
}

export function ChangePlanModal({ isOpen, onClose, tenantId, tenantName, currentPlan }: ChangePlanModalProps) {
  const { data: plans = [] } = usePlanLimits()
  const [selected, setSelected] = useState<PlanKey>(currentPlan)
  const qc = useQueryClient()

  const changePlan = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tenants')
        .update({ plan: selected } as never)
        .eq('id', tenantId)
      if (error) { handleSupabaseError(error); throw error }

      // Log action
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        await supabase.from('super_admin_logs').insert({
          super_admin_id: session.user.id,
          action: 'change_plan',
          tenant_id: tenantId,
          details: { from: currentPlan, to: selected, tenant_name: tenantName },
        } as never)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin-tenants'] })
      qc.invalidateQueries({ queryKey: ['super-admin-tenant', tenantId] })
      toast.success(`Plan de ${tenantName} change en ${PLAN_LABELS[selected].label}`)
      onClose()
    },
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Changer le plan" subtitle={tenantName} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {plans.map(p => {
            const meta = PLAN_LABELS[p.plan]
            const isSelected = selected === p.plan
            const isCurrent = currentPlan === p.plan
            return (
              <button
                key={p.plan}
                onClick={() => setSelected(p.plan)}
                className={`relative rounded-xl border p-4 text-left transition-all ${
                  isSelected
                    ? 'border-[#7C3AED] bg-[#7C3AED]/5 ring-1 ring-[#7C3AED]/30'
                    : 'border-immo-border-default hover:border-immo-text-secondary'
                }`}
              >
                {isCurrent && (
                  <span className="absolute -top-2 right-3 rounded-full bg-[#7C3AED] px-2 py-0.5 text-[9px] font-bold text-white">ACTUEL</span>
                )}
                <p className={`text-sm font-bold ${meta.color}`}>{meta.label}</p>
                <p className="mt-1 text-lg font-bold text-immo-text-primary">{formatPlanPrice(p.price_monthly)}</p>
                <div className="mt-3 space-y-1.5">
                  <LimitRow label="Agents" value={p.max_agents} />
                  <LimitRow label="Projets" value={p.max_projects} />
                  <LimitRow label="Biens" value={p.max_units} />
                  <LimitRow label="Clients" value={p.max_clients} />
                  <LimitRow label="Stockage" value={`${p.max_storage_mb} MB`} />
                </div>
                {/* Features */}
                <div className="mt-3 border-t border-immo-border-default pt-2 space-y-1">
                  {Object.entries(p.features).map(([key, enabled]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-immo-accent-green' : 'bg-immo-border-default'}`} />
                      <span className={`text-[10px] ${enabled ? 'text-immo-text-secondary' : 'text-immo-text-muted line-through'}`}>
                        {key.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </button>
            )
          })}
        </div>

        <div className="flex justify-end gap-3 border-t border-immo-border-default pt-4">
          <Button variant="ghost" onClick={onClose} className="text-immo-text-secondary">Annuler</Button>
          <Button
            onClick={() => changePlan.mutate()}
            disabled={selected === currentPlan || changePlan.isPending}
            variant="purple"
          >
            {changePlan.isPending
              ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <><Zap className="mr-1.5 h-4 w-4" /> Appliquer {PLAN_LABELS[selected]?.label}</>
            }
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function LimitRow({ label, value }: { label: string; value: number | string }) {
  const display = typeof value === 'number' && value >= 999 ? 'Illimite' : String(value)
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-immo-text-secondary">{label}</span>
      <span className="text-[11px] font-medium text-immo-text-primary">{display}</span>
    </div>
  )
}
