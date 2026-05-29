import mysql from 'mysql2/promise'
import type {
  ConnectionConfig,
  GetRowsOptions,
  QueryResult,
  RelationalDriver,
  RowsResult
} from '../types'

const SYSTEM_DATABASES = new Set(['information_schema', 'mysql', 'performance_schema', 'sys'])

/** Wrap an identifier in backticks, escaping embedded backticks. */
function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

export class MySqlDriver implements RelationalDriver {
  readonly kind = 'mysql' as const
  private pool: mysql.Pool | null = null

  constructor(private readonly config: ConnectionConfig) {}

  async connect(): Promise<void> {
    this.pool = mysql.createPool({
      host: this.config.host || '127.0.0.1',
      port: this.config.port || 3306,
      user: this.config.user || 'root',
      password: this.config.password || undefined,
      database: this.config.database || undefined,
      connectionLimit: 4,
      waitForConnections: true,
      multipleStatements: false
    })
    // Validate credentials eagerly.
    const conn = await this.pool.getConnection()
    conn.release()
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }

  private get db(): mysql.Pool {
    if (!this.pool) throw new Error('Not connected')
    return this.pool
  }

  async listDatabases(): Promise<string[]> {
    const [rows] = await this.db.query<mysql.RowDataPacket[]>('SHOW DATABASES')
    return rows
      .map((r) => String(Object.values(r)[0]))
      .filter((name) => !SYSTEM_DATABASES.has(name))
  }

  async listTables(database?: string): Promise<string[]> {
    const target = database || this.config.database
    if (!target) return []
    const [rows] = await this.db.query<mysql.RowDataPacket[]>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
      [target]
    )
    return rows.map((r) => String(r.table_name ?? r.TABLE_NAME))
  }

  async getRows(table: string, opts: GetRowsOptions): Promise<RowsResult> {
    const { page, pageSize, database } = opts
    const offset = (page - 1) * pageSize
    const qualified = database ? `${quoteIdent(database)}.${quoteIdent(table)}` : quoteIdent(table)

    const [countRows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM ${qualified}`
    )
    const total = Number(countRows[0]?.total ?? 0)

    const [rows, fields] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT * FROM ${qualified} LIMIT ? OFFSET ?`,
      [pageSize, offset]
    )
    const columns = fields.map((f) => f.name)
    return {
      columns,
      rows: rows.map((r) => columns.map((c) => normalize(r[c]))),
      rowCount: rows.length,
      total,
      page,
      pageSize
    }
  }

  async runQuery(sql: string, database?: string): Promise<QueryResult> {
    const conn = await this.db.getConnection()
    try {
      if (database) await conn.query(`USE ${quoteIdent(database)}`)
      const [result, fields] = await conn.query(sql)
      if (Array.isArray(result)) {
        const rows = result as mysql.RowDataPacket[]
        const columns = (fields as mysql.FieldPacket[] | undefined)?.map((f) => f.name) ?? []
        return {
          columns,
          rows: rows.map((r) => columns.map((c) => normalize((r as Record<string, unknown>)[c]))),
          rowCount: rows.length
        }
      }
      const header = result as mysql.ResultSetHeader
      return { columns: [], rows: [], rowCount: 0, affectedRows: header.affectedRows }
    } finally {
      conn.release()
    }
  }
}

/** mysql2 returns Buffers/Dates that don't serialize cleanly over IPC. */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  return value
}
