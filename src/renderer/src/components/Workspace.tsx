import { Database, AlertTriangle, RotateCcw } from 'lucide-react'
import { useWorkspace } from '@renderer/store/workspace'
import { KIND_META } from '@renderer/lib/kinds'
import { Spinner } from './ui/Spinner'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { RelationalWorkspace } from './relational/RelationalWorkspace'
import { RedisWorkspace } from './redis/RedisWorkspace'

export function Workspace(): React.JSX.Element {
  const activeSessionId = useWorkspace((s) => s.activeSessionId)
  const session = useWorkspace((s) => (activeSessionId ? s.sessions[activeSessionId] : null))
  const openConnection = useWorkspace((s) => s.openConnection)

  if (!session) {
    return (
      <div className="dd-glow relative flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-blue text-white shadow-[0_0_30px_rgba(139,123,255,0.45)]">
          <Database size={26} />
        </div>
        <h1 className="text-lg font-semibold text-text">Welcome to DataDock</h1>
        <p className="max-w-sm text-xs leading-relaxed text-muted">
          Select a connection from the sidebar to open it, or create a new one to connect to MySQL,
          PostgreSQL, Redis, or SQLite.
        </p>
      </div>
    )
  }

  const meta = KIND_META[session.config.kind]

  if (session.status === 'connecting') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Spinner size={22} />
        <p className="text-xs text-muted">
          Connecting to <span className="text-text">{session.config.name}</span>…
        </p>
      </div>
    )
  }

  if (session.status === 'error') {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} className="text-danger" />}
        title="Connection failed"
        description={session.error}
        action={
          <Button variant="secondary" onClick={() => void openConnection(session.config)}>
            <RotateCcw size={14} />
            Retry
          </Button>
        }
      />
    )
  }

  return meta.relational ? (
    <RelationalWorkspace session={session} />
  ) : (
    <RedisWorkspace session={session} />
  )
}
