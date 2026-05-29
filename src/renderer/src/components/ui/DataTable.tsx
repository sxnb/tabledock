import { formatCell } from '@renderer/lib/format'
import { cn } from '@renderer/lib/cn'

interface DataTableProps {
  columns: string[]
  rows: unknown[][]
  /** Optional empty-state message when there are zero rows. */
  emptyMessage?: string
}

/**
 * A lightweight, sleek result grid: sticky header, monospace cells, NULLs
 * rendered faint. The container scrolls in both directions.
 */
export function DataTable({ columns, rows, emptyMessage }: DataTableProps): React.JSX.Element {
  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        {emptyMessage ?? 'No columns to display'}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-left font-mono text-xs">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 w-12 border-b border-r border-border bg-surface-3 px-2 py-1.5 text-right font-medium text-faint">
              #
            </th>
            {columns.map((col, i) => (
              <th
                key={i}
                className="whitespace-nowrap border-b border-r border-border bg-surface-3 px-3 py-1.5 font-semibold text-muted"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-surface-2/60">
              <td className="sticky left-0 w-12 border-b border-r border-border bg-surface px-2 py-1.5 text-right text-faint">
                {ri + 1}
              </td>
              {row.map((cell, ci) => {
                const { text, kind } = formatCell(cell)
                return (
                  <td
                    key={ci}
                    title={text}
                    className={cn(
                      'max-w-[420px] truncate border-b border-r border-border px-3 py-1.5',
                      kind === 'null' ? 'italic text-faint' : 'text-text'
                    )}
                  >
                    {text}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="flex items-center justify-center py-10 text-xs text-muted">
          {emptyMessage ?? 'No rows'}
        </div>
      )}
    </div>
  )
}
