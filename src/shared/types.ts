// Types shared across the main process, preload, and renderer.

export type DriverKind = 'mysql' | 'postgres' | 'redis' | 'sqlite'

/** TLS/SSL settings; cert fields hold absolute paths to PEM files. */
export interface SslConfig {
  enabled: boolean
  ca?: string
  cert?: string
  key?: string
}

export interface ConnectionConfig {
  id: string
  name: string
  kind: DriverKind
  // Relational + Redis network options
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  // SQLite
  filePath?: string
  // Redis db index
  redisDb?: number
  // TLS/SSL (MySQL, PostgreSQL, Redis)
  ssl?: SslConfig
  /** Optional accent color (hex) used to visually tag the connection. */
  color?: string
}

export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  /** For non-SELECT statements (INSERT/UPDATE/DELETE/DDL). */
  affectedRows?: number
}

export interface RowsResult extends QueryResult {
  total: number
  page: number
  pageSize: number
}

export type SortDirection = 'asc' | 'desc'

export interface SortSpec {
  column: string
  direction: SortDirection
}

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'like'
  | 'isNull'
  | 'isNotNull'

export interface FilterSpec {
  column: string
  operator: FilterOperator
  value: string
}

export interface GetRowsOptions {
  page: number
  pageSize: number
  database?: string
  /** Server-side ORDER BY applied to the page query. */
  sort?: SortSpec
  /** Server-side WHERE filter applied to both the page and count queries. */
  filter?: FilterSpec
}

export interface ColumnMeta {
  name: string
  /** Normalized data type, e.g. 'int', 'varchar', 'enum', 'boolean'. */
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
  /** Allowed values for enum-like columns (rendered as a dropdown). */
  enumValues?: string[]
}

export interface TableMeta {
  columns: ColumnMeta[]
  /** Primary-key column names; empty when the table has none. */
  primaryKeys: string[]
}

export interface UpdateRowParams {
  database?: string
  /** Original primary-key column → value, used to locate the row. */
  pk: Record<string, unknown>
  /** Column → new value to assign. */
  changes: Record<string, unknown>
}

export interface UpdateRowResult {
  affectedRows: number
}

/** A column as shown in the relation diagram. */
export interface SchemaColumn {
  name: string
  dataType: string
  isPrimaryKey: boolean
  isForeignKey: boolean
}

export interface SchemaTable {
  name: string
  columns: SchemaColumn[]
}

/** A single foreign-key edge (one column pair). */
export interface SchemaRelation {
  id: string
  sourceTable: string
  sourceColumn: string
  targetTable: string
  targetColumn: string
}

/** The full table/foreign-key graph for a database, used by the relation view. */
export interface SchemaGraph {
  tables: SchemaTable[]
  relations: SchemaRelation[]
}

export interface RedisKeyInfo {
  key: string
  type: string
}

export interface RedisScanResult {
  cursor: string
  keys: RedisKeyInfo[]
}

export interface RedisValue {
  type: string
  value: unknown
}

/** Envelope returned across IPC so the renderer can handle errors uniformly. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** The shape exposed on `window.api` by the preload bridge. */
export interface DataDockApi {
  store: {
    list(): Promise<ConnectionConfig[]>
    save(config: ConnectionConfig): Promise<ConnectionConfig>
    delete(id: string): Promise<void>
  }
  db: {
    connect(config: ConnectionConfig): Promise<string>
    test(config: ConnectionConfig): Promise<void>
    disconnect(sessionId: string): Promise<void>
    databases(sessionId: string): Promise<string[]>
    tables(sessionId: string, database?: string): Promise<string[]>
    rows(sessionId: string, table: string, opts: GetRowsOptions): Promise<RowsResult>
    tableMeta(sessionId: string, table: string, database?: string): Promise<TableMeta>
    update(sessionId: string, table: string, params: UpdateRowParams): Promise<UpdateRowResult>
    schemaGraph(sessionId: string, database?: string): Promise<SchemaGraph>
    query(sessionId: string, sql: string, database?: string): Promise<QueryResult>
  }
  redis: {
    select(sessionId: string, index: number): Promise<void>
    keys(
      sessionId: string,
      opts: { pattern: string; cursor: string; count: number }
    ): Promise<RedisScanResult>
    get(sessionId: string, key: string): Promise<RedisValue>
    command(sessionId: string, args: string[]): Promise<unknown>
  }
  dialog: {
    openFile(options?: OpenFileOptions): Promise<string | null>
  }
}

export interface OpenFileOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  /** Allow choosing/creating a not-yet-existing file (used for SQLite). */
  allowCreate?: boolean
}
