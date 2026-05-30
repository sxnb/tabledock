import { useState } from 'react'
import type { ColumnMeta } from '@shared/types'
import { inputKind, toTypedValue } from '@renderer/lib/columnInput'
import { Modal } from '@renderer/components/ui/Modal'
import { Button } from '@renderer/components/ui/Button'
import { Input } from '@renderer/components/ui/Input'
import { Select } from '@renderer/components/ui/Select'
import { Spinner } from '@renderer/components/ui/Spinner'

interface RowEditModalProps {
  open: boolean
  table: string
  columns: string[]
  columnsMeta: ColumnMeta[]
  /** Current row values, aligned with `columns`. */
  values: unknown[]
  onClose: () => void
  /** Persist only the changed/filled columns; should throw on failure. */
  onSave: (changes: Record<string, unknown>) => Promise<void>
  title?: string
  submitLabel?: string
}

const toDraft = (value: unknown): string => (value == null ? '' : String(value))

/** A dynamic per-column form for editing a single row. */
export function RowEditModal({
  open,
  table,
  columns,
  columnsMeta,
  values,
  onClose,
  onSave,
  title,
  submitLabel = 'Save changes'
}: RowEditModalProps): React.JSX.Element {
  const metaByName = new Map(columnsMeta.map((m) => [m.name, m]))
  const initial = columns.map((_, i) => toDraft(values[i]))
  const [drafts, setDrafts] = useState<string[]>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    const changes: Record<string, unknown> = {}
    columns.forEach((col, i) => {
      if (drafts[i] !== initial[i]) changes[col] = toTypedValue(metaByName.get(col), drafts[i])
    })
    if (Object.keys(changes).length === 0) {
      onClose()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(changes)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const setDraft = (index: number, value: string): void =>
    setDrafts((d) => d.map((v, i) => (i === index ? value : v)))

  return (
    <Modal
      open={open}
      title={title ?? `Edit row · ${table}`}
      onClose={onClose}
      footer={
        <>
          {error && (
            <span className="mr-auto max-w-[220px] truncate text-xs text-danger" title={error}>
              {error}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? <Spinner size={14} className="text-white" /> : null}
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {columns.map((col, i) => {
          const meta = metaByName.get(col)
          const kind = inputKind(meta)
          const label = (
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
              {col}
              {meta?.isPrimaryKey && <span className="text-[9px] text-accent">PK</span>}
              <span className="text-faint">· {meta?.dataType ?? '?'}</span>
            </span>
          )
          if (kind === 'enum' || kind === 'boolean') {
            const options = kind === 'boolean' ? ['true', 'false'] : (meta?.enumValues ?? [])
            return (
              <label key={col} className="flex flex-col gap-1.5">
                {label}
                <Select value={drafts[i]} onChange={(e) => setDraft(i, e.target.value)}>
                  {meta?.nullable && <option value="">(null)</option>}
                  {options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </Select>
              </label>
            )
          }
          return (
            <label key={col} className="flex flex-col gap-1.5">
              {label}
              <Input
                type={kind === 'number' ? 'number' : 'text'}
                value={drafts[i]}
                onChange={(e) => setDraft(i, e.target.value)}
              />
            </label>
          )
        })}
      </div>
    </Modal>
  )
}
