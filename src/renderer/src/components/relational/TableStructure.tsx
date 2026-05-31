import { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound } from 'lucide-react'
import type { TableStructure as TableStructureData } from '@shared/types'
import { Spinner } from '@renderer/components/ui/Spinner'

interface TableStructureProps {
  sessionId: string
  table: string
  database?: string
}

/** Read-only view of a table's columns, indexes, and CREATE DDL. */
export function TableStructure({
  sessionId,
  table,
  database
}: TableStructureProps): React.JSX.Element {
  const [data, setData] = useState<TableStructureData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- structure fetch sets loading/data intentionally
    setLoading(true)
    setError(null)
    window.api.db
      .tableStructure(sessionId, table, database)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, table, database])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Spinner size={18} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center gap-2 px-6 text-center text-xs text-danger">
        <AlertTriangle size={16} /> {error}
      </div>
    )
  }

  if (!data) return <div className="p-6 text-xs text-muted">No structure available.</div>

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <Section title="Columns">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left text-faint">
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Nullable</Th>
              <Th>Default</Th>
              <Th>Extra</Th>
            </tr>
          </thead>
          <tbody>
            {data.columns.map((c) => (
              <tr key={c.name} className="border-t border-border/60">
                <Td>
                  <span className="flex items-center gap-1.5 font-mono text-text">
                    {c.isPrimaryKey && <KeyRound size={11} className="shrink-0 text-accent" />}
                    {c.name}
                  </span>
                </Td>
                <Td className="font-mono">{c.dataType}</Td>
                <Td>{c.nullable ? 'YES' : 'NO'}</Td>
                <Td className="font-mono">{c.default ?? <span className="text-faint">—</span>}</Td>
                <Td>{c.extra || <span className="text-faint">—</span>}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Indexes">
        {data.indexes.length === 0 ? (
          <p className="text-xs text-faint">No indexes.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-faint">
                <Th>Name</Th>
                <Th>Columns</Th>
                <Th>Unique</Th>
              </tr>
            </thead>
            <tbody>
              {data.indexes.map((idx) => (
                <tr key={idx.name} className="border-t border-border/60">
                  <Td className="font-mono text-text">{idx.name}</Td>
                  <Td className="font-mono">{idx.columns.join(', ')}</Td>
                  <Td>{idx.unique ? 'YES' : 'NO'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {data.createSql && (
        <Section title="CREATE statement">
          <pre className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text">
            {data.createSql}
          </pre>
        </Section>
      )}
    </div>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

function Th({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <th className="px-2 py-1.5 font-medium">{children}</th>
}

function Td({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return <td className={`px-2 py-1.5 align-top text-muted ${className ?? ''}`}>{children}</td>
}
