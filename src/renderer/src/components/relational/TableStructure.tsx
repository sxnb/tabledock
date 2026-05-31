import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, Plus, Trash2 } from 'lucide-react'
import type { TableStructure as TableStructureData, NewColumnSpec } from '@shared/types'
import { Spinner } from '@renderer/components/ui/Spinner'
import { Button } from '@renderer/components/ui/Button'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Input } from '@renderer/components/ui/Input'
import { Modal } from '@renderer/components/ui/Modal'
import { Toggle } from '@renderer/components/ui/Toggle'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { toast } from '@renderer/store/toasts'

interface TableStructureProps {
  sessionId: string
  table: string
  database?: string
  readOnly?: boolean
  /** Called after a structure change so the data grid can refresh its columns. */
  onChanged?: () => void
}

/** View — and, when writable, edit — a table's columns, indexes, and CREATE DDL. */
export function TableStructure({
  sessionId,
  table,
  database,
  readOnly,
  onChanged
}: TableStructureProps): React.JSX.Element {
  const [data, setData] = useState<TableStructureData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await window.api.db.tableStructure(sessionId, table, database))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [sessionId, table, database])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- structure fetch sets loading/data intentionally
    void load()
  }, [load])

  const afterChange = async (): Promise<void> => {
    await load()
    onChanged?.()
  }

  const addColumn = async (spec: NewColumnSpec): Promise<void> => {
    await window.api.db.addColumn(sessionId, table, spec, database)
    toast.success(`Added column ${spec.name}`)
    await afterChange()
  }

  const confirmDrop = async (): Promise<void> => {
    if (!dropTarget) return
    try {
      await window.api.db.dropColumn(sessionId, table, dropTarget, database)
      toast.success(`Dropped column ${dropTarget}`)
      await afterChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setDropTarget(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner size={18} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center gap-2 px-6 text-center text-xs text-danger">
        <AlertTriangle size={16} /> {error}
      </div>
    )
  }

  if (!data) return <div className="p-6 text-xs text-muted">No structure available.</div>

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <Section
        title="Columns"
        action={
          !readOnly && (
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus size={13} />
              Add column
            </Button>
          )
        }
      >
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left text-faint">
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Nullable</Th>
              <Th>Default</Th>
              <Th>Extra</Th>
              {!readOnly && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {data.columns.map((c) => (
              <tr key={c.name} className="group border-t border-border/60">
                <Td>
                  <span className="flex items-center gap-1.5 font-mono text-text">
                    {c.isPrimaryKey && <KeyRound size={11} className="shrink-0 text-accent" />}
                    {c.name}
                  </span>
                </Td>
                <Td className="font-mono">{c.dataType}</Td>
                <Td>{c.nullable ? 'YES' : 'NO'}</Td>
                <Td className="font-mono">{c.default ?? <span className="text-faint">—</span>}</Td>
                <Td>{c.extra || <span className="text-faint">—</span>}</Td>
                {!readOnly && (
                  <Td className="text-right">
                    <IconButton
                      label={`Drop column ${c.name}`}
                      onClick={() => setDropTarget(c.name)}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Indexes">
        {data.indexes.length === 0 ? (
          <p className="text-xs text-faint">No indexes.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-faint">
                <Th>Name</Th>
                <Th>Columns</Th>
                <Th>Unique</Th>
              </tr>
            </thead>
            <tbody>
              {data.indexes.map((idx) => (
                <tr key={idx.name} className="border-t border-border/60">
                  <Td className="font-mono text-text">{idx.name}</Td>
                  <Td className="font-mono">{idx.columns.join(', ')}</Td>
                  <Td>{idx.unique ? 'YES' : 'NO'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {data.createSql && (
        <Section title="CREATE statement">
          <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text">
            {data.createSql}
          </pre>
        </Section>
      )}

      {addOpen && <AddColumnModal onClose={() => setAddOpen(false)} onAdd={addColumn} />}

      <ConfirmDialog
        open={dropTarget !== null}
        title="Drop column?"
        description={`This permanently removes the column "${dropTarget}" and its data.`}
        confirmLabel="Drop column"
        variant="danger"
        onConfirm={() => void confirmDrop()}
        onCancel={() => setDropTarget(null)}
      />
    </div>
  )
}

interface AddColumnModalProps {
  onClose: () => void
  onAdd: (spec: NewColumnSpec) => Promise<void>
}

function AddColumnModal({ onClose, onAdd }: AddColumnModalProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [nullable, setNullable] = useState(true)
  const [defaultValue, setDefaultValue] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim() || !type.trim()) return
    setSaving(true)
    try {
      await onAdd({
        name: name.trim(),
        type: type.trim(),
        nullable,
        default: defaultValue.trim() || null
      })
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title="Add column"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={saving || !name.trim() || !type.trim()}
          >
            {saving && <Spinner size={13} className="text-white" />}
            Add column
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. created_at"
        />
        <Input
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="e.g. varchar(255), integer, timestamp"
        />
        <Input
          label="Default (optional, raw SQL)"
          value={defaultValue}
          onChange={(e) => setDefaultValue(e.target.value)}
          placeholder="e.g. 0, 'pending', CURRENT_TIMESTAMP"
        />
        <Toggle id="add-col-nullable" label="Nullable" checked={nullable} onChange={setNullable} />
      </div>
    </Modal>
  )
}

function Section({
  title,
  action,
  children
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Th({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <th className="px-2 py-1.5 font-medium">{children}</th>
}

function Td({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <td className={`px-2 py-1.5 align-top text-muted ${className ?? ''}`}>{children}</td>
}
