import { useState } from 'react'
import { RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react'
import type { RedisValue } from '@shared/types'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Button } from '@renderer/components/ui/Button'
import { Modal } from '@renderer/components/ui/Modal'
import { Input } from '@renderer/components/ui/Input'
import { CellDetailModal } from '@renderer/components/ui/CellDetailModal'
import { toast } from '@renderer/store/toasts'

interface RedisValuePanelProps {
  sessionId: string
  keyName: string
  value: RedisValue
  readOnly: boolean
  onRefresh: () => void
}

interface EntryField {
  name: string
  label: string
  value: string
  type?: 'text' | 'number'
}
interface EntryForm {
  title: string
  fields: EntryField[]
  submit: (values: Record<string, string>) => string[]
}

function formatTtl(seconds: number): string {
  if (seconds < 0) return 'no expiry'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  return `${Math.floor(seconds / 86400)}d`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Editable viewer for a single Redis key's value, by type. */
export function RedisValuePanel({
  sessionId,
  keyName,
  value,
  readOnly,
  onRefresh
}: RedisValuePanelProps): React.JSX.Element {
  const [entry, setEntry] = useState<EntryForm | null>(null)
  const [editStringOpen, setEditStringOpen] = useState(false)

  const write = async (args: string[]): Promise<void> => {
    try {
      await window.api.redis.write(sessionId, args)
      onRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const lengthLabel =
    value.length != null
      ? value.type === 'string'
        ? `${value.length} chars`
        : `${value.length} items`
      : null

  const addLabel: Record<string, string> = {
    hash: 'Add field',
    list: 'Append',
    set: 'Add member',
    zset: 'Add member'
  }

  const openAdd = (): void => {
    if (value.type === 'hash') {
      setEntry({
        title: 'Add field',
        fields: [
          { name: 'field', label: 'Field', value: '' },
          { name: 'value', label: 'Value', value: '' }
        ],
        submit: (v) => ['HSET', keyName, v.field, v.value]
      })
    } else if (value.type === 'list') {
      setEntry({
        title: 'Append element',
        fields: [{ name: 'value', label: 'Value', value: '' }],
        submit: (v) => ['RPUSH', keyName, v.value]
      })
    } else if (value.type === 'set') {
      setEntry({
        title: 'Add member',
        fields: [{ name: 'member', label: 'Member', value: '' }],
        submit: (v) => ['SADD', keyName, v.member]
      })
    } else if (value.type === 'zset') {
      setEntry({
        title: 'Add member',
        fields: [
          { name: 'member', label: 'Member', value: '' },
          { name: 'score', label: 'Score', value: '0', type: 'number' }
        ],
        submit: (v) => ['ZADD', keyName, v.score, v.member]
      })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
        <span className="truncate font-mono text-text">{keyName}</span>
        <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 uppercase text-faint">
          {value.type}
        </span>
        <div className="flex-1" />
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-faint">
          {lengthLabel && <Meta>{lengthLabel}</Meta>}
          {value.ttl != null && <Meta>TTL {formatTtl(value.ttl)}</Meta>}
          {value.memoryBytes != null && <Meta>{formatBytes(value.memoryBytes)}</Meta>}
          {value.encoding && <Meta>{value.encoding}</Meta>}
        </div>
        {!readOnly && value.type === 'string' && (
          <Button size="sm" variant="secondary" onClick={() => setEditStringOpen(true)}>
            <Pencil size={13} />
            Edit
          </Button>
        )}
        {!readOnly && addLabel[value.type] && (
          <Button size="sm" variant="secondary" onClick={openAdd}>
            <Plus size={13} />
            {addLabel[value.type]}
          </Button>
        )}
        <IconButton label="Refresh value" onClick={onRefresh} className="shrink-0">
          <RefreshCw size={13} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs">
        <Body
          value={value}
          keyName={keyName}
          readOnly={readOnly}
          write={write}
          setEntry={setEntry}
        />
      </div>

      {editStringOpen && (
        <CellDetailModal
          open
          column={keyName}
          value={value.value}
          editable
          onClose={() => setEditStringOpen(false)}
          onSave={async (text) => {
            await window.api.redis.write(sessionId, ['SET', keyName, text])
            onRefresh()
          }}
        />
      )}

      {entry && <EntryModal form={entry} onClose={() => setEntry(null)} onWrite={write} />}
    </div>
  )
}

interface BodyProps {
  value: RedisValue
  keyName: string
  readOnly: boolean
  write: (args: string[]) => Promise<void>
  setEntry: (form: EntryForm) => void
}

function Body({ value, keyName, readOnly, write, setEntry }: BodyProps): React.JSX.Element {
  switch (value.type) {
    case 'string':
      return <pre className="whitespace-pre-wrap break-all text-text">{String(value.value)}</pre>
    case 'list':
      return (
        <ol className="flex flex-col gap-1">
          {(value.value as string[]).map((v, i) => (
            <Row
              key={i}
              label={String(i)}
              text={v}
              actions={
                !readOnly && (
                  <RowAction
                    icon={<Pencil size={12} />}
                    label="Edit element"
                    onClick={() =>
                      setEntry({
                        title: `Edit element ${i}`,
                        fields: [{ name: 'value', label: 'Value', value: v }],
                        submit: (val) => ['LSET', keyName, String(i), val.value]
                      })
                    }
                  />
                )
              }
            />
          ))}
        </ol>
      )
    case 'set':
      return (
        <ol className="flex flex-col gap-1">
          {(value.value as string[]).map((v, i) => (
            <Row
              key={i}
              text={v}
              actions={
                !readOnly && (
                  <RowAction
                    icon={<Trash2 size={12} />}
                    label="Remove member"
                    danger
                    onClick={() => void write(['SREM', keyName, v])}
                  />
                )
              }
            />
          ))}
        </ol>
      )
    case 'zset':
      return (
        <table className="w-full">
          <tbody>
            {(value.value as { member: string; score: string }[]).map((p, i) => (
              <tr key={i} className="group">
                <td className="w-16 py-0.5 pr-4 align-top text-faint">{p.score}</td>
                <td className="break-all text-text">{p.member}</td>
                {!readOnly && (
                  <td className="w-16 text-right align-top">
                    <span className="inline-flex opacity-0 group-hover:opacity-100">
                      <RowAction
                        icon={<Pencil size={12} />}
                        label="Edit score"
                        onClick={() =>
                          setEntry({
                            title: `Edit score · ${p.member}`,
                            fields: [
                              { name: 'score', label: 'Score', value: p.score, type: 'number' }
                            ],
                            submit: (v) => ['ZADD', keyName, v.score, p.member]
                          })
                        }
                      />
                      <RowAction
                        icon={<Trash2 size={12} />}
                        label="Remove member"
                        danger
                        onClick={() => void write(['ZREM', keyName, p.member])}
                      />
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'hash':
      return (
        <table className="w-full">
          <tbody>
            {Object.entries(value.value as Record<string, string>).map(([k, v]) => (
              <tr key={k} className="group">
                <td className="py-0.5 pr-4 align-top text-accent">{k}</td>
                <td className="break-all text-text">{v}</td>
                {!readOnly && (
                  <td className="w-16 text-right align-top">
                    <span className="inline-flex opacity-0 group-hover:opacity-100">
                      <RowAction
                        icon={<Pencil size={12} />}
                        label="Edit field"
                        onClick={() =>
                          setEntry({
                            title: `Edit field · ${k}`,
                            fields: [{ name: 'value', label: 'Value', value: v }],
                            submit: (val) => ['HSET', keyName, k, val.value]
                          })
                        }
                      />
                      <RowAction
                        icon={<Trash2 size={12} />}
                        label="Delete field"
                        danger
                        onClick={() => void write(['HDEL', keyName, k])}
                      />
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )
    default:
      return <pre className="text-muted">{String(value.value)}</pre>
  }
}

function Row({
  label,
  text,
  actions
}: {
  label?: string
  text: string
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <li className="group flex items-start gap-3">
      {label != null && <span className="w-10 shrink-0 text-right text-faint">{label}</span>}
      <span className="min-w-0 flex-1 break-all text-text">{text}</span>
      {actions && <span className="shrink-0 opacity-0 group-hover:opacity-100">{actions}</span>}
    </li>
  )
}

function RowAction({
  icon,
  label,
  onClick,
  danger
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}): React.JSX.Element {
  return (
    <IconButton label={label} onClick={onClick} className={danger ? 'hover:text-danger' : ''}>
      {icon}
    </IconButton>
  )
}

function Meta({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded bg-surface-2 px-1.5 py-0.5">{children}</span>
}

function EntryModal({
  form,
  onClose,
  onWrite
}: {
  form: EntryForm
  onClose: () => void
  onWrite: (args: string[]) => Promise<void>
}): React.JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(form.fields.map((f) => [f.name, f.value]))
  )
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    setSaving(true)
    try {
      await onWrite(form.submit(values))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={form.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {form.fields.map((f, i) => (
          <Input
            key={f.name}
            label={f.label}
            type={f.type ?? 'text'}
            autoFocus={i === 0}
            value={values[f.name]}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
          />
        ))}
      </div>
    </Modal>
  )
}
