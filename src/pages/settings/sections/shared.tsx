import { Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export const inputClass = 'border-immo-border-default bg-immo-bg-primary text-immo-text-primary placeholder:text-immo-text-muted'
export const labelClass = 'text-[11px] font-medium text-immo-text-muted'

export function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-semibold text-immo-text-primary">{title}</h2>
      <p className="text-xs text-immo-text-muted">{subtitle}</p>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className={labelClass}>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export function SaveButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  const { t } = useTranslation()
  return (
    <Button onClick={onClick} disabled={loading} className="bg-immo-accent-green font-semibold text-immo-bg-primary hover:bg-immo-accent-green/90">
      {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-immo-bg-primary border-t-transparent" /> : <><Save className="me-1.5 h-4 w-4" /> {t('action.save')}</>}
    </Button>
  )
}
