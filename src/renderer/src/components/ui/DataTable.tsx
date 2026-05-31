import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  X,
  Check,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Pencil,
  Copy,
  Trash2,
  ArrowUpRight
} from 'lucide-react'
import * as ContextMenu from '@radix-ui/react-context-menu'
import type { ColumnMeta, DriverKind, SortSpec } from '@shared/types'
import { formatCell } from '@renderer/lib/format'
import { inputKind, toTypedValue } from '@renderer/lib/columnInput'
import { cn } from '@renderer/lib/cn'
import { toast } from '@renderer/store/toasts'
import { Button } from './Button'
import { Spinner } from './Spinner'

const ROW_NUM_W = 48
const DEFAULT_COL_W = 180
const MIN_COL_W = 60

export interface DataTableEditing {
  columnsMeta: ColumnMeta[]
  primaryKeys: string[]
  table: string
  kind: DriverKind
  /** When true, disable all write actions (inline edit, edit/delete row). */
  readOnly?: boolean
  /** Persist a single cell change; should throw on failure. */
  onApply: (rowIndex: number, column: string, value: unknown) => Promise<void>
  /** Open the full row editor. */
  onEditRow: (rowIndex: number) => void
  /** Delete the row (confirmation handled by the caller). */
  onDeleteRow: (rowIndex: number) => void
}

interface DataTableProps {
  columns: string[]
  rows: unknown[][]
  /** Optional empty-state message when there are zero rows. */
  emptyMessage?: string
  /** When provided (and the table has a primary key), cells become editable. */
  editing?: DataTableEditing
  /** Current server-side sort, if any. */
  sort?: SortSpec | null
  /** When provided, headers become clickable to cycle the sort on that column. */
  onSort?: (column: string) => void
  /** Columns that are foreign keys → their referenced table/column. */
  foreignKeys?: Record<string, { targetTable: string; targetColumn: string }>
  /** Invoked when a foreign-key cell's jump affordance is clicked. */
  onForeignKey?: (targetTable: string, targetColumn: string, value: unknown) => void
}

interface EditState {
  rowIndex: number
  colIndex: number
  column: string
  draft: string
}

function quoteIdentFor(kind: DriverKind, name: string): string {
  if (kind === 'mysql' || kind === 'mariadb') return '`' + name.replace(/`/g, '``') + '`'
  if (kind === 'mssql') return '[' + name.replace(/]/g, ']]') + ']'
  return '"' + name.replace(/"/g, '""') + '"'
}

function csvValue(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function sqlValue(v: unknown): string {
  if (v == null) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return `'${s.replace(/'/g, "''")}'`
}

function cellText(v: unknown): string {
  if (v == null) return ''
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

/**
 * A lightweight, sleek result grid: sticky header, monospace cells, NULLs
 * rendered faint. When `editing` is supplied and the table has a primary key,
 * double-clicking a cell turns it into an inline editor with an apply/cancel
 * footer; clicking anywhere outside the cell or footer cancels.
 */
export function DataTable({
  columns,
  rows,
  emptyMessage,
  editing,
  sort,
  onSort,
  foreignKeys,
  onForeignKey
}: DataTableProps): React.JSX.Element {
  const [edit, setEdit] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cellRef = useRef<HTMLTableCellElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)

  const metaByName = useMemo(() => {
    const map = new Map<string, ColumnMeta>()
    editing?.columnsMeta.forEach((m) => map.set(m.name, m))
    return map
  }, [editing])

  const editable = Boolean(editing) && !editing?.readOnly && (editing?.primaryKeys.length ?? 0) > 0
  // The column the context menu was opened on (for "copy cell value").
  const contextColRef = useRef(0)

  const copy = (text: string, label: string): void => {
    void navigator.clipboard.writeText(text)
    toast.success(label)
  }
  const copyRowCsv = (ri: number): void =>
    copy(columns.map((_, i) => csvValue(rows[ri][i])).join(','), 'Row copied as CSV')
  const copyRowSql = (ri: number): void => {
    if (!editing) return
    const cols = columns.map((c) => quoteIdentFor(editing.kind, c)).join(', ')
    const vals = columns.map((_, i) => sqlValue(rows[ri][i])).join(', ')
    copy(
      `INSERT INTO ${quoteIdentFor(editing.kind, editing.table)} (${cols}) VALUES (${vals});`,
      'Row copied as SQL'
    )
  }
  const copyCell = (ri: number, ci: number): void => copy(cellText(rows[ri][ci]), 'Cell copied')

  // Per-column widths (px), keyed by name; unset columns use the default.
  const [widths, setWidths] = useState<Record<string, number>>({})
  const widthOf = (col: string): number => widths[col] ?? DEFAULT_COL_W
  const totalWidth = ROW_NUM_W + columns.reduce((sum, c) => sum + widthOf(c), 0)

  const startResize = (e: React.MouseEvent, col: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widthOf(col)
    const onMove = (ev: MouseEvent): void => {
      setWidths((prev) => ({ ...prev, [col]: Math.max(MIN_COL_W, startW + (ev.clientX - startX)) }))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
  }

  const cancel = (): void => {
    setEdit(null)
    setError(null)
  }

  // Clicking outside the editing cell or the footer cancels edit mode.
  useEffect(() => {
    if (!edit) return
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (cellRef.current?.contains(target) || footerRef.current?.contains(target)) return
      cancel()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [edit])

  const startEdit = (rowIndex: number, colIndex: number, column: string, cell: unknown): void => {
    if (!editable || saving) return
    setError(null)
    setEdit({ rowIndex, colIndex, column, draft: cell == null ? '' : String(cell) })
  }

  const apply = async (): Promise<void> => {
    if (!edit || !editing) return
    const value = toTypedValue(metaByName.get(edit.column), edit.draft)
    setSaving(true)
    setError(null)
    try {
      await editing.onApply(edit.rowIndex, edit.column, value)
      setEdit(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        {emptyMessage ?? 'No columns to display'}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <table
          className="table-fixed border-collapse text-left font-mono text-xs"
          style={{ width: totalWidth }}
        >
          <colgroup>
            <col style={{ width: ROW_NUM_W }} />
            {columns.map((col, i) => (
              <col key={i} style={{ width: widthOf(col) }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 border-b border-r border-border bg-surface-3 px-2 py-1.5 text-right font-medium text-faint">
                #
              </th>
              {columns.map((col, i) => {
                const sorted = sort?.column === col ? sort.direction : null
                const headerInner = (
                  <>
                    <span className="min-w-0 truncate">{col}</span>
                    {metaByName.get(col)?.isPrimaryKey && (
                      <span className="shrink-0 text-[9px] text-accent">PK</span>
                    )}
                    {sorted === 'asc' && <ChevronUp size={12} className="shrink-0 text-accent" />}
                    {sorted === 'desc' && (
                      <ChevronDown size={12} className="shrink-0 text-accent" />
                    )}
                  </>
                )
                return (
                  <th
                    key={i}
                    className={cn(
                      'relative overflow-hidden border-b border-r border-border bg-surface-3 font-semibold',
                      sorted ? 'text-text' : 'text-muted'
                    )}
                  >
                    {onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(col)}
                        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:text-text"
                      >
                        {headerInner}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 px-3 py-1.5">{headerInner}</span>
                    )}
                    <div
                      onMouseDown={(e) => startResize(e, col)}
                      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-accent/60"
                    />
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const rowEditing = edit?.rowIndex === ri
              const tr = (
                <tr className={cn(rowEditing ? 'bg-accent-soft/60' : 'hover:bg-surface-2/60')}>
                  <td className="sticky left-0 w-12 border-b border-r border-border bg-surface px-2 py-1.5 text-right text-faint">
                    {ri + 1}
                  </td>
                  {row.map((cell, ci) => {
                    const column = columns[ci]
                    const isEditingCell = rowEditing && edit?.colIndex === ci
                    if (isEditingCell) {
                      return (
                        <td
                          key={ci}
                          ref={cellRef}
                          className="border-b border-r border-accent bg-surface p-0"
                        >
                          <CellEditor
                            meta={metaByName.get(column)}
                            value={edit.draft}
                            onChange={(draft) => setEdit((e) => (e ? { ...e, draft } : e))}
                            onCommit={apply}
                            onCancel={cancel}
                          />
                        </td>
                      )
                    }
                    const { text, kind } = formatCell(cell)
                    const fk = foreignKeys?.[column]
                    const canJump = Boolean(fk && onForeignKey && cell != null)
                    return (
                      <td
                        key={ci}
                        title={text}
                        onDoubleClick={() => startEdit(ri, ci, column, cell)}
                        onContextMenu={() => {
                          contextColRef.current = ci
                        }}
                        className={cn(
                          'border-b border-r border-border px-3 py-1.5',
                          canJump ? 'group/fk' : 'truncate',
                          editable && 'cursor-text',
                          kind === 'null' ? 'italic text-faint' : 'text-text'
                        )}
                      >
                        {canJump ? (
                          <span className="flex items-center gap-1">
                            <span className="min-w-0 truncate">{text}</span>
                            <button
                              type="button"
                              title={`Go to ${fk!.targetTable}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onForeignKey!(fk!.targetTable, fk!.targetColumn, cell)
                              }}
                              className="shrink-0 text-faint opacity-0 transition-opacity hover:text-accent group-hover/fk:opacity-100"
                            >
                              <ArrowUpRight size={13} />
                            </button>
                          </span>
                        ) : (
                          text
                        )}
                      </td>
                    )
                  })}
                </tr>
              )

              if (!editing) return <Fragment key={ri}>{tr}</Fragment>

              const hasPk = editing.primaryKeys.length > 0
              const canWrite = !editing.readOnly
              return (
                <ContextMenu.Root key={ri}>
                  <ContextMenu.Trigger asChild>{tr}</ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className="z-50 min-w-48 overflow-hidden rounded-md border border-border bg-surface-2 p-1 text-xs text-text shadow-xl">
                      {canWrite && (
                        <>
                          <RowMenuItem
                            icon={<Pencil size={13} />}
                            disabled={!hasPk}
                            onSelect={() => editing.onEditRow(ri)}
                          >
                            Edit row
                          </RowMenuItem>
                          <ContextMenu.Separator className="my-1 h-px bg-border" />
                        </>
                      )}
                      <RowMenuItem icon={<Copy size={13} />} onSelect={() => copyRowCsv(ri)}>
                        Copy row as CSV
                      </RowMenuItem>
                      <RowMenuItem icon={<Copy size={13} />} onSelect={() => copyRowSql(ri)}>
                        Copy row as SQL
                      </RowMenuItem>
                      <RowMenuItem
                        icon={<Copy size={13} />}
                        onSelect={() => copyCell(ri, contextColRef.current)}
                      >
                        Copy cell value
                      </RowMenuItem>
                      {canWrite && (
                        <>
                          <ContextMenu.Separator className="my-1 h-px bg-border" />
                          <RowMenuItem
                            icon={<Trash2 size={13} />}
                            disabled={!hasPk}
                            danger
                            onSelect={() => editing.onDeleteRow(ri)}
                          >
                            Delete row
                          </RowMenuItem>
                        </>
                      )}
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="flex items-center justify-center py-10 text-xs text-muted">
            {emptyMessage ?? 'No rows'}
          </div>
        )}
      </div>

      {edit && (
        <div
          ref={footerRef}
          className="flex shrink-0 items-center gap-3 border-t border-border bg-surface px-3 py-2"
        >
          <span className="text-xs text-muted">
            Editing <span className="font-mono text-text">{edit.column}</span>
          </span>
          {error && (
            <span className="flex items-center gap-1.5 truncate text-xs text-danger" title={error}>
              <AlertTriangle size={13} />
              <span className="max-w-[360px] truncate">{error}</span>
            </span>
          )}
          <div className="flex-1" />
          <Button variant="secondary" size="sm" onClick={cancel} disabled={saving}>
            <X size={13} />
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={apply} disabled={saving}>
            {saving ? <Spinner size={13} className="text-white" /> : <Check size={13} />}
            Apply changes
          </Button>
        </div>
      )}
    </div>
  )
}

interface CellEditorProps {
  meta: ColumnMeta | undefined
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
}

function CellEditor({
  meta,
  value,
  onChange,
  onCommit,
  onCancel
}: CellEditorProps): React.JSX.Element {
  const kind = inputKind(meta)
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onCommit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const className =
    'h-full w-full bg-transparent px-3 py-1.5 font-mono text-xs text-text focus:outline-none'

  if (kind === 'enum' || kind === 'boolean') {
    const options = kind === 'boolean' ? ['true', 'false'] : (meta?.enumValues ?? [])
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className={cn(className, 'appearance-none')}
      >
        {meta?.nullable && <option value="">(null)</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      autoFocus
      type={kind === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={(e) => e.target.select()}
      className={className}
    />
  )
}

function RowMenuItem({
  children,
  icon,
  onSelect,
  disabled,
  danger
}: {
  children: React.ReactNode
  icon: React.ReactNode
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}): React.JSX.Element {
  return (
    <ContextMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        danger
          ? 'text-danger data-[highlighted]:bg-danger/15'
          : 'data-[highlighted]:bg-accent-soft data-[highlighted]:text-text'
      )}
    >
      <span className="text-faint">{icon}</span>
      {children}
    </ContextMenu.Item>
  )
}
