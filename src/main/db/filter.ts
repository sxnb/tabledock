import type { FilterSpec } from '../../shared/types'

/** Returns the next bind placeholder ('?' for MySQL/SQLite, '$n' for Postgres). */
export type Placeholder = () => string

const COMPARISON: Partial<Record<FilterSpec['operator'], string>> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<='
}

/**
 * Build a parameterized WHERE clause for a single-column filter. The column is
 * quoted as an identifier; the value is always bound, never interpolated, so
 * this is injection-safe. Returns the clause and its bind params (empty for the
 * null checks).
 */
export function buildFilter(
  filter: FilterSpec,
  quoteIdent: (name: string) => string,
  ph: Placeholder
): { clause: string; params: unknown[] } {
  const col = quoteIdent(filter.column)
  switch (filter.operator) {
    case 'isNull':
      return { clause: `${col} IS NULL`, params: [] }
    case 'isNotNull':
      return { clause: `${col} IS NOT NULL`, params: [] }
    case 'contains':
      return { clause: `${col} LIKE ${ph()}`, params: [`%${filter.value}%`] }
    case 'startsWith':
      return { clause: `${col} LIKE ${ph()}`, params: [`${filter.value}%`] }
    case 'like':
      return { clause: `${col} LIKE ${ph()}`, params: [filter.value] }
    default: {
      const op = COMPARISON[filter.operator]
      if (!op) throw new Error(`Unsupported filter operator: ${filter.operator}`)
      return { clause: `${col} ${op} ${ph()}`, params: [filter.value] }
    }
  }
}
