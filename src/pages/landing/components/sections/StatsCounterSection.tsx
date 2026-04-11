import { useState, useEffect, useRef } from 'react'

interface StatsContent {
  items?: Array<{ value: number; suffix?: string; label: string }>
}

function AnimatedNumber({ target, suffix }: { target: number; suffix?: string }) {
  const [current, setCurrent] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const animated = useRef(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !animated.current) {
        animated.current = true
        const duration = 2000
        const start = Date.now()
        function tick() {
          const elapsed = Date.now() - start
          const progress = Math.min(elapsed / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 3) // ease out cubic
          setCurrent(Math.floor(target * eased))
          if (progress < 1) requestAnimationFrame(tick)
        }
        tick()
      }
    }, { threshold: 0.5 })

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [target])

  return (
    <div ref={ref}>
      <span className="text-4xl font-bold text-[#0A2540]">+{current.toLocaleString('fr')}</span>
      {suffix && <span className="text-2xl font-bold text-[#0A2540]">{suffix}</span>}
    </div>
  )
}

export function StatsCounterSection({ title, content, accent }: { title?: string; content: StatsContent; accent: string }) {
  const items = content.items ?? []
  if (items.length === 0) return null

  return (
    <div className="py-16 px-4 bg-[#F6F9FC]">
      <div className="mx-auto max-w-4xl">
        {title && <h2 className="mb-10 text-center text-2xl font-bold text-[#0A2540]">{title}</h2>}
        <div className={`grid gap-8 ${items.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {items.map((item, i) => (
            <div key={i} className="text-center">
              <AnimatedNumber target={item.value} suffix={item.suffix} />
              <p className="mt-2 text-sm text-[#8898AA]">{item.label}</p>
              <div className="mx-auto mt-3 h-1 w-12 rounded-full" style={{ backgroundColor: accent }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
