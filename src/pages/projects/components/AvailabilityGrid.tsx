import { useMemo } from 'react'
import { formatPrice } from '@/lib/constants'

interface Unit {
  id: string
  code: string
  status: string
  floor: number | null
  building: string | null
  surface: number | null
  price: number | null
  type: string
  subtype: string | null
}

interface AvailabilityGridProps {
  units: Unit[]
  onUnitClick?: (unitId: string) => void
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  available: { bg: 'bg-emerald-50 hover:bg-emerald-100', text: 'text-emerald-700', label: 'Dispo' },
  reserved: { bg: 'bg-amber-50 hover:bg-amber-100', text: 'text-amber-700', label: 'Reserve' },
  sold: { bg: 'bg-red-50 hover:bg-red-100', text: 'text-red-700', label: 'Vendu' },
  blocked: { bg: 'bg-gray-100', text: 'text-gray-400', label: 'Bloque' },
}

export function AvailabilityGrid({ units, onUnitClick }: AvailabilityGridProps) {
  // Group by building and floor
  const grid = useMemo(() => {
    const buildings = new Map<string, Map<number, Unit[]>>()

    for (const unit of units) {
      const bldg = unit.building || 'Principal'
      const floor = unit.floor ?? 0

      if (!buildings.has(bldg)) buildings.set(bldg, new Map())
      const floors = buildings.get(bldg)!
      if (!floors.has(floor)) floors.set(floor, [])
      floors.get(floor)!.push(unit)
    }

    // Sort buildings and floors
    return Array.from(buildings.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, floors]) => ({
        name,
        floors: Array.from(floors.entries())
          .sort(([a], [b]) => b - a) // Highest floor first
          .map(([floor, floorUnits]) => ({
            floor,
            units: floorUnits.sort((a, b) => a.code.localeCompare(b.code)),
          })),
      }))
  }, [units])

  // Stats
  const stats = useMemo(() => {
    const total = units.length
    const available = units.filter(u => u.status === 'available').length
    const reserved = units.filter(u => u.status === 'reserved').length
    const sold = units.filter(u => u.status === 'sold').length
    return { total, available, reserved, sold }
  }, [units])

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-emerald-400" />
          <span className="text-xs text-immo-text-muted">Disponible ({stats.available})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-amber-400" />
          <span className="text-xs text-immo-text-muted">Reserve ({stats.reserved})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-red-400" />
          <span className="text-xs text-immo-text-muted">Vendu ({stats.sold})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-gray-300" />
          <span className="text-xs text-immo-text-muted">Bloque</span>
        </div>
        <span className="ml-auto text-xs font-semibold text-immo-text-secondary">
          {stats.available}/{stats.total} disponibles
        </span>
      </div>

      {/* Grid per building */}
      {grid.map(building => (
        <div key={building.name} className="rounded-xl border border-immo-border-default bg-immo-bg-card overflow-hidden">
          <div className="border-b border-immo-border-default bg-immo-bg-card-hover px-4 py-2.5">
            <h4 className="text-xs font-semibold text-immo-text-primary">{building.name}</h4>
          </div>
          <div className="p-3">
            {building.floors.map(({ floor, units: floorUnits }) => (
              <div key={floor} className="mb-2 flex items-start gap-3">
                {/* Floor label */}
                <div className="flex h-8 w-14 shrink-0 items-center justify-center rounded-md bg-immo-bg-primary text-[11px] font-semibold text-immo-text-muted">
                  {floor === 0 ? 'RDC' : floor === -1 ? 'SS' : `Et. ${floor}`}
                </div>
                {/* Units */}
                <div className="flex flex-wrap gap-2">
                  {floorUnits.map(unit => {
                    const st = STATUS_COLORS[unit.status] ?? STATUS_COLORS.blocked
                    return (
                      <button
                        key={unit.id}
                        onClick={() => onUnitClick?.(unit.id)}
                        className={`group relative rounded-lg border border-transparent px-3 py-2 text-left transition-all ${st.bg}`}
                        title={`${unit.code} — ${st.label} — ${unit.surface ?? '?'}m² — ${unit.price ? formatPrice(unit.price) : '-'}`}
                      >
                        <p className={`text-xs font-semibold ${st.text}`}>{unit.code}</p>
                        <p className="text-[9px] text-immo-text-muted">{unit.surface ?? '?'}m²</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
