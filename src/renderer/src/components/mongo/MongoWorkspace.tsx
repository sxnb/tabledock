import { useEffect, useRef, useState } from 'react'
import {
  Search,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Boxes
} from 'lucide-react'
import type {
  MongoCollectionStats,
  MongoDocument,
  MongoFindResult,
  MongoIndexInfo
} from '@shared/types'
import type { Session } from '@renderer/store/workspace'
import { useWorkspace } from '@renderer/store/workspace'
import { Select } from '@renderer/components/ui/Select'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Button } from '@renderer/components/ui/Button'
import { Input } from '@renderer/components/ui/Input'
import { Modal } from '@renderer/components/ui/Modal'
import { Toggle } from '@renderer/components/ui/Toggle'
import { Spinner } from '@renderer/components/ui/Spinner'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { toast } from '@renderer/store/toasts'
import { cn } from '@renderer/lib/cn'
import { DocumentEditModal } from './DocumentEditModal'

type MongoView = 'find' | 'aggregate' | 'indexes'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const PAGE_SIZES = [25, 50, 100]

export function MongoWorkspace({ session }: { session: Session }): React.JSX.Element {
  const sessionId = session.sessionId as string
  const database = session.selectedDatabase
  const readOnly = Boolean(session.config.readOnly)
  const setSelectedDatabase = useWorkspace((s) => s.setSelectedDatabase)

  const [databases, setDatabases] = useState<string[]>([])
  const [collections, setCollections] = useState<string[]>([])
  const [collectionFilter, setCollectionFilter] = useState('')
  const [collection, setCollection] = useState<string | null>(null)

  const [filterDraft, setFilterDraft] = useState('{}')
  const [filter, setFilter] = useState('{}')
  const [sortDraft, setSortDraft] = useState('')
  const [sort, setSort] = useState('')
  const [projDraft, setProjDraft] = useState('')
  const [projection, setProjection] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [result, setResult] = useState<MongoFindResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

  const [mode, setMode] = useState<MongoView>('find')
  const [pipelineDraft, setPipelineDraft] = useState('[\n  \n]')
  const [stats, setStats] = useState<MongoCollectionStats | null>(null)
  const [indexes, setIndexes] = useState<MongoIndexInfo[]>([])
  const [createIndexOpen, setCreateIndexOpen] = useState(false)
  const [dropIndexName, setDropIndexName] = useState<string | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [editDoc, setEditDoc] = useState<MongoDocument | null>(null)
  const [deleteDoc, setDeleteDoc] = useState<MongoDocument | null>(null)

  // Load databases once connected, then pick a default.
  useEffect(() => {
    let cancelled = false
    window.api.mongo
      .databases(sessionId)
      .then((dbs) => {
        if (cancelled) return
        setDatabases(dbs)
        if (!database && dbs[0]) setSelectedDatabase(session.id, dbs[0])
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Load collections when the database changes.
  useEffect(() => {
    if (!database) return
    let cancelled = false
    window.api.mongo
      .collections(sessionId, database)
      .then((c) => {
        if (cancelled) return
        setCollections(c)
        setCollection(null)
        setResult(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [sessionId, database])

  const load = async (): Promise<void> => {
    if (!database || !collection) return
    const reqId = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.mongo.find(sessionId, database, collection, {
        filter,
        sort,
        projection,
        page,
        pageSize
      })
      if (reqRef.current === reqId) setResult(res)
    } catch (err) {
      if (reqRef.current === reqId) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (reqRef.current === reqId) setLoading(false)
    }
  }

  useEffect(() => {
    if (mode !== 'find') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- find sets loading/result intentionally
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, database, collection, filter, sort, projection, page, pageSize, mode])

  const runAggregate = async (): Promise<void> => {
    if (!database || !collection) return
    const reqId = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.mongo.aggregate(sessionId, database, collection, pipelineDraft)
      if (reqRef.current === reqId) setResult(res)
    } catch (err) {
      if (reqRef.current === reqId) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (reqRef.current === reqId) setLoading(false)
    }
  }

  // Load stats + indexes whenever the open collection changes.
  useEffect(() => {
    if (!database || !collection) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stats/indexes when no collection
      setStats(null)
      setIndexes([])
      return
    }
    let cancelled = false
    void window.api.mongo
      .stats(sessionId, database, collection)
      .then((s) => !cancelled && setStats(s))
      .catch(() => !cancelled && setStats(null))
    void window.api.mongo
      .indexes(sessionId, database, collection)
      .then((i) => !cancelled && setIndexes(i))
      .catch(() => !cancelled && setIndexes([]))
    return () => {
      cancelled = true
    }
  }, [sessionId, database, collection])

  const reloadIndexes = async (): Promise<void> => {
    if (!database || !collection) return
    setIndexes(await window.api.mongo.indexes(sessionId, database, collection))
  }

  const createIndex = async (keysJson: string, unique: boolean, name: string): Promise<void> => {
    if (!database || !collection) return
    await window.api.mongo.createIndex(sessionId, database, collection, keysJson, {
      unique,
      name: name.trim() || undefined
    })
    toast.success('Index created')
    setCreateIndexOpen(false)
    await reloadIndexes()
  }

  const confirmDropIndex = async (): Promise<void> => {
    if (!database || !collection || !dropIndexName) return
    try {
      await window.api.mongo.dropIndex(sessionId, database, collection, dropIndexName)
      toast.success(`Dropped index ${dropIndexName}`)
      await reloadIndexes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setDropIndexName(null)
    }
  }

  const openCollection = (name: string): void => {
    setCollection(name)
    setMode('find')
    setFilter('{}')
    setFilterDraft('{}')
    setSort('')
    setSortDraft('')
    setProjection('')
    setProjDraft('')
    setPipelineDraft('[\n  \n]')
    setResult(null)
    setPage(1)
  }

  const switchMode = (next: MongoView): void => {
    if (next === mode) return
    setMode(next)
    setResult(null)
    setError(null)
  }

  const applyQuery = (): void => {
    setPage(1)
    setFilter(filterDraft.trim() || '{}')
    setSort(sortDraft.trim())
    setProjection(projDraft.trim())
  }

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const filteredCollections = collections.filter((c) =>
    c.toLowerCase().includes(collectionFilter.toLowerCase())
  )

  return (
    <div className="flex h-full min-h-0">
      {/* Left rail: database picker + collection list */}
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="rounded-b-lg border-b border-border p-2.5">
          <Select
            value={database ?? ''}
            onChange={(e) => setSelectedDatabase(session.id, e.target.value)}
          >
            {databases.length === 0 && <option value="">(no databases)</option>}
            {databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2 px-2.5 py-2">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={collectionFilter}
              onChange={(e) => setCollectionFilter(e.target.value)}
              placeholder="Filter collections…"
              className="h-7 w-full rounded-md border border-border bg-surface-2 pl-7 pr-2 text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {filteredCollections.length === 0 && (
            <p className="px-2 py-3 text-xs text-faint">
              {collections.length === 0 ? 'No collections' : 'No matches'}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {filteredCollections.map((name) => (
              <li key={name}>
                <button
                  onClick={() => openCollection(name)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                    collection === name
                      ? 'bg-accent-soft text-text'
                      : 'text-muted hover:bg-surface-2 hover:text-text'
                  )}
                >
                  <Boxes size={13} className="shrink-0 text-faint" />
                  <span className="truncate font-mono">{name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Right: documents */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!collection ? (
          <EmptyState
            icon={<Boxes size={28} />}
            title="Pick a collection"
            description="Select a collection on the left to browse its documents."
          />
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs text-muted">
              <span className="font-mono text-text">{collection}</span>
              <div className="flex items-center rounded-md border border-border p-0.5">
                {(['find', 'aggregate', 'indexes'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={cn(
                      'rounded px-2 py-0.5 text-[11px] capitalize transition-colors',
                      mode === m ? 'bg-accent-soft text-text' : 'text-muted hover:text-text'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {mode !== 'indexes' && (
                <>
                  <span className="text-faint">·</span>
                  <span>
                    {total.toLocaleString()} {mode === 'aggregate' ? 'results' : 'docs'}
                  </span>
                </>
              )}
              {loading && <Spinner size={13} />}
              {stats && (
                <div className="flex items-center gap-1.5 text-[11px] text-faint">
                  <Chip>{formatBytes(stats.storageSize)}</Chip>
                  {stats.avgObjSize > 0 && <Chip>~{formatBytes(stats.avgObjSize)}/doc</Chip>}
                  <Chip>
                    {stats.indexCount} {stats.indexCount === 1 ? 'index' : 'indexes'}
                  </Chip>
                </div>
              )}
              <div className="flex-1" />
              {mode === 'find' && !readOnly && (
                <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                  <Plus size={13} />
                  Add document
                </Button>
              )}
              {mode === 'indexes' && !readOnly && (
                <Button size="sm" variant="secondary" onClick={() => setCreateIndexOpen(true)}>
                  <Plus size={13} />
                  Create index
                </Button>
              )}
              {mode === 'find' && (
                <>
                  <Select
                    className="h-7 w-auto pr-7 text-xs"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s} / page
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    label="Previous"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={15} />
                  </IconButton>
                  <span className="tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <IconButton
                    label="Next"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={15} />
                  </IconButton>
                </>
              )}
              <IconButton
                label="Refresh"
                onClick={() =>
                  void (mode === 'aggregate'
                    ? runAggregate()
                    : mode === 'indexes'
                      ? reloadIndexes()
                      : load())
                }
              >
                <RefreshCw size={13} />
              </IconButton>
            </div>

            {mode === 'aggregate' && (
              <div className="flex flex-col gap-1.5 border-b border-border bg-surface px-3 py-1.5">
                <textarea
                  value={pipelineDraft}
                  onChange={(e) => setPipelineDraft(e.target.value)}
                  spellCheck={false}
                  placeholder='[ { "$match": { "active": true } }, { "$group": { "_id": "$type", "n": { "$sum": 1 } } } ]'
                  className="h-24 w-full resize-y rounded-md border border-border bg-surface-2 px-2 py-1.5 font-mono text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-faint">
                    Extended-JSON pipeline · up to 500 results
                  </span>
                  <div className="flex-1" />
                  <Button size="sm" variant="primary" onClick={() => void runAggregate()}>
                    <Search size={13} />
                    Run
                  </Button>
                </div>
              </div>
            )}

            {mode === 'find' && (
              <form
                className="flex flex-col gap-1.5 border-b border-border bg-surface px-3 py-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  applyQuery()
                }}
              >
                <input
                  value={filterDraft}
                  onChange={(e) => setFilterDraft(e.target.value)}
                  placeholder='Filter (Extended JSON), e.g. { "age": { "$gt": 18 } }'
                  className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 font-mono text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <input
                    value={sortDraft}
                    onChange={(e) => setSortDraft(e.target.value)}
                    placeholder='Sort, e.g. { "age": -1 }'
                    className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 font-mono text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                  <input
                    value={projDraft}
                    onChange={(e) => setProjDraft(e.target.value)}
                    placeholder='Project, e.g. { "name": 1 }'
                    className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 font-mono text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                  <Button size="sm" variant="primary" type="submit">
                    <Search size={13} />
                    Search
                  </Button>
                </div>
              </form>
            )}

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {error ? (
                <div className="flex items-start gap-2 font-mono text-xs text-danger">{error}</div>
              ) : mode === 'indexes' ? (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-faint">
                      <th className="px-2 py-1.5 font-medium">Name</th>
                      <th className="px-2 py-1.5 font-medium">Keys</th>
                      <th className="px-2 py-1.5 font-medium">Unique</th>
                      {!readOnly && <th className="w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {indexes.map((idx) => (
                      <tr key={idx.name} className="group border-t border-border/60">
                        <td className="px-2 py-1.5 align-top font-mono text-text">{idx.name}</td>
                        <td className="px-2 py-1.5 align-top font-mono text-muted">{idx.keys}</td>
                        <td className="px-2 py-1.5 align-top text-muted">
                          {idx.unique ? 'YES' : 'NO'}
                        </td>
                        {!readOnly && (
                          <td className="px-2 py-1.5 text-right align-top">
                            {idx.name !== '_id_' && (
                              <IconButton
                                label={`Drop index ${idx.name}`}
                                className="opacity-0 group-hover:opacity-100 hover:text-danger"
                                onClick={() => setDropIndexName(idx.name)}
                              >
                                <Trash2 size={13} />
                              </IconButton>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : result && result.documents.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted">
                  No documents
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {result?.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="group relative rounded-md border border-border bg-surface-2"
                    >
                      {mode === 'find' && !readOnly && doc.id && (
                        <div className="absolute right-1.5 top-1.5 flex items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton label="Edit document" onClick={() => setEditDoc(doc)}>
                            <Pencil size={12} />
                          </IconButton>
                          <IconButton
                            label="Delete document"
                            className="hover:text-danger"
                            onClick={() => setDeleteDoc(doc)}
                          >
                            <Trash2 size={12} />
                          </IconButton>
                        </div>
                      )}
                      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-text">
                        {doc.json}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {addOpen && database && collection && (
        <DocumentEditModal
          open
          title={`Add document · ${collection}`}
          submitLabel="Add document"
          initialJson={'{\n  \n}'}
          onClose={() => setAddOpen(false)}
          onSave={async (jsonText) => {
            await window.api.mongo.insert(sessionId, database, collection, jsonText)
            await load()
          }}
        />
      )}

      {editDoc && database && collection && (
        <DocumentEditModal
          key={editDoc.id}
          open
          title={`Edit document · ${collection}`}
          submitLabel="Save"
          initialJson={editDoc.json}
          onClose={() => setEditDoc(null)}
          onSave={async (jsonText) => {
            await window.api.mongo.update(sessionId, database, collection, editDoc.id, jsonText)
            await load()
          }}
        />
      )}

      <ConfirmDialog
        open={deleteDoc !== null}
        title="Delete document?"
        description="This permanently deletes the document and cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (database && collection && deleteDoc) {
            void window.api.mongo
              .remove(sessionId, database, collection, deleteDoc.id)
              .then(() => load())
              .catch((err) => setError(err instanceof Error ? err.message : String(err)))
          }
          setDeleteDoc(null)
        }}
        onCancel={() => setDeleteDoc(null)}
      />

      {createIndexOpen && (
        <CreateIndexModal onClose={() => setCreateIndexOpen(false)} onCreate={createIndex} />
      )}

      <ConfirmDialog
        open={dropIndexName !== null}
        title="Drop index?"
        description={`This permanently drops the index "${dropIndexName}".`}
        confirmLabel="Drop index"
        variant="danger"
        onConfirm={() => void confirmDropIndex()}
        onCancel={() => setDropIndexName(null)}
      />
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <span className="rounded bg-surface-2 px-1.5 py-0.5">{children}</span>
}

function CreateIndexModal({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (keysJson: string, unique: boolean, name: string) => Promise<void>
}): React.JSX.Element {
  const [keys, setKeys] = useState('{ "field": 1 }')
  const [unique, setUnique] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    if (!keys.trim()) return
    setSaving(true)
    try {
      await onCreate(keys, unique, name)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title="Create index"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!keys.trim() || saving}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Input
          label="Keys (Extended JSON)"
          autoFocus
          value={keys}
          onChange={(e) => setKeys(e.target.value)}
          placeholder='{ "field": 1, "other": -1 }'
        />
        <Input
          label="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="auto-generated if blank"
        />
        <Toggle id="create-index-unique" label="Unique" checked={unique} onChange={setUnique} />
      </div>
    </Modal>
  )
}
