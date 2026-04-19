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
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
}: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        className={`max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[calc(100%-1rem)] overflow-hidden border-immo-border-default bg-immo-bg-card p-0 ${SIZES[size]}`}
      >
        <DialogHeader className="border-b border-immo-border-default px-4 py-3 md:px-6 md:py-4">
          <DialogTitle className="text-base font-semibold text-immo-text-primary md:text-lg">
            {title}
          </DialogTitle>
          {subtitle && (
            <DialogDescription className="text-xs text-immo-text-muted md:text-sm">
              {subtitle}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="max-h-[calc(100dvh-9rem)] overflow-y-auto px-4 py-4 md:px-6 md:py-5">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
