import type { ColumnMeta } from '@shared/types'

export type InputKind = 'text' | 'number' | 'boolean' | 'enum'

/** Decide which editor control fits a column's type. */
export function inputKind(meta: ColumnMeta | undefined): InputKind {
  if (!meta) return 'text'
  if (meta.enumValues && meta.enumValues.length > 0) return 'enum'
  if (/^bool/.test(meta.dataType)) return 'boolean'
  if (/(int|numeric|decimal|real|double|float|serial|money)/.test(meta.dataType)) return 'number'
  return 'text'
}

/** Convert a string draft from an input into the typed value to persist. */
export function toTypedValue(meta: ColumnMeta | undefined, draft: string): unknown {
  const kind = inputKind(meta)
  if (kind === 'number') return draft === '' ? null : Number(draft)
  if (kind === 'boolean') return draft === '' ? null : draft === 'true'
  if (kind === 'enum') return draft === '' ? null : draft
  return draft
}
