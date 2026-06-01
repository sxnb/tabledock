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

/**
 * Build a CREATE TABLE statement for the given (already-qualified) table name,
 * column specs, and optional primary-key column list.
 */
export function createTableSql(
  qualifiedTable: string,
  columns: NewColumnSpec[],
  primaryKey: string[],
  quoteIdent: (name: string) => string
): string {
  const lines = columns.map((c) => `  ${columnDdl(c, quoteIdent)}`)
  if (primaryKey.length > 0) {
    lines.push(`  PRIMARY KEY (${primaryKey.map(quoteIdent).join(', ')})`)
  }
  return `CREATE TABLE ${qualifiedTable} (\n${lines.join(',\n')}\n)`
}
