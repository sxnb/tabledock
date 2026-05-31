import { useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import { useSettings } from '@renderer/store/settings'
import { Modal } from '@renderer/components/ui/Modal'
import { Button } from '@renderer/components/ui/Button'
import { Spinner } from '@renderer/components/ui/Spinner'

interface DocumentEditModalProps {
  open: boolean
  title: string
  initialJson: string
  submitLabel: string
  onClose: () => void
  onSave: (jsonText: string) => Promise<void>
}

/** A JSON editor modal for inserting/editing a MongoDB document. */
export function DocumentEditModal({
  open,
  title,
  initialJson,
  submitLabel,
  onClose,
  onSave
}: DocumentEditModalProps): React.JSX.Element {
  const resolvedTheme = useSettings((s) => s.resolvedTheme)
  const [text, setText] = useState(initialJson)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await onSave(text)
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
      title={title}
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
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="overflow-hidden rounded-md border border-border">
        <CodeMirror
          value={text}
          onChange={setText}
          height="320px"
          theme={resolvedTheme === 'dark' ? oneDark : 'light'}
          extensions={[json()]}
          basicSetup={{ highlightActiveLine: true, foldGutter: true }}
        />
      </div>
    </Modal>
  )
}
