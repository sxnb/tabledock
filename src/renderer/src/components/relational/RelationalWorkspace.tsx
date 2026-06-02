import { useEffect, useMemo, useState } from 'react'
import {
  Table2,
  Terminal,
  Plus,
  Search,
  RefreshCw,
  Workflow,
  History,
  Bookmark,
  Pencil,
  Trash2
} from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { Session } from '@renderer/store/workspace'
import { useWorkspace } from '@renderer/store/workspace'
import { Select } from '@renderer/components/ui/Select'
import { Tabs, type TabItem } from '@renderer/components/ui/Tabs'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Button } from '@renderer/components/ui/Button'
import { Input } from '@renderer/components/ui/Input'
import { Modal } from '@renderer/components/ui/Modal'
import { Spinner } from '@renderer/components/ui/Spinner'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { toast } from '@renderer/store/toasts'
import { cn } from '@renderer/lib/cn'
import { TableDataTab } from './TableDataTab'
import { QueryTab } from './QueryTab'
import { RelationsView } from './RelationsView'
import { QueryHistoryPanel } from './QueryHistoryPanel'
import { SavedQueriesPanel } from './SavedQueriesPanel'
import { CreateTableModal } from './CreateTableModal'

function tabIcon(kind: string): React.JSX.Element {
  if (kind === 'query') return <Terminal size={12} />
  if (kind === 'relations') return <Workflow size={12} />
  return <Table2 size={12} />
}

export function RelationalWorkspace({ session }: { session: Session }): React.JSX.Element {
  const sessionId = session.sessionId as string
  const isSqlite = session.config.kind === 'sqlite'

  const setSelectedDatabase = useWorkspace((s) => s.setSelectedDatabase)
  const openTableTab = useWorkspace((s) => s.openTableTab)
  const openTableTabFiltered = useWorkspace((s) => s.openTableTabFiltered)
  const openQueryTab = useWorkspace((s) => s.openQueryTab)
  const openRelationsTab = useWorkspace((s) => s.openRelationsTab)
  const setActiveTab = useWorkspace((s) => s.setActiveTab)
  const setTabSql = useWorkspace((s) => s.setTabSql)
  const closeTab = useWorkspace((s) => s.closeTab)
  const duplicateTab = useWorkspace((s) => s.duplicateTab)
  const closeTabsToLeft = useWorkspace((s) => s.closeTabsToLeft)
  const closeTabsToRight = useWorkspace((s) => s.closeTabsToRight)
  const closeAllTabs = useWorkspace((s) => s.closeAllTabs)

  const [databases, setDatabases] = useState<string[]>([])
  const [tables, setTables] = useState<string[]>([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)
  const [savedReloadToken, setSavedReloadToken] = useState(0)
  // Pending database switch awaiting confirmation (set when tabs are open).
  const [pendingDatabase, setPendingDatabase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  // Schema-editing targets for the table list context menu.
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dropTableTarget, setDropTableTarget] = useState<string | null>(null)
  const [newDbOpen, setNewDbOpen] = useState(false)
  const [newDbName, setNewDbName] = useState('')
  const [createTableOpen, setCreateTableOpen] = useState(false)

  const readOnly = Boolean(session.config.readOnly)
  const activeDatabase = isSqlite ? undefined : session.selectedDatabase

  // Load the database list once the backend session is live, then pick a default.
  useEffect(() => {
    let cancelled = false
    window.api.db
      .databases(sessionId)
      .then((dbs) => {
        if (cancelled) return
        setDatabases(dbs)
        if (!session.selectedDatabase) {
          const preferred =
            (session.config.database && dbs.includes(session.config.database)
              ? session.config.database
              : undefined) ?? dbs[0]
          if (preferred) setSelectedDatabase(session.id, preferred)
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const loadTables = useMemo(
    () => async (): Promise<void> => {
      setLoadingTables(true)
      setError(null)
      try {
        const t = await window.api.db.tables(sessionId, session.selectedDatabase)
        setTables(t)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoadingTables(false)
      }
    },
    [sessionId, session.selectedDatabase]
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- table fetch sets loading/tables intentionally
    if (isSqlite || session.selectedDatabase) void loadTables()
  }, [isSqlite, session.selectedDatabase, loadTables])

  const filtered = tables.filter((t) => t.toLowerCase().includes(filter.toLowerCase()))

  // Switching databases invalidates open tabs (they reference the old DB), so
  // close them all — confirming first when any are open.
  const requestDatabaseChange = (next: string): void => {
    if (next === session.selectedDatabase) return
    if (session.tabs.length === 0) {
      setSelectedDatabase(session.id, next)
    } else {
      setPendingDatabase(next)
    }
  }

  const confirmDatabaseChange = (): void => {
    if (pendingDatabase === null) return
    closeAllTabs(session.id)
    setSelectedDatabase(session.id, pendingDatabase)
    setPendingDatabase(null)
  }

  // Close any open tabs that reference a table (after rename/drop).
  const closeTabsForTable = (tbl: string): void => {
    session.tabs
      .filter((t) => t.kind === 'table' && t.table === tbl)
      .forEach((t) => closeTab(session.id, t.id))
  }

  const confirmRename = async (): Promise<void> => {
    const next = renameValue.trim()
    if (!next || !renameTarget || next === renameTarget) {
      setRenameTarget(null)
      return
    }
    try {
      await window.api.db.renameTable(sessionId, renameTarget, next, activeDatabase)
      toast.success(`Renamed ${renameTarget} → ${next}`)
      closeTabsForTable(renameTarget)
      await loadTables()
      openTableTab(session.id, next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setRenameTarget(null)
    }
  }

  const createDatabase = async (): Promise<void> => {
    const name = newDbName.trim()
    if (!name) return
    try {
      await window.api.db.createDatabase(sessionId, name)
      toast.success(`Created database ${name}`)
      setNewDbOpen(false)
      setNewDbName('')
      const dbs = await window.api.db.databases(sessionId)
      setDatabases(dbs)
      setSelectedDatabase(session.id, name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const createTable = async (
    table: string,
    columns: Parameters<typeof window.api.db.createTable>[2],
    primaryKey: string[]
  ): Promise<void> => {
    await window.api.db.createTable(sessionId, table, columns, primaryKey, activeDatabase)
    toast.success(`Created table ${table}`)
    setCreateTableOpen(false)
    await loadTables()
    openTableTab(session.id, table)
  }

  const confirmDropTable = async (): Promise<void> => {
    if (!dropTableTarget) return
    try {
      await window.api.db.dropTable(sessionId, dropTableTarget, activeDatabase)
      toast.success(`Dropped table ${dropTableTarget}`)
      closeTabsForTable(dropTableTarget)
      await loadTables()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setDropTableTarget(null)
    }
  }

  const activeTab = session.tabs.find((t) => t.id === session.activeTabId) ?? null
  const tabItems: TabItem[] = session.tabs.map((t) => ({
    id: t.id,
    title: t.title,
    icon: tabIcon(t.kind)
  }))

  return (
    <div className="flex h-full min-h-0">
      {/* Left rail: database picker + table list */}
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        {!isSqlite && (
          <div className="flex items-center gap-2 p-2.5">
            <div className="min-w-0 flex-1">
              <Select
                value={session.selectedDatabase ?? ''}
                onChange={(e) => requestDatabaseChange(e.target.value)}
              >
                {databases.length === 0 && <option value="">(no databases)</option>}
                {databases.map((db) => (
                  <option key={db} value={db}>
                    {db}
                  </option>
                ))}
              </Select>
            </div>
            {!readOnly && (
              <IconButton label="New database" onClick={() => setNewDbOpen(true)}>
                <Plus size={14} />
              </IconButton>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-lg">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <div className="relative flex-1">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter tables…"
                className="h-7 w-full rounded-md border border-border bg-surface-2 pl-7 pr-2 text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>
            {!readOnly && (
              <IconButton label="New table" onClick={() => setCreateTableOpen(true)}>
                <Plus size={12} />
              </IconButton>
            )}
            <IconButton label="Refresh tables" onClick={() => void loadTables()}>
              {loadingTables ? <Spinner size={12} /> : <RefreshCw size={12} />}
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {filtered.length === 0 && !loadingTables && (
              <p className="px-2 py-3 text-xs text-faint">
                {tables.length === 0 ? 'No tables' : 'No matches'}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {filtered.map((table) => {
                const isActive = activeTab?.kind === 'table' && activeTab.table === table
                const tableButton = (
                  <button
                    onClick={() => openTableTab(session.id, table)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                      isActive
                        ? 'bg-accent-soft text-text'
                        : 'text-muted hover:bg-surface-2 hover:text-text'
                    )}
                  >
                    <Table2 size={13} className="shrink-0 text-faint" />
                    <span className="truncate font-mono">{table}</span>
                  </button>
                )
                return (
                  <li key={table}>
                    {readOnly ? (
                      tableButton
                    ) : (
                      <ContextMenu.Root>
                        <ContextMenu.Trigger asChild>{tableButton}</ContextMenu.Trigger>
                        <ContextMenu.Portal>
                          <ContextMenu.Content className="z-50 min-w-44 overflow-hidden rounded-md border border-border bg-surface-2 p-1 text-xs text-text shadow-xl">
                            <ContextMenu.Item
                              onSelect={() => {
                                setRenameValue(table)
                                setRenameTarget(table)
                              }}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-text"
                            >
                              <Pencil size={13} className="text-faint" />
                              Rename table…
                            </ContextMenu.Item>
                            <ContextMenu.Separator className="my-1 h-px bg-border" />
                            <ContextMenu.Item
                              onSelect={() => setDropTableTarget(table)}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-danger outline-none data-[highlighted]:bg-danger/15"
                            >
                              <Trash2 size={13} />
                              Drop table
                            </ContextMenu.Item>
                          </ContextMenu.Content>
                        </ContextMenu.Portal>
                      </ContextMenu.Root>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      {/* Right: tabs + active content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Tabs
          tabs={tabItems}
          activeId={session.activeTabId}
          onSelect={(id) => setActiveTab(session.id, id)}
          onClose={(id) => closeTab(session.id, id)}
          menu={{
            onDuplicate: (id) => duplicateTab(session.id, id),
            onCloseLeft: (id) => closeTabsToLeft(session.id, id),
            onCloseRight: (id) => closeTabsToRight(session.id, id),
            onCloseAll: () => closeAllTabs(session.id)
          }}
          trailing={
            <div className="flex items-center">
              <IconButton label="Relation diagram" onClick={() => openRelationsTab(session.id)}>
                <Workflow size={15} />
              </IconButton>
              <IconButton
                label="Query history"
                onClick={() => setHistoryOpen((o) => !o)}
                className={cn(historyOpen && 'bg-surface-2 text-text')}
              >
                <History size={15} />
              </IconButton>
              <IconButton
                label="Saved queries"
                onClick={() => setSavedOpen((o) => !o)}
                className={cn(savedOpen && 'bg-surface-2 text-text')}
              >
                <Bookmark size={15} />
              </IconButton>
              <IconButton label="New query tab" onClick={() => openQueryTab(session.id)}>
                <Plus size={15} />
              </IconButton>
            </div>
          }
        />

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {error && session.tabs.length === 0 ? (
            <EmptyState title="Couldn't load schema" description={error} />
          ) : !activeTab ? (
            <EmptyState
              icon={<Table2 size={28} />}
              title="Pick a table to browse"
              description="Select a table on the left to view its rows, or open a Query tab to run SQL."
              action={
                <Button variant="secondary" onClick={() => openQueryTab(session.id)}>
                  <Terminal size={14} />
                  New query
                </Button>
              }
            />
          ) : activeTab.kind === 'table' ? (
            <TableDataTab
              key={activeTab.id}
              sessionId={sessionId}
              table={activeTab.table as string}
              kind={session.config.kind}
              database={isSqlite ? undefined : session.selectedDatabase}
              readOnly={session.config.readOnly}
              initialFilter={activeTab.initialFilter}
              onNavigateForeignKey={(targetTable, targetColumn, value) =>
                openTableTabFiltered(session.id, targetTable, {
                  column: targetColumn,
                  operator: 'eq',
                  value: value == null ? '' : String(value)
                })
              }
            />
          ) : activeTab.kind === 'relations' ? (
            <RelationsView
              key={activeTab.id}
              sessionId={sessionId}
              database={isSqlite ? undefined : session.selectedDatabase}
            />
          ) : (
            <QueryTab
              key={activeTab.id}
              sessionId={sessionId}
              connectionId={session.id}
              kind={session.config.kind}
              database={isSqlite ? undefined : session.selectedDatabase}
              sql={activeTab.sql ?? ''}
              onSqlChange={(value) => setTabSql(session.id, activeTab.id, value)}
              onSaved={() => setSavedReloadToken((t) => t + 1)}
            />
          )}

          <QueryHistoryPanel
            connectionId={session.id}
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            onSelect={(sql) => {
              openQueryTab(session.id, sql)
              setHistoryOpen(false)
            }}
          />

          <SavedQueriesPanel
            connectionId={session.id}
            open={savedOpen}
            reloadToken={savedReloadToken}
            onClose={() => setSavedOpen(false)}
            onSelect={(sql) => {
              openQueryTab(session.id, sql)
              setSavedOpen(false)
            }}
          />
        </div>
      </div>

      <ConfirmDialog
        open={pendingDatabase !== null}
        title="Change database?"
        description={`Switching to "${pendingDatabase}" will close all open tabs for this connection.`}
        confirmLabel="Change & close tabs"
        onConfirm={confirmDatabaseChange}
        onCancel={() => setPendingDatabase(null)}
      />

      <Modal
        open={renameTarget !== null}
        title={`Rename ${renameTarget ?? ''}`}
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void confirmRename()}
              disabled={!renameValue.trim() || renameValue.trim() === renameTarget}
            >
              Rename
            </Button>
          </>
        }
      >
        <Input
          label="New name"
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void confirmRename()
          }}
        />
      </Modal>

      <ConfirmDialog
        open={dropTableTarget !== null}
        title="Drop table?"
        description={`This permanently deletes the table "${dropTableTarget}" and all its data.`}
        confirmLabel="Drop table"
        variant="danger"
        onConfirm={() => void confirmDropTable()}
        onCancel={() => setDropTableTarget(null)}
      />

      <Modal
        open={newDbOpen}
        title="Create database"
        onClose={() => setNewDbOpen(false)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setNewDbOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void createDatabase()}
              disabled={!newDbName.trim()}
            >
              Create
            </Button>
          </>
        }
      >
        <Input
          label="Database name"
          autoFocus
          value={newDbName}
          onChange={(e) => setNewDbName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void createDatabase()
          }}
        />
      </Modal>

      {createTableOpen && (
        <CreateTableModal onClose={() => setCreateTableOpen(false)} onCreate={createTable} />
      )}
    </div>
  )
}
