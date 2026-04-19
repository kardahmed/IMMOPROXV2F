import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

interface SidePanelProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  side?: 'right' | 'left'
  children: ReactNode
}

export function SidePanel({
  isOpen,
  onClose,
  title,
  subtitle,
  side = 'right',
  children,
}: SidePanelProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent
        side={side}
        className="w-full max-w-[100vw] border-immo-border-default bg-immo-bg-card p-0 sm:w-[480px] sm:max-w-[90vw]"
      >
        <SheetHeader className="border-b border-immo-border-default px-4 py-3 md:px-6 md:py-4">
          <SheetTitle className="text-base font-semibold text-immo-text-primary md:text-lg">
            {title}
          </SheetTitle>
          {subtitle && (
            <SheetDescription className="text-xs text-immo-text-muted md:text-sm">
              {subtitle}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
