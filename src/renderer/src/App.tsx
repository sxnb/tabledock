import { useEffect, useState } from 'react'
import type { ConnectionConfig } from '@shared/types'
import { useConnections } from './store/connections'
import { useSettings } from './store/settings'
import { useWorkspace } from './store/workspace'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { ConnectionForm } from './components/ConnectionForm'
import { ImportSqlModal } from './components/ImportSqlModal'
import { DumpModal } from './components/DumpModal'
import { TooltipProvider } from './components/ui/Tooltip'

function App(): React.JSX.Element {
  const load = useConnections((s) => s.load)
  const loadSettings = useSettings((s) => s.load)
  const themeMode = useSettings((s) => s.settings.themeMode)
  const setResolvedTheme = useSettings((s) => s.setResolvedTheme)
  const activeSessionId = useWorkspace((s) => s.activeSessionId)
  const active = useWorkspace((s) => (activeSessionId ? s.sessions[activeSessionId] : null))
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionConfig | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [dumpOpen, setDumpOpen] = useState(false)

  useEffect(() => {
    void load()
    void loadSettings()
  }, [load, loadSettings])

  // Apply the resolved color theme to <html>, sync the native window
  // background, and expose it for theme-aware components. Follow the OS for
  // 'system'.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved = themeMode === 'system' ? (mq.matches ? 'dark' : 'light') : themeMode
      document.documentElement.dataset.theme = resolved
      setResolvedTheme(resolved)
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim()
      if (bg) window.api.app.setBackgroundColor(bg)
    }
    apply()
    if (themeMode !== 'system') return
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [themeMode, setResolvedTheme])

  // Keep the native menu in sync with the active connection.
  const activeKind = active?.config.kind ?? null
  const activeBackendId = active?.status === 'connected' ? (active.sessionId ?? null) : null
  const activeName = active?.config.name
  const activeDb = active && active.config.kind !== 'sqlite' ? active.selectedDatabase : undefined
  useEffect(() => {
    window.api.menu.setContext(
      activeBackendId
        ? { sessionId: activeBackendId, kind: activeKind, database: activeDb, name: activeName }
        : { sessionId: null, kind: null }
    )
  }, [activeBackendId, activeKind, activeDb, activeName])

  // Menu actions: Disconnect closes the active connection; Import/Dump open dialogs.
  useEffect(() => {
    return window.api.menu.onDisconnect(() => {
      const { activeSessionId: id, closeConnection } = useWorkspace.getState()
      if (id) void closeConnection(id)
    })
  }, [])
  useEffect(() => window.api.menu.onImport(() => setImportOpen(true)), [])
  useEffect(() => window.api.menu.onDump(() => setDumpOpen(true)), [])

  const runImport = async (paths: string[]): Promise<void> => {
    if (activeBackendId) await window.api.db.importSqlFiles(activeBackendId, paths, activeDb)
  }
  const runDump = async (includeCreateDatabase: boolean): Promise<void> => {
    if (activeBackendId) {
      await window.api.db.createDump(activeBackendId, {
        database: activeDb,
        includeCreateDatabase,
        name: activeName
      })
    }
  }

  const openNew = (): void => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (config: ConnectionConfig): void => {
    setEditing(config)
    setFormOpen(true)
  }

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
        <Sidebar onNew={openNew} onEdit={openEdit} />
        <main className="min-w-0 flex-1">
          <Workspace />
        </main>
        <ConnectionForm open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
        {importOpen && (
          <ImportSqlModal open onClose={() => setImportOpen(false)} onImport={runImport} />
        )}
        {dumpOpen && (
          <DumpModal
            open
            onClose={() => setDumpOpen(false)}
            onCreate={runDump}
            supportsCreateDatabase={activeKind === 'mysql' || activeKind === 'postgres'}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

export default App
