import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Search,
  X,
  Plus,
  FileUp
} from 'lucide-react'
import type {
  DriverKind,
  FilterOperator,
  FilterSpec,
  RowsResult,
  SortSpec,
  TableMeta
} from '@shared/types'
import { DataTable, type DataTableEditing } from '@renderer/components/ui/DataTable'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Spinner } from '@renderer/components/ui/Spinner'
import { Select } from '@renderer/components/ui/Select'
import { Input } from '@renderer/components/ui/Input'
import { Button } from '@renderer/components/ui/Button'
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog'
import { ExportButton } from '@renderer/components/ui/ExportButton'
import { RowEditModal } from './RowEditModal'
import { ImportDataModal } from './ImportDataModal'
import { TableStructure } from './TableStructure'
import { cn } from '@renderer/lib/cn'

interface TableDataTabProps {
  sessionId: string
  table: string
  kind: DriverKind
  database?: string
  readOnly?: boolean
  /** Pre-applied filter (foreign-key navigation opens tabs with one). */
  initialFilter?: FilterSpec
  /** Open the referenced table filtered to a foreign-key value. */
  onNavigateForeignKey?: (targetTable: string, targetColumn: string, value: unknown) => void
}

type ForeignKeyMap = Record<string, { targetTable: string; targetColumn: string }>

const PAGE_SIZES = [50, 100, 500]

const FILTER_OPERATORS: { value: FilterOperator; label: string; noValue?: boolean }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'like', label: 'LIKE' },
  { value: 'isNull', label: 'is null', noValue: true },
  { value: 'isNotNull', label: 'is not null', noValue: true }
]

export function TableDataTab({
  sessionId,
  table,
  kind,
  database,
  readOnly,
  initialFilter,
  onNavigateForeignKey
}: TableDataTabProps): React.JSX.Element {
  const [view, setView] = useState<'data' | 'structure'>('data')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [sort, setSort] = useState<SortSpec | null>(null)
  const [filter, setFilter] = useState<FilterSpec | null>(initialFilter ?? null)
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyMap>({})
  // Row-action targets (indices into the current result page).
  const [editRowIndex, setEditRowIndex] = useState<number | null>(null)
  const [deleteRowIndex, setDeleteRowIndex] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  // Draft filter inputs (applied only when Search is clicked).
  const [filterColumn, setFilterColumn] = useState(initialFilter?.column ?? '')
  const [filterOp, setFilterOp] = useState<FilterOperator>(initialFilter?.operator ?? 'eq')
  const [filterValue, setFilterValue] = useState(
    initialFilter?.value != null ? String(initialFilter.value) : ''
  )
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
        sort: sort ?? undefined,
        filter: filter ?? undefined
      })
      if (reqRef.current === reqId) setResult(res)
    } catch (err) {
      if (reqRef.current === reqId) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (reqRef.current === reqId) setLoading(false)
    }
  }, [sessionId, table, database, page, pageSize, sort, filter])

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

  const opNeedsNoValue = FILTER_OPERATORS.find((o) => o.value === filterOp)?.noValue ?? false

  const applyFilter = (): void => {
    setPage(1)
    const column = filterColumn || result?.columns[0]
    if (!column) return
    if (!opNeedsNoValue && filterValue === '') {
      setFilter(null)
      return
    }
    setFilter({ column, operator: filterOp, value: filterValue })
  }

  const clearFilter = (): void => {
    setPage(1)
    setFilter(null)
    setFilterValue('')
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

  // Load foreign keys for this table so FK cells can link to referenced rows.
  useEffect(() => {
    let cancelled = false
    window.api.db
      .schemaGraph(sessionId, database)
      .then((g) => {
        if (cancelled) return
        const map: ForeignKeyMap = {}
        for (const rel of g.relations) {
          if (rel.sourceTable === table) {
            map[rel.sourceColumn] = { targetTable: rel.targetTable, targetColumn: rel.targetColumn }
          }
        }
        setForeignKeys(map)
      })
      .catch(() => {
        if (!cancelled) setForeignKeys({})
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, table, database])

  const pkForRow = useCallback(
    (rowIndex: number): Record<string, unknown> => {
      if (!result || !meta) throw new Error('Row metadata not loaded')
      const pk: Record<string, unknown> = {}
      for (const key of meta.primaryKeys) {
        const idx = result.columns.indexOf(key)
        if (idx < 0) throw new Error(`Primary key column "${key}" is not in the result set`)
        pk[key] = result.rows[rowIndex][idx]
      }
      return pk
    },
    [result, meta]
  )

  /** Patch the given columns of a row in the local result (no refetch). */
  const patchRow = (rowIndex: number, changes: Record<string, unknown>): void =>
    setResult((prev) => {
      if (!prev) return prev
      const rows = prev.rows.map((r, i) => {
        if (i !== rowIndex) return r
        const copy = [...r]
        for (const [col, val] of Object.entries(changes)) {
          const ci = prev.columns.indexOf(col)
          if (ci >= 0) copy[ci] = val
        }
        return copy
      })
      return { ...prev, rows }
    })

  const applyEdit = useCallback(
    async (rowIndex: number, column: string, value: unknown): Promise<void> => {
      await window.api.db.update(sessionId, table, {
        database,
        pk: pkForRow(rowIndex),
        changes: { [column]: value }
      })
      patchRow(rowIndex, { [column]: value })
    },
    [sessionId, table, database, pkForRow]
  )

  const saveRow = useCallback(
    async (rowIndex: number, changes: Record<string, unknown>): Promise<void> => {
      await window.api.db.update(sessionId, table, { database, pk: pkForRow(rowIndex), changes })
      patchRow(rowIndex, changes)
    },
    [sessionId, table, database, pkForRow]
  )

  const insertRow = useCallback(
    async (values: Record<string, unknown>): Promise<void> => {
      await window.api.db.insertRow(sessionId, table, { database, values })
      await load()
    },
    [sessionId, table, database, load]
  )

  const importRows = useCallback(
    async (rows: Record<string, unknown>[]): Promise<number> => {
      const count = await window.api.db.importTableData(sessionId, table, { database, rows })
      await load()
      return count
    },
    [sessionId, table, database, load]
  )

  const confirmDelete = async (): Promise<void> => {
    if (deleteRowIndex === null) return
    try {
      await window.api.db.deleteRow(sessionId, table, { database, pk: pkForRow(deleteRowIndex) })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleteRowIndex(null)
    }
  }

  const editing: DataTableEditing | undefined = meta
    ? {
        columnsMeta: meta.columns,
        primaryKeys: meta.primaryKeys,
        table,
        kind,
        readOnly,
        onApply: applyEdit,
        onEditRow: (rowIndex) => setEditRowIndex(rowIndex),
        onDeleteRow: (rowIndex) => setDeleteRowIndex(rowIndex)
      }
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
        <div className="flex items-center rounded-md border border-border p-0.5">
          {(['data', 'structure'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] capitalize transition-colors',
                view === v ? 'bg-accent-soft text-text' : 'text-muted hover:text-text'
              )}
            >
              {v}
            </button>
          ))}
        </div>
        {view === 'data' && (
          <>
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
          </>
        )}
        <div className="flex-1" />
        {view === 'data' && !readOnly && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)} disabled={!meta}>
              <Plus size={13} />
              Add row
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setImportOpen(true)}
              disabled={!meta}
            >
              <FileUp size={13} />
              Import
            </Button>
          </>
        )}
        {view === 'data' && (
          <>
            <ExportButton
              columns={result?.columns ?? []}
              rows={result?.rows ?? []}
              filename={table}
              fetchRows={async () => {
                const all = await window.api.db.rows(sessionId, table, {
                  page: 1,
                  pageSize: Math.max(result?.total ?? 0, 1),
                  database,
                  sort: sort ?? undefined,
                  filter: filter ?? undefined
                })
                return all.rows
              }}
            />
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
          </>
        )}
      </div>

      {/* Filter row: column · operator · value · Search */}
      {view === 'data' && (
        <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
          <Select
            className="h-7 w-auto pr-7 text-xs"
            aria-label="Filter column"
            value={filterColumn || (result?.columns[0] ?? '')}
            onChange={(e) => setFilterColumn(e.target.value)}
          >
            {(result?.columns ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select
            className="h-7 w-auto pr-7 text-xs"
            aria-label="Filter operator"
            value={filterOp}
            onChange={(e) => setFilterOp(e.target.value as FilterOperator)}
          >
            {FILTER_OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Input
            className="h-7 min-w-0 flex-1 text-xs"
            placeholder={opNeedsNoValue ? 'no value needed' : 'filter value'}
            disabled={opNeedsNoValue}
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFilter()
            }}
          />
          <Button size="sm" variant="primary" onClick={applyFilter}>
            <Search size={13} />
            Search
          </Button>
          {filter && (
            <Button size="sm" variant="ghost" onClick={clearFilter}>
              <X size={13} />
              Clear
            </Button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        {view === 'structure' ? (
          <TableStructure sessionId={sessionId} table={table} database={database} />
        ) : error ? (
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
            foreignKeys={foreignKeys}
            onForeignKey={onNavigateForeignKey}
          />
        )}
      </div>

      {editRowIndex !== null && result && meta && (
        <RowEditModal
          key={editRowIndex}
          open
          table={table}
          columns={result.columns}
          columnsMeta={meta.columns}
          values={result.rows[editRowIndex]}
          onClose={() => setEditRowIndex(null)}
          onSave={(changes) => saveRow(editRowIndex, changes)}
        />
      )}

      {addOpen && result && meta && (
        <RowEditModal
          open
          table={table}
          title={`Add row · ${table}`}
          submitLabel="Add row"
          columns={result.columns}
          columnsMeta={meta.columns}
          values={result.columns.map(() => null)}
          onClose={() => setAddOpen(false)}
          onSave={insertRow}
        />
      )}

      {importOpen && (
        <ImportDataModal
          open
          table={table}
          tableColumns={meta?.columns.map((c) => c.name) ?? result?.columns ?? []}
          onClose={() => setImportOpen(false)}
          onImport={importRows}
        />
      )}

      <ConfirmDialog
        open={deleteRowIndex !== null}
        title="Delete row?"
        description="This permanently deletes the row from the database and cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteRowIndex(null)}
      />
    </div>
  )
}
