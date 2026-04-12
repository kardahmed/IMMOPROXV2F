import { useState, useEffect } from 'react'

type Theme = 'light' | 'dark' | 'system'

export function useDarkMode() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    return (localStorage.getItem('immo-theme') as Theme) || 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'system' && systemDark)

    if (isDark) {
      root.classList.add('dark')
      root.style.setProperty('--color-immo-bg-primary', '#0d1117')
      root.style.setProperty('--color-immo-bg-card', '#161b22')
      root.style.setProperty('--color-immo-bg-card-hover', '#1c2128')
      root.style.setProperty('--color-immo-bg-sidebar', '#0d1117')
      root.style.setProperty('--color-immo-text-primary', '#e6edf3')
      root.style.setProperty('--color-immo-text-secondary', '#8b949e')
      root.style.setProperty('--color-immo-text-muted', '#484f58')
      root.style.setProperty('--color-immo-border-default', '#21262d')
    } else {
      root.classList.remove('dark')
      root.style.removeProperty('--color-immo-bg-primary')
      root.style.removeProperty('--color-immo-bg-card')
      root.style.removeProperty('--color-immo-bg-card-hover')
      root.style.removeProperty('--color-immo-bg-sidebar')
      root.style.removeProperty('--color-immo-text-primary')
      root.style.removeProperty('--color-immo-text-secondary')
      root.style.removeProperty('--color-immo-text-muted')
      root.style.removeProperty('--color-immo-border-default')
    }

    localStorage.setItem('immo-theme', theme)
  }, [theme])

  return { theme, setTheme, isDark: theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) }
}
