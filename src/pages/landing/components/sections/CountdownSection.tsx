import { useState, useEffect } from 'react'

interface CountdownContent {
  end_date?: string
  label?: string
  units_left?: number
}

export function CountdownSection({ title, content, accent }: { title?: string; content: CountdownContent; accent: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    if (!content.end_date) return
    const end = new Date(content.end_date).getTime()

    function update() {
      const now = Date.now()
      const diff = Math.max(0, end - now)
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      })
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [content.end_date])

  return (
    <div className="py-10 px-4" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}DD)` }}>
      <div className="mx-auto max-w-2xl text-center">
        {title && <h2 className="mb-2 text-2xl font-bold text-white">{title}</h2>}
        {content.label && <p className="mb-6 text-white/80">{content.label}</p>}

        {content.units_left && (
          <p className="mb-4 text-lg font-bold text-white">
            Plus que <span className="text-3xl">{content.units_left}</span> unites disponibles
          </p>
        )}

        {content.end_date && (
          <div className="flex justify-center gap-4">
            {[
              { val: timeLeft.days, label: 'Jours' },
              { val: timeLeft.hours, label: 'Heures' },
              { val: timeLeft.minutes, label: 'Min' },
              { val: timeLeft.seconds, label: 'Sec' },
            ].map(({ val, label }) => (
              <div key={label} className="flex flex-col items-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <span className="text-2xl font-bold text-white">{String(val).padStart(2, '0')}</span>
                </div>
                <span className="mt-1 text-xs text-white/70">{label}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => document.getElementById('landing-form')?.scrollIntoView({ behavior: 'smooth' })}
          className="mt-6 rounded-lg bg-white px-8 py-3 text-sm font-bold shadow-lg transition-transform hover:scale-105"
          style={{ color: accent }}
        >
          Reservez maintenant
        </button>
      </div>
    </div>
  )
}
