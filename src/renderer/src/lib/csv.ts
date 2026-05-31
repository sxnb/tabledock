/** Parsed tabular file: header column names + rows of string cells. */
export interface ParsedTable {
  columns: string[]
  rows: string[][]
}

/**
 * Parse CSV text (RFC-4180-ish): handles quoted fields, escaped quotes (""),
 * and CRLF/LF line endings. The first row is treated as the header.
 */
export function parseCsv(text: string): ParsedTable {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let i = 0
  const n = text.length

  const endField = (): void => {
    record.push(field)
    field = ''
  }
  const endRecord = (): void => {
    endField()
    records.push(record)
    record = []
  }

  while (i < n) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
    } else if (c === ',') {
      endField()
      i++
    } else if (c === '\r') {
      i++
    } else if (c === '\n') {
      endRecord()
      i++
    } else {
      field += c
      i++
    }
  }
  // Flush a trailing field/record if the file doesn't end with a newline.
  if (field !== '' || record.length > 0) endRecord()

  // Drop a trailing empty record (file ended with a newline).
  while (records.length > 0 && records[records.length - 1].every((c) => c === '')) records.pop()

  if (records.length === 0) return { columns: [], rows: [] }
  const [columns, ...rows] = records
  return { columns, rows }
}

/**
 * Parse a JSON array of objects into the same tabular shape. Columns are the
 * union of all object keys (in first-seen order); values are stringified.
 */
export function parseJsonRows(text: string): ParsedTable {
  const data = JSON.parse(text)
  if (!Array.isArray(data)) throw new Error('JSON must be an array of objects')
  const columns: string[] = []
  const seen = new Set<string>()
  for (const item of data) {
    if (item && typeof item === 'object') {
      for (const key of Object.keys(item)) {
        if (!seen.has(key)) {
          seen.add(key)
          columns.push(key)
        }
      }
    }
  }
  const rows = data.map((item: Record<string, unknown>) =>
    columns.map((c) => {
      const v = item?.[c]
      if (v == null) return ''
      return typeof v === 'object' ? JSON.stringify(v) : String(v)
    })
  )
  return { columns, rows }
}
