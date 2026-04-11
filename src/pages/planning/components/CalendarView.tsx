import { useMemo } from 'react'
import { MapPin, Building2, Video, Clock } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, getDay, addDays, startOfWeek } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Visit {
  id: string
  scheduled_at: string
  visit_type: string
  status: string
  client_name: string
  agent_name: string
  project_name: string | null
}

const TYPE_ICONS: Record<string, typeof MapPin> = { on_site: MapPin, office: Building2, virtual: Video }
const STATUS_COLORS: Record<string, string> = {
  planned: 'bg-immo-accent-blue/10 border-immo-accent-blue/30 text-immo-accent-blue',
  confirmed: 'bg-immo-accent-green/10 border-immo-accent-green/30 text-immo-accent-green',
  completed: 'bg-immo-text-muted/10 border-immo-text-muted/30 text-immo-text-muted',
  cancelled: 'bg-immo-status-red/10 border-immo-status-red/30 text-immo-status-red',
  rescheduled: 'bg-immo-status-orange/10 border-immo-status-orange/30 text-immo-status-orange',
}
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

interface Props {
  visits: Visit[]
  currentMonth: Date
  onVisitClick?: (visit: Visit) => void
}

export function CalendarView({ visits, currentMonth, onVisitClick }: Props) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { locale: fr })
    const calEnd = addDays(endOfMonth(currentMonth), 6 - getDay(monthEnd))

    return eachDayOfInterval({ start: calStart, end: calEnd > monthEnd ? calEnd : addDays(monthEnd, 7 - getDay(monthEnd)) })
  }, [currentMonth])

  function getVisitsForDay(day: Date) {
    return visits.filter(v => isSameDay(new Date(v.scheduled_at), day))
  }

  return (
    <div className="rounded-xl border border-immo-border-default bg-immo-bg-card overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-immo-border-default bg-immo-bg-primary">
        {DAYS.map(d => (
          <div key={d} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-immo-text-muted">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayVisits = getVisitsForDay(day)
          const isCurrentMonth = isSameMonth(day, currentMonth)
          const isToday = isSameDay(day, new Date())

          return (
            <div key={i} className={`min-h-[100px] border-b border-r border-immo-border-default p-1 ${!isCurrentMonth ? 'bg-immo-bg-primary/50' : ''}`}>
              <div className={`mb-1 text-right text-[11px] ${isToday ? 'flex h-6 w-6 ml-auto items-center justify-center rounded-full bg-immo-accent-green text-white font-bold' : isCurrentMonth ? 'text-immo-text-primary' : 'text-immo-text-muted/50'}`}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayVisits.slice(0, 3).map(v => {
                  const Icon = TYPE_ICONS[v.visit_type] ?? Clock
                  const color = STATUS_COLORS[v.status] ?? STATUS_COLORS.planned
                  return (
                    <button key={v.id} onClick={() => onVisitClick?.(v)}
                      className={`flex w-full items-center gap-1 rounded border px-1 py-0.5 text-left text-[9px] leading-tight ${color}`}>
                      <Icon className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{v.client_name}</span>
                    </button>
                  )
                })}
                {dayVisits.length > 3 && (
                  <span className="block text-center text-[9px] text-immo-text-muted">+{dayVisits.length - 3}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
