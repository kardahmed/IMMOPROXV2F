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

    const darkVars: Record<string, string> = {
      // Backgrounds
      '--color-immo-bg-primary': '#0d1117',
      '--color-immo-bg-card': '#161b22',
      '--color-immo-bg-card-hover': '#1c2128',
      '--color-immo-bg-sidebar': '#0d1117',
      // Text
      '--color-immo-text-primary': '#e6edf3',
      '--color-immo-text-secondary': '#8b949e',
      '--color-immo-text-muted': '#484f58',
      // Borders
      '--color-immo-border-default': '#21262d',
      // Status (slightly adjusted for dark bg)
      '--color-immo-status-red': '#f85149',
      '--color-immo-status-red-bg': 'rgba(248,81,73,0.1)',
      '--color-immo-status-orange': '#d29922',
      '--color-immo-status-orange-bg': 'rgba(210,153,34,0.1)',
      // Accents (keep vibrant)
      '--color-immo-accent-green': '#3fb950',
      '--color-immo-accent-blue': '#58a6ff',
      // Shadows
      '--color-immo-shadow': 'rgba(0,0,0,0.3)',
      // Scrollbar
      '--scrollbar-thumb': '#30363d',
      '--scrollbar-track': '#0d1117',
    }

    if (isDark) {
      root.classList.add('dark')
      root.style.colorScheme = 'dark'
      for (const [key, value] of Object.entries(darkVars)) {
        root.style.setProperty(key, value)
      }
    } else {
      root.classList.remove('dark')
      root.style.colorScheme = 'light'
      for (const key of Object.keys(darkVars)) {
        root.style.removeProperty(key)
      }
    }

    localStorage.setItem('immo-theme', theme)
  }, [theme])

  return { theme, setTheme, isDark: theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) }
}
