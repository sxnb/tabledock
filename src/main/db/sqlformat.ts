import { chunked } from './dump'

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

/**
 * Build INSERT statements for `rows` aligned with `columns`, yielded as chunks.
 *
 * `rows` is consumed lazily — pass a cursor or row stream so neither the table
 * nor the SQL text for it is ever held in memory in one piece.
 */
export function insertChunks(
  qualifiedTable: string,
  columns: string[],
  rows: AsyncIterable<unknown[]> | Iterable<unknown[]>,
  quoteIdent: (name: string) => string,
  /**
   * Dialect-specific value formatter; defaults to the portable `sqlLiteral`.
   * Receives the column's index so a driver can format by declared column type —
   * the JavaScript value alone is not always enough to tell types apart.
   */
  literal: (value: unknown, columnIndex: number) => string = sqlLiteral
): AsyncGenerator<string> {
  const colList = columns.map(quoteIdent).join(', ')
  async function* statements(): AsyncGenerator<string> {
    for await (const row of rows) {
      const values = row.map((value, i) => literal(value, i)).join(', ')
      yield `INSERT INTO ${qualifiedTable} (${colList}) VALUES (${values});\n`
    }
  }
  return chunked(statements())
}
