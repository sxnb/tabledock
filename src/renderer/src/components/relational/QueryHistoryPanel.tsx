import { useEffect, useState } from 'react'
import { History, X, Trash2, CheckCircle2, XCircle } from 'lucide-react'
import type { QueryHistoryEntry } from '@shared/types'
import { IconButton } from '@renderer/components/ui/IconButton'
import { cn } from '@renderer/lib/cn'

function relativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return new Date(ts).toLocaleString()
}

interface QueryHistoryPanelProps {
  connectionId: string
  open: boolean
  onClose: () => void
  onSelect: (sql: string) => void
}

/**
 * Right-side sliding panel listing the connection's executed queries
 * (most recent first). Clicking an entry hands its SQL back to the caller.
 */
export function QueryHistoryPanel({
  connectionId,
  open,
  onClose,
  onSelect
}: QueryHistoryPanelProps): React.JSX.Element {
  const [entries, setEntries] = useState<QueryHistoryEntry[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    window.api.history
      .list(connectionId)
      .then((e) => {
        if (!cancelled) setEntries(e)
      })
      .catch(() => {
        if (!cancelled) setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [open, connectionId])

  const clear = async (): Promise<void> => {
    await window.api.history.clear(connectionId)
    setEntries([])
  }

  return (
    <>
      {open && <div className="absolute inset-0 z-20 bg-black/20" onClick={onClose} />}
      <aside
        className={cn(
          'absolute inset-y-0 right-0 z-30 flex w-[360px] max-w-full flex-col border-l border-border bg-surface shadow-2xl',
          'transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <History size={14} className="text-accent" />
          <span className="text-sm font-semibold text-text">Query History</span>
          {entries.length > 0 && <span className="text-xs text-faint">{entries.length}</span>}
          <div className="flex-1" />
          <IconButton
            label="Clear history"
            onClick={() => void clear()}
            disabled={entries.length === 0}
          >
            <Trash2 size={14} />
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted">
              No queries run yet for this connection.
            </div>
          ) : (
            <ul className="flex flex-col">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    onClick={() => onSelect(entry.sql)}
                    className="flex w-full flex-col gap-1 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <pre className="line-clamp-3 whitespace-pre-wrap break-words font-mono text-[11px] text-text">
                      {entry.sql}
                    </pre>
                    <span className="flex items-center gap-1.5 text-[10px] text-faint">
                      {entry.ok ? (
                        <CheckCircle2 size={11} className="text-ok" />
                      ) : (
                        <XCircle size={11} className="text-danger" />
                      )}
                      {relativeTime(entry.executedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
