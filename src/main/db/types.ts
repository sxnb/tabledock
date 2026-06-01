import type {
  DriverKind,
  GetRowsOptions,
  QueryResult,
  RedisScanResult,
  RedisValue,
  RedisValuePage,
  MongoCollectionStats,
  MongoFindOptions,
  MongoFindResult,
  MongoIndexInfo,
  RowsResult,
  NewColumnSpec,
  SchemaGraph,
  TableMeta,
  TableStructure,
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
  getTableStructure(table: string, database?: string): Promise<TableStructure>
  addColumn(table: string, column: NewColumnSpec, database?: string): Promise<void>
  dropColumn(table: string, column: string, database?: string): Promise<void>
  renameTable(table: string, newName: string, database?: string): Promise<void>
  dropTable(table: string, database?: string): Promise<void>
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
  pageKey(key: string, cursor: string, count: number): Promise<RedisValuePage>
  runCommand(args: string[]): Promise<unknown>
  dbSize(): Promise<number>
  deleteKey(key: string): Promise<void>
  renameKey(key: string, newKey: string): Promise<void>
  setKeyTtl(key: string, seconds: number | null): Promise<void>
  /** Export the current database's keyspace as Redis commands. */
  dumpKeyspace(): Promise<string>
}

/** MongoDB driver — document-oriented. Documents are passed as Extended JSON. */
export interface MongoDriverApi {
  readonly kind: 'mongodb'
  connect(): Promise<void>
  disconnect(): Promise<void>
  listDatabases(): Promise<string[]>
  listCollections(database: string): Promise<string[]>
  find(database: string, collection: string, opts: MongoFindOptions): Promise<MongoFindResult>
  aggregate(database: string, collection: string, pipeline: string): Promise<MongoFindResult>
  listIndexes(database: string, collection: string): Promise<MongoIndexInfo[]>
  createIndex(
    database: string,
    collection: string,
    keysJson: string,
    options: { unique?: boolean; name?: string }
  ): Promise<void>
  dropIndex(database: string, collection: string, name: string): Promise<void>
  collectionStats(database: string, collection: string): Promise<MongoCollectionStats>
  insertDocument(database: string, collection: string, json: string): Promise<void>
  updateDocument(database: string, collection: string, id: string, json: string): Promise<void>
  deleteDocument(database: string, collection: string, id: string): Promise<void>
  /** Export all collections as an Extended-JSON document. */
  dumpJson(database: string): Promise<string>
}

export type AnyDriver = RelationalDriver | RedisDriverApi | MongoDriverApi

export function isRedisDriver(d: AnyDriver): d is RedisDriverApi {
  return d.kind === 'redis'
}

export function isMongoDriver(d: AnyDriver): d is MongoDriverApi {
  return d.kind === 'mongodb'
}

export function isRelationalDriver(d: AnyDriver): d is RelationalDriver {
  return d.kind !== 'redis' && d.kind !== 'mongodb'
}
