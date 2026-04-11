import { X, CheckCircle } from 'lucide-react'
import { formatPrice } from '@/lib/constants'
import type { Unit } from '@/types'

interface Props {
  units: Unit[]
  onRemove: (id: string) => void
  onClose: () => void
}

const UNIT_STATUS_LABELS: Record<string, string> = { available: 'Disponible', reserved: 'Reserve', sold: 'Vendu', blocked: 'Bloque' }
const UNIT_STATUS_COLORS: Record<string, string> = { available: 'text-immo-accent-green', reserved: 'text-immo-status-orange', sold: 'text-immo-status-red', blocked: 'text-immo-text-muted' }

export function UnitComparator({ units, onRemove, onClose }: Props) {
  if (units.length < 2) return null

  const rows: Array<{ label: string; values: (string | number | null)[] }> = [
    { label: 'Code', values: units.map(u => u.code) },
    { label: 'Type', values: units.map(u => u.type) },
    { label: 'Standing', values: units.map(u => u.subtype) },
    { label: 'Batiment', values: units.map(u => u.building ?? '-') },
    { label: 'Etage', values: units.map(u => u.floor ?? '-') },
    { label: 'Surface (m²)', values: units.map(u => u.surface ?? 0) },
    { label: 'Prix', values: units.map(u => formatPrice(u.price ?? 0)) },
    { label: 'Prix/m²', values: units.map(u => (u.surface ?? 0) > 0 ? formatPrice(Math.round((u.price ?? 0) / (u.surface ?? 1))) : '-') },
    { label: 'Statut', values: units.map(u => UNIT_STATUS_LABELS[u.status] ?? u.status) },
  ]

  // Find best value per row
  function getBestIndex(rowIdx: number): number | null {
    const row = rows[rowIdx]
    if (row.label === 'Prix' || row.label === 'Prix/m²') {
      const nums = units.map(u => row.label === 'Prix' ? (u.price ?? 0) : ((u.surface ?? 0) > 0 ? (u.price ?? 0) / (u.surface ?? 1) : Infinity))
      const min = Math.min(...nums)
      return nums.indexOf(min)
    }
    if (row.label === 'Surface (m²)') {
      const max = Math.max(...units.map(u => u.surface ?? 0))
      return units.findIndex(u => (u.surface ?? 0) === max)
    }
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-3xl rounded-t-2xl bg-immo-bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-immo-border-default px-5 py-3">
          <h3 className="text-sm font-semibold text-immo-text-primary">Comparatif ({units.length} unites)</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-immo-text-muted hover:bg-immo-bg-card-hover"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-x-auto p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-immo-border-default">
                <th className="pb-2 text-left text-xs font-medium text-immo-text-muted w-[120px]">Critere</th>
                {units.map(u => (
                  <th key={u.id} className="pb-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-semibold text-immo-text-primary">{u.code}</span>
                      <button onClick={() => onRemove(u.id)} className="rounded p-0.5 text-immo-text-muted hover:text-immo-status-red"><X className="h-3 w-3" /></button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const bestIdx = getBestIndex(ri)
                return (
                  <tr key={row.label} className="border-b border-immo-border-default/50">
                    <td className="py-2 text-xs text-immo-text-muted">{row.label}</td>
                    {row.values.map((val, ci) => (
                      <td key={ci} className={`py-2 text-center text-xs ${bestIdx === ci ? 'font-bold text-immo-accent-green' : row.label === 'Statut' ? UNIT_STATUS_COLORS[units[ci].status] ?? '' : 'text-immo-text-primary'}`}>
                        {val}
                        {bestIdx === ci && row.label !== 'Statut' && <CheckCircle className="ml-1 inline h-3 w-3" />}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
