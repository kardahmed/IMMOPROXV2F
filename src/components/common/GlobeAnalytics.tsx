import { useEffect, useRef } from 'react'
import createGlobe from 'cobe'
import type { Marker, COBEOptions } from 'cobe'

interface GlobeAnalyticsProps {
  /** City markers — defaults to major Algerian wilayas */
  markers?: Array<{ location: [number, number]; size: number; label?: string }>
  /** Title shown next to the globe */
  title?: string
  /** Subtitle / description */
  subtitle?: string
  /** Stats to display below the title (label + value) */
  stats?: Array<{ label: string; value: string | number }>
  /** Centered phi (longitude) — defaults to ~Algeria */
  initialPhi?: number
  /** Centered theta (latitude) — defaults to ~Algeria */
  initialTheta?: number
  className?: string
}

const DEFAULT_MARKERS: Array<{ location: [number, number]; size: number; label: string }> = [
  { location: [36.7538, 3.0588], size: 0.10, label: 'Alger' },
  { location: [35.6911, -0.6417], size: 0.09, label: 'Oran' },
  { location: [36.3650, 6.6147], size: 0.09, label: 'Constantine' },
  { location: [36.9000, 7.7667], size: 0.07, label: 'Annaba' },
  { location: [36.1900, 5.4100], size: 0.07, label: 'Setif' },
  { location: [34.8884, -1.3150], size: 0.06, label: 'Tlemcen' },
  { location: [35.5500, 6.1700], size: 0.06, label: 'Batna' },
  { location: [27.8741, -0.2942], size: 0.05, label: 'Adrar' },
  { location: [22.7850, 5.5228], size: 0.05, label: 'Tamanrasset' },
  { location: [31.6500, -2.1500], size: 0.05, label: 'Bechar' },
]

export function GlobeAnalytics({
  markers,
  title = 'Couverture nationale',
  subtitle = 'Activite en temps reel a travers l\'Algerie',
  stats,
  initialPhi = 4.55,
  initialTheta = 0.45,
  className = '',
}: GlobeAnalyticsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const phiRef = useRef(initialPhi)
  const widthRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onResize = () => {
      widthRef.current = canvas.offsetWidth
    }
    window.addEventListener('resize', onResize)
    onResize()

    const data: Marker[] = (markers ?? DEFAULT_MARKERS).map(m => ({
      location: m.location,
      size: m.size,
    }))

    const globe = createGlobe(canvas, {
      devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      width: widthRef.current * 2,
      height: widthRef.current * 2,
      phi: initialPhi,
      theta: initialTheta,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.18, 0.25, 0.45],
      markerColor: [0.02, 0.83, 0.63],
      glowColor: [0.05, 0.47, 0.85],
      markers: data,
      onRender: (state: Record<string, number>) => {
        phiRef.current += 0.003
        state.phi = phiRef.current
        state.width = widthRef.current * 2
        state.height = widthRef.current * 2
      },
    } as COBEOptions & { onRender: (state: Record<string, number>) => void })

    canvas.style.opacity = '0'
    canvas.style.transition = 'opacity .8s ease'
    const t = setTimeout(() => { if (canvas) canvas.style.opacity = '1' }, 80)

    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', onResize)
      globe.destroy()
    }
  }, [markers, initialPhi, initialTheta])

  return (
    <div className={`grid grid-cols-1 items-center gap-6 rounded-2xl border border-immo-border-default bg-gradient-to-br from-immo-bg-card to-immo-bg-primary p-6 lg:grid-cols-[1fr_1.1fr] ${className}`}>
      <div className="relative mx-auto aspect-square w-full max-w-[340px]">
        <canvas ref={canvasRef} className="block h-full w-full" style={{ contain: 'layout paint size' }} />
      </div>
      <div>
        <span className="inline-block rounded-full bg-immo-accent-green/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-immo-accent-green">
          {title}
        </span>
        <h3 className="mt-3 text-xl font-bold text-immo-text-primary md:text-2xl">{subtitle}</h3>
        {stats && stats.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {stats.map(s => (
              <div key={s.label} className="rounded-lg border border-immo-border-default bg-immo-bg-primary px-3 py-2.5">
                <div className="text-xs text-immo-text-muted">{s.label}</div>
                <div className="mt-0.5 text-lg font-bold text-immo-text-primary">{s.value}</div>
              </div>
            ))}
          </div>
        )}
        {(!stats || stats.length === 0) && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DEFAULT_MARKERS.slice(0, 6).map((c, i) => (
              <div key={c.label} className="flex items-center gap-2 text-sm text-immo-text-secondary">
                <span className="h-2 w-2 rounded-full bg-immo-accent-blue shadow-[0_0_8px_rgb(59_163_255)]"
                  style={{ animation: `pulse 2s infinite ${i * 0.3}s` }} />
                {c.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
