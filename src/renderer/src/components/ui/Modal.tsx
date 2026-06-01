import { type ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'
import { cn } from '@renderer/lib/cn'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Maximum width; defaults to 'md'. */
  size?: 'md' | 'lg' | 'xl'
}

const MAX_WIDTH: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl'
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md'
}: ModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className={cn(
          'w-full overflow-hidden rounded-xl border border-border bg-surface shadow-2xl',
          MAX_WIDTH[size]
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
