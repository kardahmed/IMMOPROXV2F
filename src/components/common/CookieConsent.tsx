import { useState } from 'react'
import { Cookie, X } from 'lucide-react'

const STORAGE_KEY = 'immo-cookie-consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && !localStorage.getItem(STORAGE_KEY))

  function accept(all: boolean) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ essential: true, analytics: all, accepted_at: new Date().toISOString() }))
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 rounded-2xl border border-[#E3E8EF] bg-white p-5 shadow-2xl shadow-black/10 dark:border-immo-border dark:bg-immo-bg-card">
      <button onClick={() => setVisible(false)} className="absolute right-3 top-3 text-immo-text-muted hover:text-immo-text-primary">
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0579DA]/10">
          <Cookie className="h-5 w-5 text-[#0579DA]" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-[#0A2540] dark:text-immo-text-primary">Nous respectons votre vie privee</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#8898AA] dark:text-immo-text-secondary">
            Nous utilisons des cookies essentiels au fonctionnement de la plateforme et, avec votre accord, des cookies d'analyse pour ameliorer nos services.{' '}
            <a href="/marketing/confidentialite.html" target="_blank" rel="noopener noreferrer" className="text-[#0579DA] hover:underline">En savoir plus</a>
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => accept(true)}
              className="h-9 rounded-lg bg-[#0579DA] px-4 text-xs font-bold text-white transition-all hover:bg-[#0460B8]">
              Tout accepter
            </button>
            <button onClick={() => accept(false)}
              className="h-9 rounded-lg border border-[#E3E8EF] bg-white px-4 text-xs font-semibold text-[#425466] transition-all hover:bg-[#F0F4F8] dark:border-immo-border dark:bg-immo-bg-primary dark:text-immo-text-primary">
              Essentiels uniquement
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
