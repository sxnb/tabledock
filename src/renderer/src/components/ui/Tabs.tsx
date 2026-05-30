import { type ReactNode } from 'react'
import { X } from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import { cn } from '@renderer/lib/cn'

export interface TabItem {
  id: string
  title: string
  icon?: ReactNode
  closable?: boolean
}

/** Right-click actions for a tab. "Close tab" reuses the strip's onClose. */
export interface TabMenuActions {
  onDuplicate: (id: string) => void
  onCloseLeft: (id: string) => void
  onCloseRight: (id: string) => void
  onCloseAll: () => void
}

interface TabsProps {
  tabs: TabItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose?: (id: string) => void
  /** Enables the right-click context menu on each tab. */
  menu?: TabMenuActions
  /** Optional control rendered at the right edge of the tab strip. */
  trailing?: ReactNode
}

export function Tabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  menu,
  trailing
}: TabsProps): React.JSX.Element {
  return (
    <div className="flex items-stretch border-b border-border bg-surface">
      <div className="flex flex-1 items-stretch overflow-x-auto">
        {tabs.map((tab, index) => {
          const active = tab.id === activeId
          const tabEl = (
            <div
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

          if (!menu) return <div key={tab.id}>{tabEl}</div>

          return (
            <ContextMenu.Root key={tab.id}>
              <ContextMenu.Trigger asChild>{tabEl}</ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="z-50 min-w-44 overflow-hidden rounded-md border border-border bg-surface-2 p-1 text-xs text-text shadow-xl">
                  <MenuItem onSelect={() => menu.onDuplicate(tab.id)}>Duplicate tab</MenuItem>
                  <ContextMenu.Separator className="my-1 h-px bg-border" />
                  {onClose && <MenuItem onSelect={() => onClose(tab.id)}>Close tab</MenuItem>}
                  <MenuItem onSelect={() => menu.onCloseLeft(tab.id)} disabled={index === 0}>
                    Close tabs to left
                  </MenuItem>
                  <MenuItem
                    onSelect={() => menu.onCloseRight(tab.id)}
                    disabled={index === tabs.length - 1}
                  >
                    Close tabs to right
                  </MenuItem>
                  <MenuItem onSelect={menu.onCloseAll}>Close all</MenuItem>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          )
        })}
      </div>
      {trailing && <div className="flex shrink-0 items-center px-1.5">{trailing}</div>}
    </div>
  )
}

function MenuItem({
  children,
  onSelect,
  disabled
}: {
  children: ReactNode
  onSelect: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <ContextMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center rounded px-2 py-1.5 outline-none',
        'data-[highlighted]:bg-accent-soft data-[highlighted]:text-text',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40'
      )}
    >
      {children}
    </ContextMenu.Item>
  )
}
