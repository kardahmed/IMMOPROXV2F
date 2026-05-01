// 3 calendar view modes (month / week / day) extracted from
// PlanningPage.tsx. Pre-extraction the page was 549 lines mixing
// state management, event-source aggregation, modal triggers AND
// 3 distinct calendar layouts. Splitting them gives each view its
// own scope and shrinks the parent file ~250 lines.

import { useEffect, useState } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, isSameDay, addDays, getHours,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/common'
import { WEEKDAYS_FR } from '@/lib/format'
import { EVENT_VISUALS, urgencyRing } from '../lib/eventVisuals'
import type { PlanEvent } from '../lib/planningEvents'

// Re-renders every minute so the "Maintenant" line tracks the clock
// without forcing a full-page refresh.
export function useNow() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

const HOUR_PX = 48  // matches min-h-[48px] on each hourly row
const HOUR_START = 8
const HOUR_END = 19

/* ═══ Month View ═══ */

export function MonthView({ currentDate, events, onDayClick, onEventClick }: {
  currentDate: Date
  events: PlanEvent[]
  onDayClick: (d: Date) => void
  onEventClick: (e: PlanEvent) => void
}) {
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { locale: fr })
  const calEnd = endOfWeek(monthEnd, { locale: fr })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  return (
    <div className="overflow-hidden rounded-xl border border-immo-border-default">
      <div className="grid grid-cols-7 bg-immo-bg-card-hover">
        {WEEKDAYS_FR.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold text-immo-text-muted">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const inMonth = isSameMonth(day, currentDate)
          const isCurrent = isToday(day)
          const dayEvents = events.filter(e => isSameDay(new Date(e.at), day))

          return (
            <div
              key={day.toISOString()}
              onClick={() => onDayClick(day)}
              className={`min-h-[100px] cursor-pointer border-b border-r border-immo-border-default p-1.5 transition-colors hover:bg-immo-bg-card-hover ${
                isCurrent
                  ? 'bg-immo-accent-green/5 ring-1 ring-inset ring-immo-accent-green/30'
                  : inMonth
                    ? 'bg-immo-bg-card'
                    : 'bg-immo-bg-primary/30'
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isCurrent
                      ? 'bg-immo-accent-green font-bold text-immo-bg-primary'
                      : inMonth
                        ? 'text-immo-text-primary'
                        : 'text-immo-text-muted/50'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              </div>

              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((ev) => {
                  const v = EVENT_VISUALS[ev.type]
                  const Icon = v.icon
                  const ring = urgencyRing(ev.type, ev.at, ev.meta?.status as string | undefined)
                  return (
                    <button
                      key={ev.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                      className={`flex w-full items-center gap-1 rounded border-l-2 px-1 py-0.5 text-left text-[10px] transition-colors hover:brightness-125 ${v.bg} ${v.border} ${ring}`}
                    >
                      <Icon className={`h-2.5 w-2.5 shrink-0 ${v.text}`} />
                      <span className="text-immo-text-muted">{format(new Date(ev.at), 'HH:mm')}</span>
                      <span className="truncate text-immo-text-primary">
                        {ev.client_name?.split(' ')[0] ?? ev.title}
                      </span>
                    </button>
                  )
                })}
                {dayEvents.length > 3 && (
                  <span className="block text-center text-[9px] text-immo-text-muted">+{dayEvents.length - 3}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ═══ Week View ═══ */

export function WeekView({ currentDate, events, onEventClick }: {
  currentDate: Date
  events: PlanEvent[]
  onEventClick: (e: PlanEvent) => void
}) {
  const weekStart = startOfWeek(currentDate, { locale: fr })
  const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) })
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => i + HOUR_START)
  const now = useNow()

  // The "now" line only renders when today is within this week AND
  // the clock is inside the 8-19 visible band.
  const todayIdx = weekDays.findIndex(d => isSameDay(d, now))
  const nowHour = now.getHours() + now.getMinutes() / 60
  const showNowLine = todayIdx !== -1 && nowHour >= HOUR_START && nowHour <= HOUR_END + 1
  const nowTopPx = showNowLine ? (nowHour - HOUR_START) * HOUR_PX : 0

  return (
    <div className="overflow-hidden rounded-xl border border-immo-border-default">
      <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-immo-bg-card-hover">
        <div />
        {weekDays.map((d) => (
          <div key={d.toISOString()} className={`px-2 py-2 text-center ${isToday(d) ? 'bg-immo-accent-green/5' : ''}`}>
            <span className="text-[10px] text-immo-text-muted">{format(d, 'EEE', { locale: fr })}</span>
            <span className={`ml-1 text-xs font-semibold ${isToday(d) ? 'text-immo-accent-green' : 'text-immo-text-primary'}`}>
              {format(d, 'd')}
            </span>
          </div>
        ))}
      </div>
      <div className="relative max-h-[500px] overflow-y-auto">
        {showNowLine && (
          <div
            className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
            style={{ top: `${nowTopPx}px` }}
          >
            <span className="ml-[60px] -translate-y-1/2 rounded-full bg-immo-status-red px-1.5 py-0.5 text-[9px] font-bold text-white">
              {format(now, 'HH:mm')}
            </span>
            <div className="h-px flex-1 bg-immo-status-red" />
          </div>
        )}
        {hours.map((hour) => (
          <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-immo-border-default">
            <div className="px-2 py-2 text-right text-[10px] text-immo-text-muted">{hour}:00</div>
            {weekDays.map((day) => {
              const cellEvents = events.filter(e => {
                const d = new Date(e.at)
                return isSameDay(d, day) && getHours(d) === hour
              })
              return (
                <div key={day.toISOString()} className={`min-h-[48px] border-l border-immo-border-default p-0.5 ${isToday(day) ? 'bg-immo-accent-green/5' : 'bg-immo-bg-card'}`}>
                  {cellEvents.map((ev) => {
                    const v = EVENT_VISUALS[ev.type]
                    const Icon = v.icon
                    const ring = urgencyRing(ev.type, ev.at, ev.meta?.status as string | undefined)
                    return (
                      <button
                        key={ev.id}
                        onClick={() => onEventClick(ev)}
                        className={`mb-0.5 flex w-full items-center gap-1 rounded border-l-2 px-1 py-0.5 text-[10px] transition-colors hover:brightness-125 ${v.bg} ${v.border} ${ring}`}
                      >
                        <Icon className={`h-2.5 w-2.5 shrink-0 ${v.text}`} />
                        <span className="truncate text-immo-text-primary">
                          {ev.client_name?.split(' ')[0] ?? ev.title}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ Day View ═══ */

export function DayView({ currentDate, events, onEventClick }: {
  currentDate: Date
  events: PlanEvent[]
  onEventClick: (e: PlanEvent) => void
}) {
  const now = useNow()
  const isCurrentDay = isSameDay(currentDate, now)
  const dayEvents = events
    .filter(e => isSameDay(new Date(e.at), currentDate))
    .sort((a, b) => a.at.localeCompare(b.at))

  if (dayEvents.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-10 w-10" />}
        title="Aucun événement"
        description={`Pas d'activité prévue le ${format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })}`}
      />
    )
  }

  // Index of the first future event — the "Maintenant" separator
  // slips in just before it so past/future are visually split.
  const firstFutureIdx = isCurrentDay
    ? dayEvents.findIndex(e => new Date(e.at).getTime() > now.getTime())
    : -1

  return (
    <div className="space-y-2">
      {dayEvents.map((ev, idx) => {
        const showNowLine = isCurrentDay && idx === firstFutureIdx
        return (
          <div key={ev.id}>
            {showNowLine && (
              <div className="my-3 flex items-center gap-2">
                <span className="rounded-full bg-immo-status-red px-2 py-0.5 text-[10px] font-bold text-white">
                  Maintenant · {format(now, 'HH:mm')}
                </span>
                <div className="h-px flex-1 bg-immo-status-red/50" />
              </div>
            )}
            {(() => {
              const v = EVENT_VISUALS[ev.type]
              const Icon = v.icon
              const ring = urgencyRing(ev.type, ev.at, ev.meta?.status as string | undefined)
              return (
                <button
                  onClick={() => onEventClick(ev)}
                  className={`flex w-full items-center gap-4 rounded-xl border border-l-4 border-immo-border-default ${v.border} ${ring} bg-immo-bg-card p-4 text-left transition-colors hover:border-immo-border-glow/30`}
                >
                  <div className="w-[60px] shrink-0 text-center">
                    <p className="text-lg font-bold text-immo-text-primary">{format(new Date(ev.at), 'HH:mm')}</p>
                    <p className={`text-[10px] ${v.text}`}>{v.label}</p>
                  </div>

                  <div className="h-10 w-px bg-immo-border-default" />

                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${v.bg}`}>
                    <Icon className={`h-4 w-4 ${v.text}`} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-immo-text-primary">
                      {ev.title}{ev.client_name ? ` · ${ev.client_name}` : ''}
                    </p>
                    <p className="text-xs text-immo-text-muted">
                      {ev.client_phone ? `${ev.client_phone} · ` : ''}
                      {ev.agent_name ? `Agent : ${ev.agent_name}` : ''}
                    </p>
                  </div>
                </button>
              )
            })()}
          </div>
        )
      })}
    </div>
  )
}
