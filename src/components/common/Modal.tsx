import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const SIZES = {
  sm: 'sm:max-w-[480px]',
  md: 'sm:max-w-[640px]',
  lg: 'sm:max-w-[800px]',
  xl: 'sm:max-w-[1000px]',
} as const

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  size?: keyof typeof SIZES
  children: ReactNode
  /** Optional sticky footer (typically action buttons) rendered below a divider */
  footer?: ReactNode
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
}: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className={`flex max-h-[90vh] flex-col border-immo-border-default bg-immo-bg-card p-0 ${SIZES[size]}`}
      >
        <DialogHeader className="shrink-0 border-b border-immo-border-default px-6 py-4">
          <DialogTitle className="text-lg font-semibold text-immo-text-primary">
            {title}
          </DialogTitle>
          {subtitle && (
            <DialogDescription className="text-sm text-immo-text-muted">
              {subtitle}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="shrink-0 flex items-center justify-end gap-2 border-t border-immo-border-default bg-immo-bg-primary px-6 py-3">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
