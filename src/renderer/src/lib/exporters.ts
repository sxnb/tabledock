function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serialize a result grid to CSV (header row + data). */
export function toCsv(columns: string[], rows: unknown[][]): string {
  const header = columns.map(csvCell).join(',')
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\n')
  return body ? `${header}\n${body}\n` : `${header}\n`
}

/** Serialize a result grid to a pretty JSON array of row objects. */
export function toJson(columns: string[], rows: unknown[][]): string {
  const objects = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])))
  return JSON.stringify(objects, null, 2)
}
