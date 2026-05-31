import { useMemo, useState } from 'react'
import { Braces, Copy } from 'lucide-react'
import { Modal } from '@renderer/components/ui/Modal'
import { Button } from '@renderer/components/ui/Button'
import { Spinner } from '@renderer/components/ui/Spinner'
import { toast } from '@renderer/store/toasts'

interface CellDetailModalProps {
  open: boolean
  column: string
  value: unknown
  /** When false the value is shown read-only (e.g. query results, no PK). */
  editable: boolean
  onClose: () => void
  /** Persist the edited text; should throw on failure. */
  onSave: (text: string) => Promise<void>
}

function toText(value: unknown): string {
  if (value == null) return ''
  return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
}

/** A larger view/edit surface for a single cell — long text, JSON, blobs. */
export function CellDetailModal({
  open,
  column,
  value,
  editable,
  onClose,
  onSave
}: CellDetailModalProps): React.JSX.Element {
  const initial = useMemo(() => toText(value), [value])
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)

  const isJson = useMemo(() => {
    const t = draft.trim()
    if (!t || (t[0] !== '{' && t[0] !== '[')) return false
    try {
      JSON.parse(t)
      return true
    } catch {
      return false
    }
  }, [draft])

  const formatJson = (): void => {
    try {
      setDraft(JSON.stringify(JSON.parse(draft), null, 2))
    } catch {
      toast.error('Not valid JSON')
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await onSave(draft)
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={column}
      onClose={onClose}
      footer={
        <>
          <div className="mr-auto flex items-center gap-2">
            {isJson && (
              <Button variant="ghost" size="sm" onClick={formatJson}>
                <Braces size={13} />
                Format JSON
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(draft)
                toast.success('Copied')
              }}
            >
              <Copy size={13} />
              Copy
            </Button>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            {editable ? 'Cancel' : 'Close'}
          </Button>
          {editable && (
            <Button
              variant="primary"
              size="sm"
              onClick={save}
              disabled={saving || draft === initial}
            >
              {saving && <Spinner size={13} className="text-white" />}
              Save
            </Button>
          )}
        </>
      }
    >
      <textarea
        autoFocus
        readOnly={!editable}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        className="h-72 w-full resize-none rounded-md border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-text focus:border-accent focus:outline-none"
      />
      <div className="mt-1.5 text-[11px] text-faint">
        {value === null ? 'NULL' : `${draft.length} character${draft.length === 1 ? '' : 's'}`}
      </div>
    </Modal>
  )
}
