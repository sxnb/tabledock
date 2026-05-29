import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react'
import type { RowsResult } from '@shared/types'
import { DataTable } from '@renderer/components/ui/DataTable'
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
  const [result, setResult] = useState<RowsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.db.rows(sessionId, table, { page, pageSize, database })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [sessionId, table, database, page, pageSize])

  // Fetch rows whenever the target or pagination changes (external sync).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch sets loading/result intentionally
    void load()
  }, [load])

  const total = result?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs text-muted">
        <span className="font-mono text-text">{table}</span>
        <span className="text-faint">·</span>
        <span>
          {from}–{to} of {total.toLocaleString()}
        </span>
        {loading && <Spinner size={13} />}
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
          />
        )}
      </div>
    </div>
  )
}
