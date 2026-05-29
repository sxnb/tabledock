import pg from 'pg'
import type {
  ConnectionConfig,
  GetRowsOptions,
  QueryResult,
  RelationalDriver,
  RowsResult
} from '../types'

// Return numeric/bigint types as-is where safe; pg parses int8 as string by default.
const SYSTEM_DATABASES = new Set(['template0', 'template1'])

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

/**
 * Postgres connects to a single database per client. To browse a different
 * database we open a fresh client pointed at it. We keep one pool for the
 * currently active database and recreate it when the target changes.
 */
export class PostgresDriver implements RelationalDriver {
  readonly kind = 'postgres' as const
  private pool: pg.Pool | null = null
  private currentDatabase: string

  constructor(private readonly config: ConnectionConfig) {
    this.currentDatabase = config.database || 'postgres'
  }

  async connect(): Promise<void> {
    await this.poolFor(this.currentDatabase)
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }

  private async poolFor(database: string): Promise<pg.Pool> {
    if (this.pool && this.currentDatabase === database) return this.pool
    if (this.pool) await this.pool.end()
    this.currentDatabase = database
    this.pool = new pg.Pool({
      host: this.config.host || '127.0.0.1',
      port: this.config.port || 5432,
      user: this.config.user || 'postgres',
      password: this.config.password || undefined,
      database,
      max: 4
    })
    // Validate eagerly.
    const client = await this.pool.connect()
    client.release()
    return this.pool
  }

  async listDatabases(): Promise<string[]> {
    const pool = await this.poolFor(this.currentDatabase)
    const res = await pool.query<{ datname: string }>(
      'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
    )
    return res.rows.map((r) => r.datname).filter((d) => !SYSTEM_DATABASES.has(d))
  }

  async listTables(database?: string): Promise<string[]> {
    const pool = await this.poolFor(database || this.currentDatabase)
    const res = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )
    return res.rows.map((r) => r.table_name)
  }

  async getRows(table: string, opts: GetRowsOptions): Promise<RowsResult> {
    const { page, pageSize, database } = opts
    const offset = (page - 1) * pageSize
    const pool = await this.poolFor(database || this.currentDatabase)
    const qualified = `${quoteIdent('public')}.${quoteIdent(table)}`

    const countRes = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM ${qualified}`
    )
    const total = Number(countRes.rows[0]?.total ?? 0)

    const res = await pool.query(`SELECT * FROM ${qualified} LIMIT $1 OFFSET $2`, [
      pageSize,
      offset
    ])
    const columns = res.fields.map((f) => f.name)
    return {
      columns,
      rows: res.rows.map((r: Record<string, unknown>) => columns.map((c) => normalize(r[c]))),
      rowCount: res.rows.length,
      total,
      page,
      pageSize
    }
  }

  async runQuery(sql: string, database?: string): Promise<QueryResult> {
    const pool = await this.poolFor(database || this.currentDatabase)
    const res = await pool.query(sql)
    const columns = res.fields?.map((f) => f.name) ?? []
    if (columns.length > 0) {
      return {
        columns,
        rows: res.rows.map((r: Record<string, unknown>) => columns.map((c) => normalize(r[c]))),
        rowCount: res.rows.length
      }
    }
    return { columns: [], rows: [], rowCount: 0, affectedRows: res.rowCount ?? 0 }
  }
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return value
}
