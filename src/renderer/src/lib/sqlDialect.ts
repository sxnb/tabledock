import type { DriverKind } from '@shared/types'
import type { SqlLanguage } from 'sql-formatter'

/** Map a driver kind to a sql-formatter dialect. */
export function formatterLanguage(kind: DriverKind): SqlLanguage {
  switch (kind) {
    case 'mysql':
      return 'mysql'
    case 'mariadb':
      return 'mariadb'
    case 'postgres':
      return 'postgresql'
    case 'mssql':
      return 'tsql'
    case 'sqlite':
      return 'sqlite'
    default:
      return 'sql'
  }
}

/**
 * Prefix that turns a query into its plan, or null when the dialect has no
 * simple statement-level EXPLAIN (SQL Server uses session SET options instead).
 */
export function explainPrefix(kind: DriverKind): string | null {
  switch (kind) {
    case 'sqlite':
      return 'EXPLAIN QUERY PLAN '
    case 'mysql':
    case 'mariadb':
    case 'postgres':
      return 'EXPLAIN '
    default:
      return null
  }
}
