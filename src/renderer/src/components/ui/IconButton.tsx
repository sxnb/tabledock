import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@renderer/lib/cn'
import { Tooltip } from './Tooltip'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label, also shown as the tooltip. */
  label: string
  /** Which side the tooltip appears on. */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, tooltipSide, className, children, ...props },
  ref
) {
  return (
    <Tooltip label={label} side={tooltipSide}>
      <button
        ref={ref}
        aria-label={label}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors',
          'hover:bg-surface-2 hover:text-text',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  )
})
