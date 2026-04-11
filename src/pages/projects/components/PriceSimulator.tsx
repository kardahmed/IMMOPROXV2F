import { useState, useMemo } from 'react'
import { Modal } from '@/components/common'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatPrice } from '@/lib/constants'

interface PriceSimulatorProps {
  isOpen: boolean
  onClose: () => void
  unitCode: string
  basePrice: number
}

export function PriceSimulator({ isOpen, onClose, unitCode, basePrice }: PriceSimulatorProps) {
  const [discount, setDiscount] = useState('0')
  const [installments, setInstallments] = useState('12')
  const [downPayment, setDownPayment] = useState('30')

  const simulation = useMemo(() => {
    const discountPct = Math.min(100, Math.max(0, Number(discount) || 0))
    const numInstallments = Math.max(1, Number(installments) || 12)
    const downPct = Math.min(100, Math.max(0, Number(downPayment) || 0))

    const discountAmount = basePrice * (discountPct / 100)
    const finalPrice = basePrice - discountAmount
    const downAmount = finalPrice * (downPct / 100)
    const remaining = finalPrice - downAmount
    const monthlyAmount = numInstallments > 0 ? remaining / numInstallments : 0

    const schedule = Array.from({ length: numInstallments }, (_, i) => ({
      number: i + 1,
      amount: Math.round(monthlyAmount),
    }))

    return { discountAmount, finalPrice, downAmount, remaining, monthlyAmount, schedule }
  }, [basePrice, discount, installments, downPayment])

  const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Simulation de prix" subtitle={`Unite ${unitCode}`} size="lg">
      <div className="grid grid-cols-2 gap-6">
        {/* Left: inputs */}
        <div className="space-y-4">
          <div className="rounded-lg border border-immo-border-default bg-immo-bg-primary p-4">
            <p className="text-xs text-immo-text-muted">Prix de base</p>
            <p className="text-xl font-bold text-immo-text-primary">{formatPrice(basePrice)}</p>
          </div>

          <div>
            <Label className="text-xs text-immo-text-muted">Remise (%)</Label>
            <Input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(e.target.value)} className={inputClass} />
          </div>

          <div>
            <Label className="text-xs text-immo-text-muted">Apport initial (%)</Label>
            <Input type="number" min="0" max="100" value={downPayment} onChange={e => setDownPayment(e.target.value)} className={inputClass} />
          </div>

          <div>
            <Label className="text-xs text-immo-text-muted">Nombre d'echeances</Label>
            <Input type="number" min="1" max="120" value={installments} onChange={e => setInstallments(e.target.value)} className={inputClass} />
          </div>
        </div>

        {/* Right: result */}
        <div className="space-y-4">
          <div className="rounded-xl border border-immo-accent-green/30 bg-immo-accent-green/5 p-4">
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-immo-text-muted">Prix de base</span>
                <span className="text-sm text-immo-text-primary">{formatPrice(basePrice)}</span>
              </div>
              {simulation.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-xs text-immo-status-red">Remise ({discount}%)</span>
                  <span className="text-sm text-immo-status-red">- {formatPrice(simulation.discountAmount)}</span>
                </div>
              )}
              <div className="border-t border-immo-border-default pt-2">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-immo-text-primary">Prix final</span>
                  <span className="text-lg font-bold text-immo-accent-green">{formatPrice(simulation.finalPrice)}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-immo-text-muted">Apport ({downPayment}%)</span>
                <span className="text-sm text-immo-text-primary">{formatPrice(simulation.downAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-immo-text-muted">Reste a financer</span>
                <span className="text-sm text-immo-text-primary">{formatPrice(simulation.remaining)}</span>
              </div>
              <div className="rounded-lg bg-immo-accent-green/10 p-3">
                <p className="text-xs text-immo-text-muted">Echeance mensuelle</p>
                <p className="text-xl font-bold text-immo-accent-green">{formatPrice(Math.round(simulation.monthlyAmount))}</p>
                <p className="text-[10px] text-immo-text-muted">x {installments} mois</p>
              </div>
            </div>
          </div>

          {/* Mini schedule preview */}
          <div className="max-h-[150px] overflow-y-auto rounded-lg border border-immo-border-default">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-immo-bg-card-hover">
                <tr>
                  <th className="px-3 py-1.5 text-left text-immo-text-muted">#</th>
                  <th className="px-3 py-1.5 text-right text-immo-text-muted">Montant</th>
                </tr>
              </thead>
              <tbody>
                {simulation.schedule.slice(0, 24).map(s => (
                  <tr key={s.number} className="border-t border-immo-bg-card-hover">
                    <td className="px-3 py-1 text-immo-text-muted">{s.number}</td>
                    <td className="px-3 py-1 text-right text-immo-text-primary">{formatPrice(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  )
}
