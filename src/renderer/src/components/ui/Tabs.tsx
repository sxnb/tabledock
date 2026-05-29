import { type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

export interface TabItem {
  id: string
  title: string
  icon?: ReactNode
  closable?: boolean
}

interface TabsProps {
  tabs: TabItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose?: (id: string) => void
  /** Optional control rendered at the right edge of the tab strip. */
  trailing?: ReactNode
}

export function Tabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  trailing
}: TabsProps): React.JSX.Element {
  return (
    <div className="flex items-stretch border-b border-border bg-surface">
      <div className="flex flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeId
          return (
            <div
              key={tab.id}
              onMouseDown={() => onSelect(tab.id)}
              className={cn(
                'group flex max-w-[220px] cursor-pointer items-center gap-2 border-r border-border px-3.5 py-2 text-xs',
                'transition-colors',
                active
                  ? 'bg-surface-2 text-text shadow-[inset_0_-2px_0_0_var(--color-accent)]'
                  : 'text-muted hover:bg-surface-2/50 hover:text-text'
              )}
            >
              {tab.icon && <span className="shrink-0 text-faint">{tab.icon}</span>}
              <span className="truncate">{tab.title}</span>
              {tab.closable !== false && onClose && (
                <button
                  aria-label="Close tab"
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    onClose(tab.id)
                  }}
                  className={cn(
                    'ml-1 grid h-4 w-4 shrink-0 place-items-center rounded text-faint',
                    'opacity-0 transition-opacity hover:bg-surface-3 hover:text-text group-hover:opacity-100',
                    active && 'opacity-60'
                  )}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {trailing && <div className="flex shrink-0 items-center px-1.5">{trailing}</div>}
    </div>
  )
}
