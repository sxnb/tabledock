import type {
  DriverKind,
  GetRowsOptions,
  QueryResult,
  RedisScanResult,
  RedisValue,
  RowsResult,
  TableMeta,
  UpdateRowParams,
  UpdateRowResult
} from '../../shared/types'

export * from '../../shared/types'

/** Relational drivers: MySQL, PostgreSQL, SQLite. */
export interface RelationalDriver {
  readonly kind: DriverKind
  connect(): Promise<void>
  disconnect(): Promise<void>
  listDatabases(): Promise<string[]>
  listTables(database?: string): Promise<string[]>
  getRows(table: string, opts: GetRowsOptions): Promise<RowsResult>
  getTableMeta(table: string, database?: string): Promise<TableMeta>
  updateRow(table: string, params: UpdateRowParams): Promise<UpdateRowResult>
  runQuery(sql: string, database?: string): Promise<QueryResult>
}

/** Redis driver — non-relational, key/value oriented. */
export interface RedisDriverApi {
  readonly kind: 'redis'
  connect(): Promise<void>
  disconnect(): Promise<void>
  selectDb(index: number): Promise<void>
  listKeys(opts: { pattern: string; cursor: string; count: number }): Promise<RedisScanResult>
  getKey(key: string): Promise<RedisValue>
  runCommand(args: string[]): Promise<unknown>
}

export type AnyDriver = RelationalDriver | RedisDriverApi

export function isRedisDriver(d: AnyDriver): d is RedisDriverApi {
  return d.kind === 'redis'
}

export function isRelationalDriver(d: AnyDriver): d is RelationalDriver {
  return d.kind !== 'redis'
}
