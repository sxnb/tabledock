import { useState } from 'react'
import { Plus, Pencil, Trash2, Settings, Database as DatabaseIcon } from 'lucide-react'
import type { ConnectionConfig } from '@shared/types'
import { KIND_META } from '@renderer/lib/kinds'
import { useConnections } from '@renderer/store/connections'
import { useWorkspace } from '@renderer/store/workspace'
import { useSettings } from '@renderer/store/settings'
import { cn } from '@renderer/lib/cn'
import { darken } from '@renderer/lib/color'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { NoiseBackground } from './ui/NoiseBackground'
import { SettingsModal } from './SettingsModal'

interface SidebarProps {
  onNew: () => void
  onEdit: (config: ConnectionConfig) => void
}

export function Sidebar({ onNew, onEdit }: SidebarProps): React.JSX.Element {
  const connections = useConnections((s) => s.connections)
  const remove = useConnections((s) => s.remove)
  const sessions = useWorkspace((s) => s.sessions)
  const activeSessionId = useWorkspace((s) => s.activeSessionId)
  const openConnection = useWorkspace((s) => s.openConnection)
  const closeConnection = useWorkspace((s) => s.closeConnection)
  const sidebarBg = useSettings((s) => s.settings.sidebar)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // When a custom sidebar background is set, make elements legible over it:
  // the selected row uses a darker variant of the background at 50% alpha (with
  // a shadow), and otherwise-bare labels get a dark translucent backing.
  const themed = Boolean(sidebarBg.color)
  const activeBg = sidebarBg.color ? `${darken(sidebarBg.color, 0.38)}80` : null

  const onDelete = async (config: ConnectionConfig): Promise<void> => {
    if (sessions[config.id]) await closeConnection(config.id)
    await remove(config.id)
  }

  return (
    <aside className="relative flex w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-surface">
      <NoiseBackground color={sidebarBg.color} noise={sidebarBg.noise} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-4 py-3.5">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-accent to-blue text-white shadow-[0_0_12px_rgba(139,123,255,0.5)]">
            <DatabaseIcon size={15} />
          </div>
          <span className="text-sm font-semibold tracking-tight text-text">DataDock</span>
        </header>

        <div className="mt-1 flex-1 overflow-y-auto px-2 pb-3">
          <div className="px-2 py-1.5">
            <span
              className={cn(
                'text-[10px] font-semibold uppercase tracking-wider text-faint',
                themed && 'rounded bg-black/30 px-1.5 py-0.5 text-muted'
              )}
            >
              Connections
            </span>
          </div>
          {connections.length === 0 && (
            <p className="px-2 py-3 text-xs leading-relaxed text-faint">
              No saved connections yet. Create one to get started.
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {connections.map((config) => {
              const meta = KIND_META[config.kind]
              const session = sessions[config.id]
              const active = activeSessionId === config.id
              const Icon = meta.icon
              return (
                <li key={config.id}>
                  <div
                    onMouseDown={() => openConnection(config)}
                    style={
                      active && activeBg
                        ? {
                            backgroundColor: activeBg,
                            boxShadow: 'rgba(0, 0, 0, 0.2) 0px 2px 8px 0px'
                          }
                        : undefined
                    }
                    className={cn(
                      'group flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors',
                      active ? (activeBg ? '' : 'bg-accent-soft') : 'hover:bg-surface-2'
                    )}
                  >
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded"
                      style={{
                        color: config.color ?? meta.color,
                        background: `${config.color ?? meta.color}1a`
                      }}
                    >
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] text-text">{config.name}</span>
                        {session && <StatusDot status={session.status} />}
                      </div>
                      <div
                        className={cn(
                          'truncate text-[11px]',
                          themed ? 'text-text/60' : 'text-faint'
                        )}
                      >
                        {connSubtitle(config)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                      <IconButton
                        label="Edit"
                        className="h-6 w-6"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          onEdit(config)
                        }}
                      >
                        <Pencil size={12} />
                      </IconButton>
                      <IconButton
                        label="Delete"
                        className="h-6 w-6 hover:text-danger"
                        onMouseDown={(e) => {
                          e.stopPropagation()
                          void onDelete(config)
                        }}
                      >
                        <Trash2 size={12} />
                      </IconButton>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex items-center gap-2 border-t border-border/70 bg-black/20 p-2">
          <Button variant="secondary" className="flex-1" onClick={onNew}>
            <Plus size={14} />
            New connection
          </Button>
          <IconButton
            label="Settings"
            className="h-9 w-9 shrink-0"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={16} />
          </IconButton>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  )
}

function connSubtitle(config: ConnectionConfig): string {
  if (config.kind === 'sqlite') return config.filePath?.split('/').pop() ?? 'SQLite'
  if (config.kind === 'redis') return `${config.host}:${config.port} · db${config.redisDb ?? 0}`
  return `${config.host}:${config.port}`
}

function StatusDot({
  status
}: {
  status: 'connecting' | 'connected' | 'error'
}): React.JSX.Element {
  const color =
    status === 'connected'
      ? 'bg-ok'
      : status === 'connecting'
        ? 'bg-blue animate-pulse'
        : 'bg-danger'
  return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', color)} />
}
