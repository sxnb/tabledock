import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { NewColumnSpec } from '@shared/types'
import { Modal } from '@renderer/components/ui/Modal'
import { Button } from '@renderer/components/ui/Button'
import { Input } from '@renderer/components/ui/Input'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Spinner } from '@renderer/components/ui/Spinner'
import { toast } from '@renderer/store/toasts'

interface ColumnRow {
  name: string
  type: string
  nullable: boolean
  primaryKey: boolean
  default: string
}

interface CreateTableModalProps {
  onClose: () => void
  onCreate: (table: string, columns: NewColumnSpec[], primaryKey: string[]) => Promise<void>
}

const blankRow = (): ColumnRow => ({
  name: '',
  type: '',
  nullable: true,
  primaryKey: false,
  default: ''
})

/** Build a CREATE TABLE: a table name plus a list of column definitions. */
export function CreateTableModal({ onClose, onCreate }: CreateTableModalProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [rows, setRows] = useState<ColumnRow[]>([blankRow()])
  const [saving, setSaving] = useState(false)

  const update = (i: number, patch: Partial<ColumnRow>): void =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const valid = name.trim() !== '' && rows.some((r) => r.name.trim() && r.type.trim())

  const submit = async (): Promise<void> => {
    if (!valid) return
    const columns: NewColumnSpec[] = rows
      .filter((r) => r.name.trim() && r.type.trim())
      .map((r) => ({
        name: r.name.trim(),
        type: r.type.trim(),
        // Primary-key columns are implicitly NOT NULL.
        nullable: r.primaryKey ? false : r.nullable,
        default: r.default.trim() || null
      }))
    const primaryKey = rows.filter((r) => r.primaryKey && r.name.trim()).map((r) => r.name.trim())
    setSaving(true)
    try {
      await onCreate(name.trim(), columns, primaryKey)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title="Create table"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!valid || saving}>
            {saving && <Spinner size={13} className="text-white" />}
            Create table
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Table name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. users"
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Columns</span>
          <div className="grid grid-cols-[1fr_1fr_auto_auto_1fr_auto] items-center gap-x-2 gap-y-1.5 text-[11px] text-faint">
            <span>Name</span>
            <span>Type</span>
            <span title="Nullable">Null</span>
            <span title="Primary key">PK</span>
            <span>Default</span>
            <span />
            {rows.map((r, i) => (
              <Row
                key={i}
                row={r}
                onChange={(patch) => update(i, patch)}
                onRemove={
                  rows.length > 1
                    ? () => setRows((p) => p.filter((_, idx) => idx !== i))
                    : undefined
                }
              />
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 self-start"
            onClick={() => setRows((p) => [...p, blankRow()])}
          >
            <Plus size={13} />
            Add column
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Row({
  row,
  onChange,
  onRemove
}: {
  row: ColumnRow
  onChange: (patch: Partial<ColumnRow>) => void
  onRemove?: () => void
}): React.JSX.Element {
  const cell =
    'h-7 rounded-md border border-border bg-surface px-2 text-xs text-text focus:border-accent focus:outline-none'
  return (
    <>
      <input
        value={row.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="name"
        className={cell}
      />
      <input
        value={row.type}
        onChange={(e) => onChange({ type: e.target.value })}
        placeholder="type"
        className={`${cell} font-mono`}
      />
      <input
        type="checkbox"
        checked={row.nullable}
        disabled={row.primaryKey}
        onChange={(e) => onChange({ nullable: e.target.checked })}
        className="mx-auto h-3.5 w-3.5 accent-accent"
        aria-label="Nullable"
      />
      <input
        type="checkbox"
        checked={row.primaryKey}
        onChange={(e) => onChange({ primaryKey: e.target.checked })}
        className="mx-auto h-3.5 w-3.5 accent-accent"
        aria-label="Primary key"
      />
      <input
        value={row.default}
        onChange={(e) => onChange({ default: e.target.value })}
        placeholder="default"
        className={`${cell} font-mono`}
      />
      {onRemove ? (
        <IconButton label="Remove column" onClick={onRemove}>
          <X size={13} />
        </IconButton>
      ) : (
        <span />
      )}
    </>
  )
}
