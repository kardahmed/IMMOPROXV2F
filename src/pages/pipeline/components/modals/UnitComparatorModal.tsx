import { Modal } from '@/components/common'
import { formatPrice } from '@/lib/constants'
import { UNIT_TYPE_LABELS } from '@/types'
import type { UnitType } from '@/types'

interface ComparatorUnit {
  id: string
  code: string
  type: UnitType
  subtype: string | null
  surface: number | null
  floor: number | null
  building: string | null
  price: number | null
  delivery_date: string | null
  project_name: string
}

interface UnitComparatorModalProps {
  isOpen: boolean
  onClose: () => void
  units: ComparatorUnit[]
}

export function UnitComparatorModal({ isOpen, onClose, units }: UnitComparatorModalProps) {
  if (units.length === 0) return null

  const rows: Array<{ label: string; values: (string | null)[] }> = [
    { label: 'Code', values: units.map(u => u.code) },
    { label: 'Projet', values: units.map(u => u.project_name) },
    { label: 'Type', values: units.map(u => UNIT_TYPE_LABELS[u.type] ?? u.type) },
    { label: 'Sous-type', values: units.map(u => u.subtype ?? '-') },
    { label: 'Surface', values: units.map(u => u.surface ? `${u.surface} m²` : '-') },
    { label: 'Etage', values: units.map(u => u.floor != null ? String(u.floor) : '-') },
    { label: 'Batiment', values: units.map(u => u.building ?? '-') },
    { label: 'Prix', values: units.map(u => u.price ? formatPrice(u.price) : '-') },
    { label: 'Prix/m²', values: units.map(u => u.price && u.surface ? formatPrice(Math.round(u.price / u.surface)) : '-') },
    { label: 'Livraison', values: units.map(u => u.delivery_date ?? '-') },
  ]

  // Find best value per row for highlighting
  function isBest(rowIdx: number, colIdx: number): boolean {
    const row = rows[rowIdx]
    if (row.label === 'Prix' || row.label === 'Prix/m²') {
      // Lower is better
      const nums = units.map(u => {
        if (row.label === 'Prix') return u.price ?? Infinity
        return u.price && u.surface ? u.price / u.surface : Infinity
      })
      const min = Math.min(...nums)
      return nums[colIdx] === min && min < Infinity
    }
    if (row.label === 'Surface') {
      // Higher is better
      const nums = units.map(u => u.surface ?? 0)
      const max = Math.max(...nums)
      return nums[colIdx] === max && max > 0
    }
    return false
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comparateur d'unites" subtitle={`${units.length} unites selectionnees`} size="lg">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-immo-border-default">
              <th className="px-4 py-2 text-start text-[11px] font-semibold text-immo-text-muted w-[120px]">Critere</th>
              {units.map(u => (
                <th key={u.id} className="px-4 py-2 text-center text-sm font-semibold text-immo-text-primary">{u.code}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={row.label} className="border-b border-immo-bg-card-hover">
                <td className="px-4 py-2.5 text-xs font-medium text-immo-text-muted">{row.label}</td>
                {row.values.map((val, ci) => (
                  <td key={ci} className={`px-4 py-2.5 text-center text-sm ${isBest(ri, ci) ? 'font-bold text-immo-accent-green' : 'text-immo-text-primary'}`}>
                    {val}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
