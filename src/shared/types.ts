// Types shared across the main process, preload, and renderer.

export type DriverKind = 'mysql' | 'postgres' | 'redis' | 'sqlite'

/** TLS/SSL settings; cert fields hold absolute paths to PEM files. */
export interface SslConfig {
  enabled: boolean
  ca?: string
  cert?: string
  key?: string
}

export type SshAuthMethod = 'password' | 'key' | 'agent'

/** SSH tunnel settings. The DB is reached through this SSH server. */
export interface SshConfig {
  enabled: boolean
  host?: string
  port?: number
  user?: string
  /** Authentication method; defaults to 'password'. */
  authMethod?: SshAuthMethod
  /** SSH password (secret; encrypted at rest). Used by 'password'. */
  password?: string
  /** Absolute path to a private key file. Used by 'key'. */
  privateKey?: string
  /** Passphrase for the private key (secret; encrypted at rest). Used by 'key'. */
  passphrase?: string
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
  // SSH tunnel (MySQL, PostgreSQL, Redis)
  ssh?: SshConfig
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

export interface DeleteRowParams {
  database?: string
  /** Primary-key column → value, used to locate the row to delete. */
  pk: Record<string, unknown>
}

export interface InsertRowParams {
  database?: string
  /** Column → value for the columns to insert; omitted columns use DB defaults. */
  values: Record<string, unknown>
}

/** A single executed-query record in a connection's history. */
export interface QueryHistoryEntry {
  id: string
  sql: string
  /** Epoch milliseconds. */
  executedAt: number
  /** Whether the execution succeeded. */
  ok: boolean
}

export interface SidebarSettings {
  /** Base background color (hex). Null uses the default surface. */
  color: string | null
  /** Noise overlay strength, 0..1. */
  noise: number
}

export type ThemeMode = 'light' | 'dark' | 'system'

/** Persisted, app-wide user settings. */
export interface AppSettings {
  sidebar: SidebarSettings
  /** Color theme; 'system' follows the OS preference. */
  themeMode: ThemeMode
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
    deleteRow(sessionId: string, table: string, params: DeleteRowParams): Promise<UpdateRowResult>
    insertRow(sessionId: string, table: string, params: InsertRowParams): Promise<UpdateRowResult>
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
  history: {
    list(connectionId: string): Promise<QueryHistoryEntry[]>
    add(connectionId: string, entry: { sql: string; ok: boolean }): Promise<void>
    clear(connectionId: string): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    set(settings: AppSettings): Promise<void>
  }
  haptics: {
    /** Trigger a trackpad "level change" haptic (macOS only; no-op elsewhere). */
    tap(): void
  }
}

export interface OpenFileOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  /** Allow choosing/creating a not-yet-existing file (used for SQLite). */
  allowCreate?: boolean
}
