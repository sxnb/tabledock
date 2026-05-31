import { useState } from 'react'
import { AlertTriangle, FileUp } from 'lucide-react'
import { Modal } from '@renderer/components/ui/Modal'
import { Button } from '@renderer/components/ui/Button'
import { Select } from '@renderer/components/ui/Select'
import { Spinner } from '@renderer/components/ui/Spinner'
import { parseCsv, parseJsonRows, type ParsedTable } from '@renderer/lib/csv'

interface ImportDataModalProps {
  open: boolean
  table: string
  /** Target table's column names, used to build the mapping options. */
  tableColumns: string[]
  onClose: () => void
  /** Insert the mapped rows; returns the number inserted. */
  onImport: (rows: Record<string, unknown>[]) => Promise<number>
}

const IGNORE = ''
const PREVIEW_ROWS = 5

/** Pick a CSV/JSON file, map its columns to the table's, and bulk-insert rows. */
export function ImportDataModal({
  open,
  table,
  tableColumns,
  onClose,
  onImport
}: ImportDataModalProps): React.JSX.Element {
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<ParsedTable | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  const reset = (): void => {
    setFileName('')
    setParsed(null)
    setMapping({})
    setError(null)
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const data = file.name.toLowerCase().endsWith('.json') ? parseJsonRows(text) : parseCsv(text)
      if (data.columns.length === 0) throw new Error('No columns found in file')
      // Auto-map file columns to table columns by case-insensitive name match.
      const lower = new Map(tableColumns.map((c) => [c.toLowerCase(), c]))
      const map: Record<string, string> = {}
      for (const col of data.columns) map[col] = lower.get(col.toLowerCase()) ?? IGNORE
      setFileName(file.name)
      setParsed(data)
      setMapping(map)
    } catch (err) {
      setParsed(null)
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const mappedColumns = parsed?.columns.filter((c) => mapping[c]) ?? []

  const doImport = async (): Promise<void> => {
    if (!parsed) return
    setImporting(true)
    setError(null)
    try {
      const rows = parsed.rows.map((r) => {
        const obj: Record<string, unknown> = {}
        parsed.columns.forEach((fc, ci) => {
          const target = mapping[fc]
          if (!target) return
          const raw = r[ci]
          obj[target] = raw === '' ? null : raw
        })
        return obj
      })
      await onImport(rows)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={`Import data · ${table}`}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close} disabled={importing}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={doImport}
            disabled={!parsed || mappedColumns.length === 0 || importing}
          >
            {importing && <Spinner size={13} className="text-white" />}
            Import {parsed ? `${parsed.rows.length} row(s)` : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface-2 px-3 py-4 text-xs text-muted hover:border-accent hover:text-text">
          <FileUp size={15} />
          {fileName || 'Choose a CSV or JSON file…'}
          <input type="file" accept=".csv,.json" className="hidden" onChange={onFile} />
        </label>

        {error && (
          <div className="flex items-start gap-2 text-xs text-danger">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {parsed && (
          <>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Column mapping
              </h3>
              <div className="flex flex-col gap-1.5">
                {parsed.columns.map((col) => (
                  <div key={col} className="flex items-center gap-2 text-xs">
                    <span className="w-1/2 truncate font-mono text-text" title={col}>
                      {col}
                    </span>
                    <span className="text-faint">→</span>
                    <Select
                      className="h-7 flex-1 pr-7 text-xs"
                      value={mapping[col] ?? IGNORE}
                      onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                    >
                      <option value={IGNORE}>— ignore —</option>
                      {tableColumns.map((tc) => (
                        <option key={tc} value={tc}>
                          {tc}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {parsed.rows.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Preview ({Math.min(PREVIEW_ROWS, parsed.rows.length)} of {parsed.rows.length})
                </h3>
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-surface-2 text-left text-faint">
                        {parsed.columns.map((c) => (
                          <th key={c} className="px-2 py-1 font-medium">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                        <tr key={i} className="border-t border-border/60">
                          {parsed.columns.map((_, ci) => (
                            <td
                              key={ci}
                              className="max-w-40 truncate px-2 py-1 font-mono text-muted"
                            >
                              {r[ci]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
