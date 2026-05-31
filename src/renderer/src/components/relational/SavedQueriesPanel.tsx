import { useEffect, useState } from 'react'
import { Bookmark, X, Trash2 } from 'lucide-react'
import type { SavedQuery } from '@shared/types'
import { IconButton } from '@renderer/components/ui/IconButton'
import { cn } from '@renderer/lib/cn'

interface SavedQueriesPanelProps {
  connectionId: string
  open: boolean
  /** Bumped by the caller to force a reload (e.g. after saving a new query). */
  reloadToken?: number
  onClose: () => void
  onSelect: (sql: string) => void
}

/**
 * Right-side sliding panel listing the connection's saved queries
 * (most recent first). Clicking an entry opens its SQL in a new query tab.
 */
export function SavedQueriesPanel({
  connectionId,
  open,
  reloadToken,
  onClose,
  onSelect
}: SavedQueriesPanelProps): React.JSX.Element {
  const [entries, setEntries] = useState<SavedQuery[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    window.api.savedQueries
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
  }, [open, connectionId, reloadToken])

  const remove = async (id: string): Promise<void> => {
    const next = await window.api.savedQueries.delete(connectionId, id)
    setEntries(next)
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
          <Bookmark size={14} className="text-accent" />
          <span className="text-sm font-semibold text-text">Saved Queries</span>
          {entries.length > 0 && <span className="text-xs text-faint">{entries.length}</span>}
          <div className="flex-1" />
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted">
              No saved queries for this connection yet. Save one from a query tab.
            </div>
          ) : (
            <ul className="flex flex-col">
              {entries.map((entry) => (
                <li key={entry.id} className="group flex items-start border-b border-border/60">
                  <button
                    onClick={() => onSelect(entry.sql)}
                    className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="truncate text-[13px] font-medium text-text">{entry.name}</span>
                    <pre className="line-clamp-2 whitespace-pre-wrap break-words font-mono text-[11px] text-faint">
                      {entry.sql}
                    </pre>
                  </button>
                  <IconButton
                    label="Delete saved query"
                    onClick={() => void remove(entry.id)}
                    className="mr-1 mt-1.5 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
