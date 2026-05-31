import { useEffect, useMemo, useRef, useState } from 'react'
import { Database, Table2, Terminal, Plus, Unplug, Search } from 'lucide-react'
import type { DriverKind } from '@shared/types'
import { useConnections } from '@renderer/store/connections'
import { useWorkspace } from '@renderer/store/workspace'
import { cn } from '@renderer/lib/cn'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onNewConnection: () => void
}

interface Command {
  id: string
  label: string
  hint?: string
  group: string
  icon: React.ReactNode
  run: () => void
}

const RELATIONAL: DriverKind[] = ['mysql', 'mariadb', 'postgres', 'mssql', 'sqlite']

/**
 * ⌘K command palette: jump to a saved connection, open a table or new query in
 * the active connection, or run a quick action. Arrow keys navigate, Enter runs.
 */
export function CommandPalette({
  open,
  onClose,
  onNewConnection
}: CommandPaletteProps): React.JSX.Element | null {
  const connections = useConnections((s) => s.connections)
  const openConnection = useWorkspace((s) => s.openConnection)
  const openTableTab = useWorkspace((s) => s.openTableTab)
  const openQueryTab = useWorkspace((s) => s.openQueryTab)
  const closeConnection = useWorkspace((s) => s.closeConnection)
  const activeSessionId = useWorkspace((s) => s.activeSessionId)
  const active = useWorkspace((s) => (activeSessionId ? s.sessions[activeSessionId] : null))

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [tables, setTables] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const activeBackendId = active?.status === 'connected' ? active.sessionId : null
  const activeIsRelational = active ? RELATIONAL.includes(active.config.kind) : false
  const activeDb = active && active.config.kind !== 'sqlite' ? active.selectedDatabase : undefined

  // Reset and focus each time the palette opens.
  useEffect(() => {
    if (!open) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset palette state on open
    setQuery('')
    setSelected(0)
    inputRef.current?.focus()
  }, [open])

  // Load the active connection's tables (for "open table" commands).
  useEffect(() => {
    if (!open || !activeBackendId || !activeIsRelational) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear tables when palette closed / not relational
      setTables([])
      return
    }
    let cancelled = false
    window.api.db
      .tables(activeBackendId, activeDb)
      .then((t) => {
        if (!cancelled) setTables(t)
      })
      .catch(() => {
        if (!cancelled) setTables([])
      })
    return () => {
      cancelled = true
    }
  }, [open, activeBackendId, activeIsRelational, activeDb])

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = []
    list.push({
      id: 'new-connection',
      label: 'New connection',
      group: 'Actions',
      icon: <Plus size={14} />,
      run: onNewConnection
    })
    if (active && activeBackendId) {
      if (activeIsRelational) {
        list.push({
          id: 'new-query',
          label: 'New query tab',
          hint: active.config.name,
          group: 'Actions',
          icon: <Terminal size={14} />,
          run: () => openQueryTab(active.id)
        })
      }
      list.push({
        id: 'disconnect',
        label: `Disconnect ${active.config.name}`,
        group: 'Actions',
        icon: <Unplug size={14} />,
        run: () => void closeConnection(active.id)
      })
      for (const table of tables) {
        list.push({
          id: `table:${table}`,
          label: table,
          hint: 'Open table',
          group: 'Tables',
          icon: <Table2 size={14} />,
          run: () => openTableTab(active.id, table)
        })
      }
    }
    for (const conn of connections) {
      list.push({
        id: `conn:${conn.id}`,
        label: conn.name,
        hint: conn.kind,
        group: 'Connections',
        icon: <Database size={14} />,
        run: () => void openConnection(conn)
      })
    }
    return list
  }, [
    active,
    activeBackendId,
    activeIsRelational,
    tables,
    connections,
    onNewConnection,
    openQueryTab,
    closeConnection,
    openTableTab,
    openConnection
  ])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    )
  }, [commands, query])

  // Keep the selection in range as the filtered list changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clamp selection to filtered range
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  if (!open) return null

  const run = (cmd: Command): void => {
    cmd.run()
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cmd = filtered[selected]
      if (cmd) run(cmd)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Group the filtered commands while preserving order.
  const groups: { name: string; items: Command[] }[] = []
  for (const cmd of filtered) {
    let g = groups.find((x) => x.name === cmd.group)
    if (!g) {
      g = { name: cmd.group, items: [] }
      groups.push(g)
    }
    g.items.push(cmd)
  }
  let flatIndex = -1

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search size={15} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search connections, tables, actions…"
            className="w-full bg-transparent text-sm text-text placeholder:text-faint focus:outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted">No matches</div>
          ) : (
            groups.map((group) => (
              <div key={group.name}>
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-faint">
                  {group.name}
                </div>
                {group.items.map((cmd) => {
                  flatIndex++
                  const isSelected = flatIndex === selected
                  const idx = flatIndex
                  return (
                    <button
                      key={cmd.id}
                      onMouseMove={() => setSelected(idx)}
                      onClick={() => run(cmd)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px]',
                        isSelected ? 'bg-accent-soft text-text' : 'text-muted'
                      )}
                    >
                      <span className="shrink-0 text-faint">{cmd.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                      {cmd.hint && (
                        <span className="shrink-0 text-[11px] text-faint">{cmd.hint}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
