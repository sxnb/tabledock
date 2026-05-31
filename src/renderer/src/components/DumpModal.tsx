import { useState } from 'react'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Toggle } from './ui/Toggle'
import { Spinner } from './ui/Spinner'

interface DumpModalProps {
  open: boolean
  onClose: () => void
  onCreate: (includeCreateDatabase: boolean) => Promise<void>
  /** Whether CREATE DATABASE applies (MySQL/PostgreSQL). */
  supportsCreateDatabase: boolean
}

export function DumpModal({
  open,
  onClose,
  onCreate,
  supportsCreateDatabase
}: DumpModalProps): React.JSX.Element {
  const [includeCreate, setIncludeCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onCreate(supportsCreateDatabase && includeCreate)
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
      title="Create database dump"
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
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner size={14} className="text-white" /> : null}
            Create dump
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Toggle
          id="dump-create-db"
          label="Include CREATE DATABASE query"
          checked={supportsCreateDatabase && includeCreate}
          onChange={(v) => supportsCreateDatabase && setIncludeCreate(v)}
        />
        {!supportsCreateDatabase && (
          <p className="text-xs text-faint">Not applicable for this connection type.</p>
        )}
      </div>
    </Modal>
  )
}
