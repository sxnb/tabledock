import { useState } from 'react'
import { FileUp, X } from 'lucide-react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { IconButton } from './ui/IconButton'
import { Spinner } from './ui/Spinner'
import { cn } from '@renderer/lib/cn'

interface ImportSqlModalProps {
  open: boolean
  onClose: () => void
  onImport: (paths: string[]) => Promise<void>
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p

export function ImportSqlModal({
  open,
  onClose,
  onImport
}: ImportSqlModalProps): React.JSX.Element {
  const [paths, setPaths] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addPaths = (incoming: string[]): void =>
    setPaths((prev) => Array.from(new Set([...prev, ...incoming])))

  const browse = async (): Promise<void> => {
    const picked = await window.api.dialog.openFiles({
      title: 'Select SQL files',
      filters: [
        { name: 'SQL', extensions: ['sql'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (picked.length) addPaths(picked)
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const dropped = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path: string }).path)
      .filter(Boolean)
    if (dropped.length) addPaths(dropped)
  }

  const submit = async (): Promise<void> => {
    if (paths.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await onImport(paths)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Import SQL files"
      onClose={onClose}
      footer={
        <>
          {error && (
            <span className="mr-auto max-w-[220px] truncate text-xs text-danger" title={error}>
              {error}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={paths.length === 0 || busy}>
            {busy ? <Spinner size={14} className="text-white" /> : null}
            Import
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
            dragging ? 'border-accent bg-accent-soft/40' : 'border-border'
          )}
        >
          <FileUp size={22} className="text-faint" />
          <div className="text-xs text-muted">Drag &amp; drop .sql files here</div>
          <Button variant="secondary" size="sm" onClick={browse}>
            Browse…
          </Button>
        </div>

        {paths.length > 0 && (
          <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {paths.map((p) => (
              <li
                key={p}
                className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2 py-1"
              >
                <span className="truncate font-mono text-xs text-text" title={p}>
                  {baseName(p)}
                </span>
                <IconButton
                  label="Remove"
                  className="h-6 w-6"
                  onClick={() => setPaths((prev) => prev.filter((x) => x !== p))}
                >
                  <X size={12} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
