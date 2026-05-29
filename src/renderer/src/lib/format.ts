/** Render a raw DB cell value into a display string and a style hint. */
export function formatCell(value: unknown): { text: string; kind: 'null' | 'value' } {
  if (value === null || value === undefined) return { text: 'NULL', kind: 'null' }
  if (typeof value === 'object') return { text: JSON.stringify(value), kind: 'value' }
  if (typeof value === 'boolean') return { text: value ? 'true' : 'false', kind: 'value' }
  return { text: String(value), kind: 'value' }
}
