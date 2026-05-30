import { useState } from 'react'
import { FolderOpen, CheckCircle2, XCircle } from 'lucide-react'
import type {
  ConnectionConfig,
  DriverKind,
  SshAuthMethod,
  SshConfig,
  SslConfig
} from '@shared/types'
import { KIND_META, KIND_ORDER } from '@renderer/lib/kinds'
import { useConnections } from '@renderer/store/connections'
import { Modal } from './ui/Modal'
import { Button } from './ui/Button'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Spinner } from './ui/Spinner'
import { Toggle } from './ui/Toggle'
import { ColorPicker } from './ui/ColorPicker'

// Darker, flat (muted) tones used to tag connections.
const COLOR_PRESETS = [
  '#574f8a', // indigo
  '#3e5c82', // slate blue
  '#2f6d68', // teal
  '#3f7050', // green
  '#8a6f3a', // ochre
  '#9a5a3c', // terracotta
  '#93454e', // maroon
  '#834f6c' // plum
]

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
    redisDb: 0,
    ssl: { enabled: false },
    ssh: { enabled: false, authMethod: 'password' }
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

  const setSsl = (patch: Partial<SslConfig>): void =>
    setDraft((d) => ({ ...d, ssl: { ...(d.ssl ?? { enabled: false }), ...patch } }))

  const setSsh = (patch: Partial<SshConfig>): void =>
    setDraft((d) => ({ ...d, ssh: { ...(d.ssh ?? { enabled: false }), ...patch } }))

  const pickSshKey = async (): Promise<void> => {
    const path = await window.api.dialog.openFile({
      title: 'Select SSH private key',
      filters: [
        { name: 'Private Keys', extensions: ['pem', 'key', 'ppk'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (path) setSsh({ privateKey: path })
  }

  const pickDbFile = async (): Promise<void> => {
    const path = await window.api.dialog.openFile({
      title: 'Select or create a SQLite database file',
      allowCreate: true,
      filters: [
        { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (path) set({ filePath: path })
  }

  const pickCert = async (field: 'ca' | 'cert' | 'key'): Promise<void> => {
    const path = await window.api.dialog.openFile({
      title: 'Select certificate file',
      filters: [
        { name: 'Certificates & Keys', extensions: ['pem', 'crt', 'cert', 'cer', 'key'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (path) setSsl({ [field]: path })
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
    draft.kind === 'sqlite'
      ? Boolean(draft.filePath)
      : Boolean(draft.host && draft.port) && (!draft.ssh?.enabled || Boolean(draft.ssh.host))

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

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Color</span>
          <ColorPicker
            value={draft.color ?? null}
            presets={COLOR_PRESETS}
            allowCustom
            onChange={(color) => set({ color: color ?? undefined })}
          />
        </div>

        {draft.kind === 'sqlite' ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Database file</span>
            <div className="flex gap-2">
              <Input
                placeholder="/path/to/database.sqlite"
                value={draft.filePath ?? ''}
                onChange={(e) => set({ filePath: e.target.value })}
              />
              <Button variant="secondary" onClick={pickDbFile} className="shrink-0">
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

            <SslSection
              ssl={draft.ssl}
              onToggle={(enabled) => setSsl({ enabled })}
              onPick={pickCert}
              onChange={setSsl}
            />

            <SshSection
              ssh={draft.ssh}
              onToggle={(enabled) => setSsh({ enabled })}
              onPickKey={pickSshKey}
              onChange={setSsh}
            />
          </>
        )}
      </div>
    </Modal>
  )
}

function SslSection({
  ssl,
  onToggle,
  onPick,
  onChange
}: {
  ssl?: SslConfig
  onToggle: (enabled: boolean) => void
  onPick: (field: 'ca' | 'cert' | 'key') => void
  onChange: (patch: Partial<SslConfig>) => void
}): React.JSX.Element {
  const enabled = Boolean(ssl?.enabled)
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
      <Toggle id="conn-ssl" label="Enable SSL" checked={enabled} onChange={onToggle} />
      {enabled && (
        <div className="flex flex-col gap-2.5">
          <CertField
            label="CA Certificate"
            value={ssl?.ca}
            onBrowse={() => onPick('ca')}
            onChange={(v) => onChange({ ca: v })}
          />
          <CertField
            label="Client Certificate"
            value={ssl?.cert}
            onBrowse={() => onPick('cert')}
            onChange={(v) => onChange({ cert: v })}
          />
          <CertField
            label="Client Key"
            value={ssl?.key}
            onBrowse={() => onPick('key')}
            onChange={(v) => onChange({ key: v })}
          />
        </div>
      )}
    </div>
  )
}

function SshSection({
  ssh,
  onToggle,
  onPickKey,
  onChange
}: {
  ssh?: SshConfig
  onToggle: (enabled: boolean) => void
  onPickKey: () => void
  onChange: (patch: Partial<SshConfig>) => void
}): React.JSX.Element {
  const enabled = Boolean(ssh?.enabled)
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/40 p-3">
      <Toggle id="conn-ssh" label="Enable SSH Tunnel" checked={enabled} onChange={onToggle} />
      {enabled && (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <Input
              label="SSH Host"
              placeholder="bastion.example.com"
              value={ssh?.host ?? ''}
              onChange={(e) => onChange({ host: e.target.value })}
            />
            <Input
              label="SSH Port"
              type="number"
              value={ssh?.port ?? 22}
              onChange={(e) => onChange({ port: Number(e.target.value) })}
            />
          </div>
          <Input
            label="SSH User"
            value={ssh?.user ?? ''}
            onChange={(e) => onChange({ user: e.target.value })}
          />
          <Select
            label="Authentication"
            value={ssh?.authMethod ?? 'password'}
            onChange={(e) => onChange({ authMethod: e.target.value as SshAuthMethod })}
          >
            <option value="password">Username &amp; Password</option>
            <option value="key">Key File</option>
            <option value="agent">SSH Agent</option>
          </Select>

          {(ssh?.authMethod ?? 'password') === 'password' && (
            <Input
              label="SSH Password"
              type="password"
              value={ssh?.password ?? ''}
              onChange={(e) => onChange({ password: e.target.value })}
            />
          )}

          {ssh?.authMethod === 'key' && (
            <>
              <CertField
                label="Private Key File"
                value={ssh?.privateKey}
                onBrowse={onPickKey}
                onChange={(v) => onChange({ privateKey: v })}
              />
              <Input
                label="Key Passphrase"
                type="password"
                placeholder="(optional)"
                value={ssh?.passphrase ?? ''}
                onChange={(e) => onChange({ passphrase: e.target.value })}
              />
            </>
          )}

          {ssh?.authMethod === 'agent' && (
            <p className="text-xs leading-relaxed text-faint">
              Authenticates using your system SSH agent (the <code>SSH_AUTH_SOCK</code> environment
              variable, or Pageant on Windows).
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function CertField({
  label,
  value,
  onBrowse,
  onChange
}: {
  label: string
  value?: string
  onBrowse: () => void
  onChange: (value: string | undefined) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div className="flex gap-2">
        <Input
          placeholder="(optional)"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        <Button variant="secondary" onClick={onBrowse} className="shrink-0">
          <FolderOpen size={14} />
          Browse
        </Button>
      </div>
    </div>
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
