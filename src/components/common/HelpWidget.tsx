import { useState } from 'react'
import { HelpCircle, X, Book, MessageCircle, Mail, Sparkles } from 'lucide-react'

const LINKS = [
  { icon: Book, label: 'Documentation', href: '/marketing/docs.html', desc: 'Guides et references' },
  { icon: Sparkles, label: 'Nouveautes', href: '/changelog', desc: 'Dernieres mises a jour' },
  { icon: MessageCircle, label: 'WhatsApp', href: 'https://wa.me/213542766068?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20IMMO%20PRO-X', desc: 'Reponse en moins d\'une heure' },
  { icon: Mail, label: 'Email support', href: 'mailto:support@immoprox.io', desc: 'support@immoprox.io' },
]

export function HelpWidget() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && (
        <div className="fixed bottom-20 right-4 z-[9998] w-[calc(100vw-2rem)] max-w-[320px] rounded-2xl border border-immo-border-default bg-immo-bg-card p-4 shadow-2xl shadow-black/30">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-immo-text-primary">Centre d'aide</h3>
            <button onClick={() => setOpen(false)} className="text-immo-text-muted hover:text-immo-text-primary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            {LINKS.map(l => {
              const external = l.href.startsWith('http') || l.href.startsWith('mailto')
              return (
                <a key={l.label} href={l.href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}
                  className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-immo-bg-card-hover">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-immo-accent-green/10">
                    <l.icon className="h-4 w-4 text-immo-accent-green" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-immo-text-primary">{l.label}</p>
                    <p className="truncate text-[10px] text-immo-text-muted">{l.desc}</p>
                  </div>
                </a>
              )
            })}
          </div>
          <p className="mt-3 border-t border-immo-border-default pt-3 text-center text-[10px] text-immo-text-muted">
            IMMO PRO-X v2.0
          </p>
        </div>
      )}

      <button onClick={() => setOpen(!open)} aria-label="Aide"
        className="fixed bottom-4 right-4 z-[9998] flex h-12 w-12 items-center justify-center rounded-full bg-immo-accent-blue text-white shadow-lg shadow-immo-accent-blue/30 transition-all hover:scale-105">
        {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
      </button>
    </>
  )
}
