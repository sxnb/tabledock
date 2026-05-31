import { useEffect, useState } from 'react'
import {
  Search,
  RefreshCw,
  KeyRound,
  Terminal,
  Database,
  Pencil,
  Trash2,
  Clock,
  Plus
} from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { RedisKeyInfo, RedisValue } from '@shared/types'
import type { Session } from '@renderer/store/workspace'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Spinner } from '@renderer/components/ui/Spinner'
import { Select } from '@renderer/components/ui/Select'
import { Input } from '@renderer/components/ui/Input'
import { Modal } from '@renderer/components/ui/Modal'
import { Button } from '@renderer/components/ui/Button'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { toast } from '@renderer/store/toasts'
import { cn } from '@renderer/lib/cn'
import { RedisCommandTab } from './RedisCommandTab'
import { RedisValuePanel } from './RedisValuePanel'

const TYPE_COLORS: Record<string, string> = {
  string: '#5b8cff',
  list: '#8b7bff',
  set: '#4ade80',
  zset: '#fbbf24',
  hash: '#ff6b81'
}

export function RedisWorkspace({ session }: { session: Session }): React.JSX.Element {
  const sessionId = session.sessionId as string
  const [view, setView] = useState<'browser' | 'command'>('browser')
  const [dbIndex, setDbIndex] = useState(session.config.redisDb ?? 0)
  const [pattern, setPattern] = useState('*')
  const [cursor, setCursor] = useState('0')
  const [keys, setKeys] = useState<RedisKeyInfo[]>([])
  const [loadingKeys, setLoadingKeys] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [value, setValue] = useState<RedisValue | null>(null)
  const [loadingValue, setLoadingValue] = useState(false)
  const [dbSize, setDbSize] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Key write-action targets.
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [ttlTarget, setTtlTarget] = useState<string | null>(null)
  const [ttlValue, setTtlValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [addKeyOpen, setAddKeyOpen] = useState(false)

  const readOnly = Boolean(session.config.readOnly)

  const createKey = async (name: string, args: string[]): Promise<void> => {
    await window.api.redis.write(sessionId, args)
    toast.success(`Created ${name}`)
    setAddKeyOpen(false)
    await scan(true)
    void loadDbSize()
    void selectKey(name)
  }

  const loadDbSize = async (): Promise<void> => {
    try {
      setDbSize(await window.api.redis.dbSize(sessionId))
    } catch {
      setDbSize(null)
    }
  }

  const scan = async (reset: boolean): Promise<void> => {
    setLoadingKeys(true)
    setError(null)
    try {
      const res = await window.api.redis.keys(sessionId, {
        pattern: pattern || '*',
        cursor: reset ? '0' : cursor,
        count: 200
      })
      setCursor(res.cursor)
      setKeys((prev) => (reset ? res.keys : [...prev, ...res.keys]))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingKeys(false)
    }
  }

  // Initial scan once connected. `scan` is intentionally excluded from deps so
  // it only runs on (re)connect, not on every keystroke in the pattern field.
  useEffect(() => {
    void scan(true)
    void loadDbSize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const selectKey = async (key: string): Promise<void> => {
    setSelectedKey(key)
    setView('browser')
    setLoadingValue(true)
    try {
      setValue(await window.api.redis.get(sessionId, key))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingValue(false)
    }
  }

  const changeDb = async (index: number): Promise<void> => {
    setDbIndex(index)
    await window.api.redis.select(sessionId, index)
    setSelectedKey(null)
    setValue(null)
    void scan(true)
    void loadDbSize()
  }

  const confirmDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    try {
      await window.api.redis.delete(sessionId, deleteTarget)
      toast.success(`Deleted ${deleteTarget}`)
      setKeys((prev) => prev.filter((k) => k.key !== deleteTarget))
      if (selectedKey === deleteTarget) {
        setSelectedKey(null)
        setValue(null)
      }
      void loadDbSize()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteTarget(null)
    }
  }

  const confirmRename = async (): Promise<void> => {
    const next = renameValue.trim()
    if (!next || !renameTarget || next === renameTarget) {
      setRenameTarget(null)
      return
    }
    try {
      await window.api.redis.rename(sessionId, renameTarget, next)
      toast.success(`Renamed ${renameTarget} → ${next}`)
      setKeys((prev) => prev.map((k) => (k.key === renameTarget ? { ...k, key: next } : k)))
      if (selectedKey === renameTarget) void selectKey(next)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setRenameTarget(null)
    }
  }

  const applyTtl = async (seconds: number | null): Promise<void> => {
    if (!ttlTarget) return
    try {
      await window.api.redis.setTtl(sessionId, ttlTarget, seconds)
      toast.success(seconds == null ? `Cleared TTL on ${ttlTarget}` : `Set TTL on ${ttlTarget}`)
      if (selectedKey === ttlTarget) void selectKey(ttlTarget)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTtlTarget(null)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Left: db selector + key browser */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 border-b border-border p-2.5">
          <Database size={13} className="shrink-0 text-faint" />
          <Select
            className="h-7 text-xs"
            value={dbIndex}
            onChange={(e) => void changeDb(Number(e.target.value))}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <option key={i} value={i}>
                db{i}
              </option>
            ))}
          </Select>
          {dbSize !== null && (
            <span className="shrink-0 text-[11px] tabular-nums text-faint">
              {dbSize.toLocaleString()} keys
            </span>
          )}
        </div>

        <form
          className="flex items-center gap-2 px-2.5 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            void scan(true)
          }}
        >
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder="Match pattern (e.g. user:*)"
              className="h-7 w-full rounded-md border border-border bg-surface-2 pl-7 pr-2 text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
          <IconButton label="Scan keys" type="submit">
            {loadingKeys ? <Spinner size={12} /> : <RefreshCw size={12} />}
          </IconButton>
          {!readOnly && (
            <IconButton label="Create key" type="button" onClick={() => setAddKeyOpen(true)}>
              <Plus size={13} />
            </IconButton>
          )}
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          <ul className="flex flex-col gap-0.5">
            {keys.map((k) => {
              const keyButton = (
                <button
                  onClick={() => void selectKey(k.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    selectedKey === k.key
                      ? 'bg-accent-soft text-text'
                      : 'text-muted hover:bg-surface-2 hover:text-text'
                  )}
                >
                  <span
                    className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
                    style={{
                      color: TYPE_COLORS[k.type] ?? '#8b90a8',
                      background: `${TYPE_COLORS[k.type] ?? '#8b90a8'}1a`
                    }}
                  >
                    {k.type}
                  </span>
                  <span className="truncate font-mono">{k.key}</span>
                </button>
              )
              return (
                <li key={k.key}>
                  {readOnly ? (
                    keyButton
                  ) : (
                    <ContextMenu.Root>
                      <ContextMenu.Trigger asChild>{keyButton}</ContextMenu.Trigger>
                      <ContextMenu.Portal>
                        <ContextMenu.Content className="z-50 min-w-44 overflow-hidden rounded-md border border-border bg-surface-2 p-1 text-xs text-text shadow-xl">
                          <KeyMenuItem
                            icon={<Pencil size={13} />}
                            onSelect={() => {
                              setRenameValue(k.key)
                              setRenameTarget(k.key)
                            }}
                          >
                            Rename…
                          </KeyMenuItem>
                          <KeyMenuItem
                            icon={<Clock size={13} />}
                            onSelect={() => {
                              setTtlValue('')
                              setTtlTarget(k.key)
                            }}
                          >
                            Set TTL…
                          </KeyMenuItem>
                          <ContextMenu.Separator className="my-1 h-px bg-border" />
                          <KeyMenuItem
                            icon={<Trash2 size={13} />}
                            danger
                            onSelect={() => setDeleteTarget(k.key)}
                          >
                            Delete
                          </KeyMenuItem>
                        </ContextMenu.Content>
                      </ContextMenu.Portal>
                    </ContextMenu.Root>
                  )}
                </li>
              )
            })}
          </ul>
          {keys.length === 0 && !loadingKeys && (
            <p className="px-2 py-3 text-xs text-faint">No keys found</p>
          )}
          {cursor !== '0' && (
            <button
              onClick={() => void scan(false)}
              className="mt-1 w-full rounded-md py-1.5 text-xs text-accent hover:bg-surface-2"
            >
              Load more…
            </button>
          )}
        </div>
      </div>

      {/* Right: view toggle + content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
          <ViewToggle
            active={view === 'browser'}
            onClick={() => setView('browser')}
            icon={<KeyRound size={13} />}
          >
            Browser
          </ViewToggle>
          <ViewToggle
            active={view === 'command'}
            onClick={() => setView('command')}
            icon={<Terminal size={13} />}
          >
            Command
          </ViewToggle>
        </div>

        <div className="min-h-0 flex-1">
          {view === 'command' ? (
            <RedisCommandTab sessionId={sessionId} />
          ) : loadingValue ? (
            <div className="flex h-full items-center justify-center">
              <Spinner size={20} />
            </div>
          ) : selectedKey && value ? (
            <RedisValuePanel
              sessionId={sessionId}
              keyName={selectedKey}
              value={value}
              readOnly={readOnly}
              onRefresh={() => void selectKey(selectedKey)}
            />
          ) : (
            <EmptyState
              icon={<KeyRound size={28} />}
              title={error ? 'Error' : 'Select a key'}
              description={error ?? 'Choose a key from the list to inspect its value.'}
            />
          )}
        </div>
      </div>

      <Modal
        open={renameTarget !== null}
        title={`Rename ${renameTarget ?? ''}`}
        onClose={() => setRenameTarget(null)}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void confirmRename()}
              disabled={!renameValue.trim() || renameValue.trim() === renameTarget}
            >
              Rename
            </Button>
          </>
        }
      >
        <Input
          label="New key name"
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void confirmRename()
          }}
        />
      </Modal>

      <Modal
        open={ttlTarget !== null}
        title={`Set TTL · ${ttlTarget ?? ''}`}
        onClose={() => setTtlTarget(null)}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => void applyTtl(null)}>
              Clear TTL (persist)
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => setTtlTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void applyTtl(Number(ttlValue))}
              disabled={!ttlValue || Number(ttlValue) <= 0}
            >
              Set
            </Button>
          </>
        }
      >
        <Input
          label="Expire in (seconds)"
          type="number"
          autoFocus
          value={ttlValue}
          onChange={(e) => setTtlValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && Number(ttlValue) > 0) void applyTtl(Number(ttlValue))
          }}
          placeholder="e.g. 3600"
        />
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete key?"
        description={`This permanently deletes "${deleteTarget}".`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      {addKeyOpen && <AddKeyModal onClose={() => setAddKeyOpen(false)} onCreate={createKey} />}
    </div>
  )
}

type RedisType = 'string' | 'list' | 'set' | 'hash' | 'zset'

function AddKeyModal({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (name: string, args: string[]) => Promise<void>
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState<RedisType>('string')
  const [field, setField] = useState('')
  const [score, setScore] = useState('0')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  const valid =
    name.trim() !== '' &&
    (type !== 'hash' || field.trim() !== '') &&
    (type !== 'zset' || score.trim() !== '')

  const build = (): string[] => {
    const k = name.trim()
    switch (type) {
      case 'string':
        return ['SET', k, value]
      case 'list':
        return ['RPUSH', k, value]
      case 'set':
        return ['SADD', k, value]
      case 'hash':
        return ['HSET', k, field, value]
      case 'zset':
        return ['ZADD', k, score, value]
    }
  }

  const submit = async (): Promise<void> => {
    if (!valid) return
    setSaving(true)
    try {
      await onCreate(name.trim(), build())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title="Create key"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!valid || saving}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input label="Key name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Type</span>
          <Select value={type} onChange={(e) => setType(e.target.value as RedisType)}>
            <option value="string">string</option>
            <option value="list">list</option>
            <option value="set">set</option>
            <option value="hash">hash</option>
            <option value="zset">zset</option>
          </Select>
        </label>
        {type === 'hash' && (
          <Input label="Field" value={field} onChange={(e) => setField(e.target.value)} />
        )}
        {type === 'zset' && (
          <Input
            label="Score"
            type="number"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        )}
        <Input
          label={
            type === 'string' ? 'Value' : type === 'zset' || type === 'set' ? 'Member' : 'Value'
          }
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
    </Modal>
  )
}

function KeyMenuItem({
  children,
  icon,
  onSelect,
  danger
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onSelect: () => void
  danger?: boolean
}): React.JSX.Element {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none',
        danger
          ? 'text-danger data-[highlighted]:bg-danger/15'
          : 'data-[highlighted]:bg-accent-soft data-[highlighted]:text-text'
      )}
    >
      <span className={danger ? '' : 'text-faint'}>{icon}</span>
      {children}
    </ContextMenu.Item>
  )
}

function ViewToggle({
  active,
  onClick,
  icon,
  children
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-surface-2 text-text' : 'text-muted hover:text-text'
      )}
    >
      {icon}
      {children}
    </button>
  )
}
