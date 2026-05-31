/** Strip SQL comments (line and block) and string literals so keyword checks
 *  don't trip on text inside them. */
function stripNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/"(?:[^"\\]|\\.|"")*"/g, '""')
}

/**
 * Flag statements that could affect an entire table by accident:
 * UPDATE/DELETE without a WHERE clause, or TRUNCATE/DROP (always destructive).
 * Returns a human-readable reason, or null when nothing looks risky.
 */
export function destructiveWarning(sql: string): string | null {
  const cleaned = stripNoise(sql)
  for (const raw of cleaned.split(';')) {
    const stmt = raw.trim()
    if (!stmt) continue
    if (/^(update|delete)\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) {
      const verb = /^update/i.test(stmt) ? 'UPDATE' : 'DELETE'
      return `This ${verb} has no WHERE clause and will affect every row in the table.`
    }
    if (/^truncate\b/i.test(stmt)) return 'This TRUNCATE will remove all rows from the table.'
    if (/^drop\b/i.test(stmt)) return 'This DROP will permanently delete a database object.'
  }
  return null
}
