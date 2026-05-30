import { useEffect, useState } from 'react'
import type { ConnectionConfig } from '@shared/types'
import { useConnections } from './store/connections'
import { useSettings } from './store/settings'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { ConnectionForm } from './components/ConnectionForm'
import { TooltipProvider } from './components/ui/Tooltip'

function App(): React.JSX.Element {
  const load = useConnections((s) => s.load)
  const loadSettings = useSettings((s) => s.load)
  const themeMode = useSettings((s) => s.settings.themeMode)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionConfig | null>(null)

  useEffect(() => {
    void load()
    void loadSettings()
  }, [load, loadSettings])

  // Apply the resolved color theme to <html>; follow the OS when 'system'.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const resolved = themeMode === 'system' ? (mq.matches ? 'dark' : 'light') : themeMode
      document.documentElement.dataset.theme = resolved
    }
    apply()
    if (themeMode !== 'system') return
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [themeMode])

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
      </div>
    </TooltipProvider>
  )
}

export default App
