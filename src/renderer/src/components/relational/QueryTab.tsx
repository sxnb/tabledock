import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import {
  sql,
  MySQL,
  MariaSQL,
  PostgreSQL,
  MSSQL,
  SQLite,
  StandardSQL,
  type SQLDialect
} from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'
import { Play, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { DriverKind, QueryResult } from '@shared/types'
import { useSettings } from '@renderer/store/settings'
import { DataTable } from '@renderer/components/ui/DataTable'
import { Button } from '@renderer/components/ui/Button'
import { Spinner } from '@renderer/components/ui/Spinner'
import { ExportButton } from '@renderer/components/ui/ExportButton'

interface QueryTabProps {
  sessionId: string
  /** Saved connection id — used to scope query history. */
  connectionId: string
  kind: DriverKind
  database?: string
  /** Editor contents, owned by the workspace store so it survives tab switches. */
  sql: string
  onSqlChange: (sql: string) => void
}

function dialectFor(kind: DriverKind): SQLDialect {
  switch (kind) {
    case 'mysql':
      return MySQL
    case 'mariadb':
      return MariaSQL
    case 'postgres':
      return PostgreSQL
    case 'mssql':
      return MSSQL
    case 'sqlite':
      return SQLite
    default:
      return StandardSQL
  }
}

export function QueryTab({
  sessionId,
  connectionId,
  kind,
  database,
  sql: sqlText,
  onSqlChange
}: QueryTabProps): React.JSX.Element {
  const resolvedTheme = useSettings((s) => s.resolvedTheme)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  // Schema for autocomplete: { tableName: [columnName, ...] }.
  const [schema, setSchema] = useState<Record<string, string[]>>({})

  useEffect(() => {
    let cancelled = false
    window.api.db
      .schemaGraph(sessionId, database)
      .then((g) => {
        if (cancelled) return
        setSchema(Object.fromEntries(g.tables.map((t) => [t.name, t.columns.map((c) => c.name)])))
      })
      .catch(() => {
        if (!cancelled) setSchema({})
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, database])

  const extensions = useMemo(() => [sql({ dialect: dialectFor(kind), schema })], [kind, schema])

  const run = async (): Promise<void> => {
    if (!sqlText.trim() || running) return
    setRunning(true)
    setError(null)
    let ok = true
    try {
      const res = await window.api.db.query(sessionId, sqlText, database)
      setResult(res)
    } catch (err) {
      ok = false
      setError(err instanceof Error ? err.message : String(err))
      setResult(null)
    } finally {
      setRunning(false)
      void window.api.history.add(connectionId, { sql: sqlText, ok })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void run()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
        <Button variant="primary" size="sm" onClick={run} disabled={running}>
          {running ? <Spinner size={13} className="text-white" /> : <Play size={13} />}
          Run
        </Button>
        <span className="text-[11px] text-faint">⌘/Ctrl + Enter</span>
        <div className="flex-1" />
        <ResultStatus result={result} error={error} />
        {result && result.columns.length > 0 && (
          <ExportButton columns={result.columns} rows={result.rows} filename="query-result" />
        )}
      </div>

      <div className="min-h-0 shrink-0 border-b border-border" onKeyDown={onKeyDown}>
        <CodeMirror
          value={sqlText}
          onChange={onSqlChange}
          height="180px"
          theme={resolvedTheme === 'dark' ? oneDark : 'light'}
          extensions={extensions}
          basicSetup={{ highlightActiveLine: true, foldGutter: false }}
        />
      </div>

      <div className="min-h-0 flex-1">
        {error ? (
          <div className="flex h-full items-start gap-2 overflow-auto px-4 py-3 font-mono text-xs text-danger">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <pre className="whitespace-pre-wrap">{error}</pre>
          </div>
        ) : result && result.columns.length > 0 ? (
          <DataTable columns={result.columns} rows={result.rows} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            {result
              ? `Statement executed${result.affectedRows != null ? ` · ${result.affectedRows} row(s) affected` : ''}`
              : 'Run a query to see results'}
          </div>
        )}
      </div>
    </div>
  )
}

function ResultStatus({
  result,
  error
}: {
  result: QueryResult | null
  error: string | null
}): React.JSX.Element | null {
  if (error) return null
  if (!result) return null
  if (result.columns.length > 0) {
    return <span className="text-[11px] text-muted">{result.rowCount} row(s)</span>
  }
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-ok">
      <CheckCircle2 size={13} /> {result.affectedRows ?? 0} affected
    </span>
  )
}
