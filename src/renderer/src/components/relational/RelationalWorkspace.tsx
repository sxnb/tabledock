import { useEffect, useMemo, useState } from 'react'
import { Table2, Terminal, Plus, Search, RefreshCw, Workflow, History } from 'lucide-react'
import type { Session } from '@renderer/store/workspace'
import { useWorkspace } from '@renderer/store/workspace'
import { Select } from '@renderer/components/ui/Select'
import { Tabs, type TabItem } from '@renderer/components/ui/Tabs'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Button } from '@renderer/components/ui/Button'
import { Spinner } from '@renderer/components/ui/Spinner'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { cn } from '@renderer/lib/cn'
import { TableDataTab } from './TableDataTab'
import { QueryTab } from './QueryTab'
import { RelationsView } from './RelationsView'
import { QueryHistoryPanel } from './QueryHistoryPanel'

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
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

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
          <div className="border-b border-border p-2.5">
            <Select
              value={session.selectedDatabase ?? ''}
              onChange={(e) => setSelectedDatabase(session.id, e.target.value)}
            >
              {databases.length === 0 && <option value="">(no databases)</option>}
              {databases.map((db) => (
                <option key={db} value={db}>
                  {db}
                </option>
              ))}
            </Select>
          </div>
        )}

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
              return (
                <li key={table}>
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
                </li>
              )
            })}
          </ul>
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
              database={isSqlite ? undefined : session.selectedDatabase}
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
        </div>
      </div>
    </div>
  )
}
