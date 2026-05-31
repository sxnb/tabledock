/** Format a raw DB value as a SQL literal for dumps. */
export function sqlLiteral(value: unknown): string {
  if (value == null) return 'NULL'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return `'${value.toISOString()}'`
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  return `'${String(value).replace(/'/g, "''")}'`
}

/** Build INSERT statements for a set of rows aligned with `columns`. */
export function buildInserts(
  qualifiedTable: string,
  columns: string[],
  rows: unknown[][],
  quoteIdent: (name: string) => string
): string {
  if (rows.length === 0) return ''
  const colList = columns.map(quoteIdent).join(', ')
  return (
    rows
      .map(
        (r) =>
          `INSERT INTO ${qualifiedTable} (${colList}) VALUES (${r.map(sqlLiteral).join(', ')});`
      )
      .join('\n') + '\n'
  )
}
