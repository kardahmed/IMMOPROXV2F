import { useState, useEffect } from 'react'
import { create } from 'zustand'

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

// Global sidebar state (shared between components)
interface SidebarState {
  isOpen: boolean
  toggle: () => void
  close: () => void
  open: () => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  open: () => set({ isOpen: true }),
}))

export function useMobile() {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280
  )

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const isMobile = width < MOBILE_BREAKPOINT
  const isTablet = width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT
  const isDesktop = width >= TABLET_BREAKPOINT

  return { isMobile, isTablet, isDesktop, width }
}
