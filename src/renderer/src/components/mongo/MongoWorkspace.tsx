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
import type { MongoDocument, MongoFindResult } from '@shared/types'
import type { Session } from '@renderer/store/workspace'
import { useWorkspace } from '@renderer/store/workspace'
import { Select } from '@renderer/components/ui/Select'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Button } from '@renderer/components/ui/Button'
import { Spinner } from '@renderer/components/ui/Spinner'
import { EmptyState } from '@renderer/components/ui/EmptyState'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { cn } from '@renderer/lib/cn'
import { DocumentEditModal } from './DocumentEditModal'

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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [result, setResult] = useState<MongoFindResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reqRef = useRef(0)

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- find sets loading/result intentionally
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, database, collection, filter, page, pageSize])

  const openCollection = (name: string): void => {
    setCollection(name)
    setFilter('{}')
    setFilterDraft('{}')
    setPage(1)
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
              <span className="text-faint">·</span>
              <span>{total.toLocaleString()} docs</span>
              {loading && <Spinner size={13} />}
              <div className="flex-1" />
              {!readOnly && (
                <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                  <Plus size={13} />
                  Add document
                </Button>
              )}
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
              <IconButton label="Refresh" onClick={() => void load()}>
                <RefreshCw size={13} />
              </IconButton>
            </div>

            <form
              className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                setPage(1)
                setFilter(filterDraft.trim() || '{}')
              }}
            >
              <input
                value={filterDraft}
                onChange={(e) => setFilterDraft(e.target.value)}
                placeholder='Filter (Extended JSON), e.g. { "age": { "$gt": 18 } }'
                className="h-7 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 font-mono text-xs text-text placeholder:text-faint focus:border-accent focus:outline-none"
              />
              <Button size="sm" variant="primary" type="submit">
                <Search size={13} />
                Search
              </Button>
            </form>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              {error ? (
                <div className="flex items-start gap-2 font-mono text-xs text-danger">{error}</div>
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
                      {!readOnly && (
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
    </div>
  )
}
