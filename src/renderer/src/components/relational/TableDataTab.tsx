import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react'
import type { RowsResult, SortSpec, TableMeta } from '@shared/types'
import { DataTable, type DataTableEditing } from '@renderer/components/ui/DataTable'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Spinner } from '@renderer/components/ui/Spinner'
import { Select } from '@renderer/components/ui/Select'

interface TableDataTabProps {
  sessionId: string
  table: string
  database?: string
}

const PAGE_SIZES = [50, 100, 500]

export function TableDataTab({ sessionId, table, database }: TableDataTabProps): React.JSX.Element {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [sort, setSort] = useState<SortSpec | null>(null)
  const [result, setResult] = useState<RowsResult | null>(null)
  const [meta, setMeta] = useState<TableMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Monotonic request id so a slower earlier fetch can't overwrite a newer one
  // (e.g. the initial unsorted load resolving after a sort against a remote DB).
  const reqRef = useRef(0)

  const load = useCallback(async () => {
    const reqId = ++reqRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.db.rows(sessionId, table, {
        page,
        pageSize,
        database,
        sort: sort ?? undefined
      })
      if (reqRef.current === reqId) setResult(res)
    } catch (err) {
      if (reqRef.current === reqId) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (reqRef.current === reqId) setLoading(false)
    }
  }, [sessionId, table, database, page, pageSize, sort])

  // Cycle a column's sort: unsorted → asc → desc → unsorted. Sorting resets to
  // page 1 since it reorders the whole result set, not just the visible page.
  const onSort = (column: string): void => {
    setPage(1)
    setSort((prev) => {
      if (prev?.column !== column) return { column, direction: 'asc' }
      if (prev.direction === 'asc') return { column, direction: 'desc' }
      return null
    })
  }

  // Fetch rows whenever the target or pagination changes (external sync).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch sets loading/result intentionally
    void load()
  }, [load])

  // Load column metadata + primary keys once per table (enables inline editing).
  useEffect(() => {
    let cancelled = false
    window.api.db
      .tableMeta(sessionId, table, database)
      .then((m) => {
        if (!cancelled) setMeta(m)
      })
      .catch(() => {
        if (!cancelled) setMeta(null)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, table, database])

  const applyEdit = useCallback(
    async (rowIndex: number, column: string, value: unknown): Promise<void> => {
      if (!result || !meta) return
      const pk: Record<string, unknown> = {}
      for (const key of meta.primaryKeys) {
        const idx = result.columns.indexOf(key)
        if (idx < 0) throw new Error(`Primary key column "${key}" is not in the result set`)
        pk[key] = result.rows[rowIndex][idx]
      }
      await window.api.db.update(sessionId, table, { database, pk, changes: { [column]: value } })
      // Reflect the change locally without refetching the whole page.
      const colIndex = result.columns.indexOf(column)
      setResult((prev) => {
        if (!prev) return prev
        const rows = prev.rows.map((r, i) => {
          if (i !== rowIndex) return r
          const copy = [...r]
          copy[colIndex] = value
          return copy
        })
        return { ...prev, rows }
      })
    },
    [result, meta, sessionId, table, database]
  )

  const editing: DataTableEditing | undefined = meta
    ? { columnsMeta: meta.columns, primaryKeys: meta.primaryKeys, onApply: applyEdit }
    : undefined

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const editable = (meta?.primaryKeys.length ?? 0) > 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs text-muted">
        <span className="font-mono text-text">{table}</span>
        <span className="text-faint">·</span>
        <span>
          {from}–{to} of {total.toLocaleString()}
        </span>
        {loading && <Spinner size={13} />}
        {meta && !editable && (
          <span className="text-faint" title="Inline editing requires a primary key">
            · read-only (no primary key)
          </span>
        )}
        <div className="flex-1" />
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
              {s} rows
            </option>
          ))}
        </Select>
        <IconButton
          label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          <ChevronLeft size={15} />
        </IconButton>
        <span className="tabular-nums">
          {page} / {totalPages}
        </span>
        <IconButton
          label="Next page"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          <ChevronRight size={15} />
        </IconButton>
        <IconButton label="Refresh" onClick={() => void load()}>
          <RefreshCw size={13} />
        </IconButton>
      </div>

      <div className="min-h-0 flex-1">
        {error ? (
          <div className="flex h-full items-center justify-center gap-2 px-6 text-center text-xs text-danger">
            <AlertTriangle size={16} /> {error}
          </div>
        ) : (
          <DataTable
            columns={result?.columns ?? []}
            rows={result?.rows ?? []}
            emptyMessage="This table is empty"
            editing={editing}
            sort={sort}
            onSort={onSort}
          />
        )}
      </div>
    </div>
  )
}
