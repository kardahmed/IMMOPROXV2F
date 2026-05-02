import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

interface ShortcutDef {
  i18nKey: string
  keys: string[]
}

const SHORTCUTS: ShortcutDef[] = [
  // Global
  { i18nKey: 'shortcuts.cmd_k', keys: ['⌘', 'K'] },
  { i18nKey: 'shortcuts.help', keys: ['?'] },
  { i18nKey: 'shortcuts.escape', keys: ['Esc'] },
  // Navigation (g + key)
  { i18nKey: 'shortcuts.go_dashboard', keys: ['g', 'd'] },
  { i18nKey: 'shortcuts.go_pipeline', keys: ['g', 'p'] },
  { i18nKey: 'shortcuts.go_planning', keys: ['g', 'l'] },
  { i18nKey: 'shortcuts.go_tasks', keys: ['g', 't'] },
  { i18nKey: 'shortcuts.go_dossiers', keys: ['g', 'o'] },
  { i18nKey: 'shortcuts.go_projects', keys: ['g', 'j'] },
  { i18nKey: 'shortcuts.go_settings', keys: ['g', 's'] },
]

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts.title')}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] overflow-hidden rounded-xl border border-immo-border-default bg-immo-bg-card shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-immo-border-default px-5 py-3">
          <h2 className="text-sm font-semibold text-immo-text-primary">{t('shortcuts.title')}</h2>
          <button
            onClick={onClose}
            aria-label={t('action.close')}
            className="rounded p-1 text-immo-text-muted hover:bg-immo-bg-card-hover hover:text-immo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-immo-accent-green/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="divide-y divide-immo-border-default">
          {SHORTCUTS.map(s => (
            <div key={s.i18nKey} className="flex items-center justify-between px-5 py-2.5">
              <span className="text-xs text-immo-text-secondary">{t(s.i18nKey)}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <kbd className="min-w-[24px] rounded-md border border-immo-border-default bg-immo-bg-primary px-1.5 py-0.5 text-center text-[11px] font-mono text-immo-text-primary">
                      {k}
                    </kbd>
                    {i < s.keys.length - 1 && <span className="text-[10px] text-immo-text-muted">+</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-immo-border-default bg-immo-bg-primary/30 px-5 py-2 text-[10px] text-immo-text-muted">
          {t('shortcuts.note')}
        </div>
      </div>
    </div>
  )
}
