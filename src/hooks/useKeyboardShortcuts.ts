import { useEffect } from 'react'
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

export function useKeyboardShortcuts() {
  const navigate = useNavigate()

  useEffect(() => {
    let gPressed = false
    let gTimer: ReturnType<typeof setTimeout>

    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger in inputs/textareas
      const tag = (e.target as HTMLElement).tagName
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

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
      }

      // Escape closes modals — handled by individual components
      // / focuses search
      if (e.key === '/' && !gPressed) {
        e.preventDefault()
        const searchInput = document.querySelector('input[type="text"][placeholder]') as HTMLInputElement
        searchInput?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      clearTimeout(gTimer)
    }
  }, [navigate])
}
