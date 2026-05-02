import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SHORTCUTS: Record<string, string> = {
  'd': '/dashboard',
  'p': '/pipeline',
  'j': '/projects',
  't': '/tasks',
  'l': '/planning',
  'o': '/dossiers',
  'g': '/goals',
  'f': '/performance',
  'a': '/agents',
  'c': '/landing',
  'r': '/reports',
  's': '/settings',
}

// Global keyboard shortcuts hook. Returns palette/help open state so
// AppLayout can render the corresponding modals. Triggers:
//   ⌘K / Ctrl+K — open command palette
//   ?           — open shortcuts help
//   g + letter  — navigate (g d → /dashboard, g p → /pipeline, …)
//   /           — focus the topbar search input (legacy fallback)
//   Esc         — close any open palette/help (within hook scope)
export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    let gPressed = false
    let gTimer: ReturnType<typeof setTimeout>

    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      const isInInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || (e.target as HTMLElement).isContentEditable

      // Cmd/Ctrl + K — works even from inputs (so the search bar can
      // hand off to the palette).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
        return
      }

      // From here on, ignore inputs and modifier-key combos.
      if (isInInput) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // ? opens the shortcuts help (Shift + / on most layouts).
      if (e.key === '?') {
        e.preventDefault()
        setHelpOpen(true)
        return
      }

      if (e.key === 'g' || e.key === 'G') {
        gPressed = true
        clearTimeout(gTimer)
        gTimer = setTimeout(() => { gPressed = false }, 1000)
        return
      }

      if (gPressed && SHORTCUTS[e.key.toLowerCase()]) {
        e.preventDefault()
        navigate(SHORTCUTS[e.key.toLowerCase()])
        gPressed = false
        return
      }

      // / focuses the topbar search input (legacy)
      if (e.key === '/' && !gPressed) {
        e.preventDefault()
        const searchInput = document.querySelector('input[type="text"][placeholder]') as HTMLInputElement
        searchInput?.focus()
      }
    }

    function handlePaletteEvent() { setPaletteOpen(true) }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('immo:open-palette', handlePaletteEvent)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('immo:open-palette', handlePaletteEvent)
      clearTimeout(gTimer)
    }
  }, [navigate])

  return { paletteOpen, setPaletteOpen, helpOpen, setHelpOpen }
}
