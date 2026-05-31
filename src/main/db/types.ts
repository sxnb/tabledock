import type {
  DriverKind,
  GetRowsOptions,
  QueryResult,
  RedisScanResult,
  RedisValue,
  RowsResult,
  SchemaGraph,
  TableMeta,
  UpdateRowParams,
  UpdateRowResult,
  DeleteRowParams,
  InsertRowParams,
  DumpOptions
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
  deleteRow(table: string, params: DeleteRowParams): Promise<UpdateRowResult>
  insertRow(table: string, params: InsertRowParams): Promise<UpdateRowResult>
  getSchemaGraph(database?: string): Promise<SchemaGraph>
  runQuery(sql: string, database?: string): Promise<QueryResult>
  /** Execute a multi-statement SQL script (used by SQL import). */
  runScript(sql: string, database?: string): Promise<void>
  /** Produce a SQL dump (schema where available + data) for the database. */
  dumpDatabase(database?: string, options?: DumpOptions): Promise<string>
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
  /** Export the current database's keyspace as Redis commands. */
  dumpKeyspace(): Promise<string>
}

export type AnyDriver = RelationalDriver | RedisDriverApi

export function isRedisDriver(d: AnyDriver): d is RedisDriverApi {
  return d.kind === 'redis'
}

export function isRelationalDriver(d: AnyDriver): d is RelationalDriver {
  return d.kind !== 'redis'
}
