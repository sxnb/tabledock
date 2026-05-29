// Types shared across the main process, preload, and renderer.

export type DriverKind = 'mysql' | 'postgres' | 'redis' | 'sqlite'

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

export interface GetRowsOptions {
  page: number
  pageSize: number
  database?: string
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
    openFile(): Promise<string | null>
  }
}
