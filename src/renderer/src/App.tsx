import { useEffect, useState } from 'react'
import type { ConnectionConfig } from '@shared/types'
import { useConnections } from './store/connections'
import { Sidebar } from './components/Sidebar'
import { Workspace } from './components/Workspace'
import { ConnectionForm } from './components/ConnectionForm'

function App(): React.JSX.Element {
  const load = useConnections((s) => s.load)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionConfig | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const openNew = (): void => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (config: ConnectionConfig): void => {
    setEditing(config)
    setFormOpen(true)
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg text-text">
      <Sidebar onNew={openNew} onEdit={openEdit} />
      <main className="min-w-0 flex-1">
        <Workspace />
      </main>
      <ConnectionForm open={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
    </div>
  )
}

export default App
