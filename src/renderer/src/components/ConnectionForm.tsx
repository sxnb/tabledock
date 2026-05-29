import { useState } from 'react'
import { FolderOpen, CheckCircle2, XCircle } from 'lucide-react'
import type { ConnectionConfig, DriverKind } from '@shared/types'
import { KIND_META, KIND_ORDER } from '@renderer/lib/kinds'
import { useConnections } from '@renderer/store/connections'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Spinner } from './ui/Spinner'

interface ConnectionFormProps {
  open: boolean
  editing?: ConnectionConfig | null
  onClose: () => void
}

type Draft = ConnectionConfig

function blankDraft(): Draft {
  return {
    id: crypto.randomUUID(),
    name: '',
    kind: 'mysql',
    host: '127.0.0.1',
    port: KIND_META.mysql.defaultPort,
    user: 'root',
    password: '',
    database: '',
    filePath: '',
    redisDb: 0
  }
}

type TestState = { status: 'idle' | 'testing' | 'ok' | 'error'; message?: string }

export function ConnectionForm({ open, editing, onClose }: ConnectionFormProps): React.JSX.Element {
  const save = useConnections((s) => s.save)
  const [draft, setDraft] = useState<Draft>(() => editing ?? blankDraft())
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const [saving, setSaving] = useState(false)

  // Re-seed the form whenever the modal is (re)opened for a different target.
  const seedKey = editing?.id ?? 'new'
  const [lastSeed, setLastSeed] = useState(seedKey)
  if (open && lastSeed !== seedKey) {
    setLastSeed(seedKey)
    setDraft(editing ?? blankDraft())
    setTest({ status: 'idle' })
  }

  const meta = KIND_META[draft.kind]
  const set = (patch: Partial<Draft>): void => setDraft((d) => ({ ...d, ...patch }))

  const onKindChange = (kind: DriverKind): void => {
    set({ kind, port: KIND_META[kind].defaultPort })
    setTest({ status: 'idle' })
  }

  const pickFile = async (): Promise<void> => {
    const path = await window.api.dialog.openFile()
    if (path) set({ filePath: path })
  }

  const runTest = async (): Promise<void> => {
    setTest({ status: 'testing' })
    try {
      await window.api.db.test(draft)
      setTest({ status: 'ok', message: 'Connection successful' })
    } catch (err) {
      setTest({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const onSave = async (): Promise<void> => {
    setSaving(true)
    try {
      await save({ ...draft, name: draft.name.trim() || meta.label })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const valid =
    draft.kind === 'sqlite' ? Boolean(draft.filePath) : Boolean(draft.host && draft.port)

  return (
    <Modal
      open={open}
      title={editing ? 'Edit connection' : 'New connection'}
      onClose={onClose}
      footer={
        <>
          <TestResult test={test} />
          <div className="flex-1" />
          <Button
            variant="secondary"
            onClick={runTest}
            disabled={!valid || test.status === 'testing'}
          >
            {test.status === 'testing' ? <Spinner size={14} /> : null}
            Test
          </Button>
          <Button variant="primary" onClick={onSave} disabled={!valid || saving}>
            {saving ? <Spinner size={14} className="text-white" /> : null}
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Input
          id="conn-name"
          label="Display name"
          placeholder={meta.label}
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />

        <Select
          id="conn-kind"
          label="Type"
          value={draft.kind}
          onChange={(e) => onKindChange(e.target.value as DriverKind)}
        >
          {KIND_ORDER.map((k) => (
            <option key={k} value={k}>
              {KIND_META[k].label}
            </option>
          ))}
        </Select>

        {draft.kind === 'sqlite' ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Database file</span>
            <div className="flex gap-2">
              <Input
                placeholder="/path/to/database.sqlite"
                value={draft.filePath ?? ''}
                onChange={(e) => set({ filePath: e.target.value })}
              />
              <Button variant="secondary" onClick={pickFile} className="shrink-0">
                <FolderOpen size={14} />
                Browse
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Input
                label="Host"
                placeholder="127.0.0.1"
                value={draft.host ?? ''}
                onChange={(e) => set({ host: e.target.value })}
              />
              <Input
                label="Port"
                type="number"
                value={draft.port ?? ''}
                onChange={(e) => set({ port: Number(e.target.value) })}
              />
            </div>

            {draft.kind === 'redis' ? (
              <div className="grid grid-cols-[1fr_120px] gap-3">
                <Input
                  label="Password"
                  type="password"
                  placeholder="(optional)"
                  value={draft.password ?? ''}
                  onChange={(e) => set({ password: e.target.value })}
                />
                <Input
                  label="DB index"
                  type="number"
                  value={draft.redisDb ?? 0}
                  onChange={(e) => set({ redisDb: Number(e.target.value) })}
                />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="User"
                    value={draft.user ?? ''}
                    onChange={(e) => set({ user: e.target.value })}
                  />
                  <Input
                    label="Password"
                    type="password"
                    placeholder="(optional)"
                    value={draft.password ?? ''}
                    onChange={(e) => set({ password: e.target.value })}
                  />
                </div>
                <Input
                  label="Default database (optional)"
                  value={draft.database ?? ''}
                  onChange={(e) => set({ database: e.target.value })}
                />
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function TestResult({ test }: { test: TestState }): React.JSX.Element | null {
  if (test.status === 'ok') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-ok">
        <CheckCircle2 size={14} /> {test.message}
      </span>
    )
  }
  if (test.status === 'error') {
    return (
      <span className="flex items-center gap-1.5 truncate text-xs text-danger" title={test.message}>
        <XCircle size={14} /> <span className="max-w-[180px] truncate">{test.message}</span>
      </span>
    )
  }
  return null
}
