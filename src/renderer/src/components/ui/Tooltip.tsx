import * as RadixTooltip from '@radix-ui/react-tooltip'
import { type ReactNode } from 'react'

/** Wrap the app once so all tooltips share open/close timing. */
export const TooltipProvider = RadixTooltip.Provider

interface TooltipProps {
  label: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * A dark-themed tooltip. The single child becomes the trigger (via `asChild`,
 * so it must forward refs/props — e.g. a button).
 */
export function Tooltip({ label, children, side = 'top' }: TooltipProps): React.JSX.Element {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 select-none rounded-md border border-border-strong bg-surface-3 px-2 py-1 text-xs text-text shadow-xl"
        >
          {label}
          <RadixTooltip.Arrow style={{ fill: 'var(--color-surface-3)' }} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
