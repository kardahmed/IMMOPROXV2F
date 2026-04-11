import { useRef, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

type Animation = 'fade-up' | 'fade-in' | 'slide-left' | 'slide-right' | 'zoom-in' | 'fade-down'

interface AnimateOnScrollProps {
  children: ReactNode
  animation?: Animation
  delay?: number
  className?: string
}

const ANIMATIONS: Record<Animation, { from: string; to: string }> = {
  'fade-up': {
    from: 'opacity-0 translate-y-8',
    to: 'opacity-100 translate-y-0',
  },
  'fade-in': {
    from: 'opacity-0',
    to: 'opacity-100',
  },
  'fade-down': {
    from: 'opacity-0 -translate-y-8',
    to: 'opacity-100 translate-y-0',
  },
  'slide-left': {
    from: 'opacity-0 translate-x-12',
    to: 'opacity-100 translate-x-0',
  },
  'slide-right': {
    from: 'opacity-0 -translate-x-12',
    to: 'opacity-100 translate-x-0',
  },
  'zoom-in': {
    from: 'opacity-0 scale-90',
    to: 'opacity-100 scale-100',
  },
}

export function AnimateOnScroll({ children, animation = 'fade-up', delay = 0, className = '' }: AnimateOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay)
          observer.unobserve(el)
        }
      },
      { threshold: 0.15 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [delay])

  const anim = ANIMATIONS[animation]

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${visible ? anim.to : anim.from} ${className}`}
    >
      {children}
    </div>
  )
}
