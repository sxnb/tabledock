import type { NewColumnSpec } from '../../shared/types'

/**
 * Build the column definition fragment used by ADD COLUMN across dialects:
 * `<name> <type> [NOT NULL] [DEFAULT <expr>]`. The default is emitted verbatim,
 * so callers are responsible for quoting literal values.
 */
export function columnDdl(column: NewColumnSpec, quoteIdent: (name: string) => string): string {
  let s = `${quoteIdent(column.name)} ${column.type}`
  if (!column.nullable) s += ' NOT NULL'
  if (column.default != null && column.default !== '') s += ` DEFAULT ${column.default}`
  return s
}
