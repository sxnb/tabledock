import { Database, AlertTriangle, RotateCcw, Command } from 'lucide-react'
import { useWorkspace } from '@renderer/store/workspace'
import { KIND_META } from '@renderer/lib/kinds'
import { Spinner } from './ui/Spinner'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { RelationalWorkspace } from './relational/RelationalWorkspace'
import { RedisWorkspace } from './redis/RedisWorkspace'
import { MongoWorkspace } from './mongo/MongoWorkspace'

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
const MOD = IS_MAC ? '⌘' : 'Ctrl'

function Kbd({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <kbd className="inline-flex min-w-[1.4rem] items-center justify-center rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium text-text shadow-sm">
      {children}
    </kbd>
  )
}

function WelcomeScreen(): React.JSX.Element {
  return (
    <div className="dd-glow relative flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[radial-gradient(circle_at_50%_42%,rgba(157,139,255,0.6),#0a0c14_72%)] text-white shadow-[0_0_30px_rgba(139,123,255,0.45)] ring-1 ring-white/10">
        <Database size={26} />
      </div>

      <div className="flex flex-col items-center gap-2">
        <h1 className="text-lg font-semibold text-text">Welcome to DataDock</h1>
        <p className="max-w-md text-xs leading-relaxed text-muted">
          A sleek desktop client for MySQL, MariaDB, PostgreSQL, SQL Server, MongoDB, Redis, and
          SQLite. Pick a connection from the sidebar to open it, or create a new one to get started.
        </p>
      </div>

      {/* Command palette highlight */}
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3 text-left">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Command size={16} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-text">
            <Kbd>{MOD}</Kbd>
            <Kbd>K</Kbd>
            <span className="ml-1 text-muted">opens the command palette</span>
          </span>
          <span className="text-[11px] text-faint">
            Jump to any connection, table, or action — no clicking required.
          </span>
        </div>
      </div>
    </div>
  )
}

export function Workspace(): React.JSX.Element {
  const activeSessionId = useWorkspace((s) => s.activeSessionId)
  const session = useWorkspace((s) => (activeSessionId ? s.sessions[activeSessionId] : null))
  const openConnection = useWorkspace((s) => s.openConnection)

  if (!session) {
    return <WelcomeScreen />
  }

  const meta = KIND_META[session.config.kind]

  let content: React.JSX.Element
  if (session.status === 'connecting') {
    content = (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Spinner size={22} />
        <p className="text-xs text-muted">
          Connecting to <span className="text-text">{session.config.name}</span>…
        </p>
      </div>
    )
  } else if (session.status === 'error') {
    content = (
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
  } else {
    content = meta.relational ? (
      <RelationalWorkspace session={session} />
    ) : session.config.kind === 'mongodb' ? (
      <MongoWorkspace session={session} />
    ) : (
      <RedisWorkspace session={session} />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Thin accent bar lets users identify the connection by its color. */}
      {session.config.color && (
        <div className="h-[3px] shrink-0" style={{ background: session.config.color }} />
      )}
      <div className="min-h-0 flex-1">{content}</div>
    </div>
  )
}
