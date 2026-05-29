import Database from 'better-sqlite3'
import { basename } from 'path'
import type {
  ColumnMeta,
  ConnectionConfig,
  GetRowsOptions,
  QueryResult,
  RelationalDriver,
  RowsResult,
  TableMeta,
  UpdateRowParams,
  UpdateRowResult
} from '../types'

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

/** SQLite is a single file — there is no concept of multiple databases. */
export class SqliteDriver implements RelationalDriver {
  readonly kind = 'sqlite' as const
  private db: Database.Database | null = null

  constructor(private readonly config: ConnectionConfig) {}

  async connect(): Promise<void> {
    if (!this.config.filePath) throw new Error('No SQLite file path configured')
    this.db = new Database(this.config.filePath)
    this.db.pragma('journal_mode = WAL')
  }

  async disconnect(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  private get handle(): Database.Database {
    if (!this.db) throw new Error('Not connected')
    return this.db
  }

  async listDatabases(): Promise<string[]> {
    return [basename(this.config.filePath || 'database')]
  }

  async listTables(): Promise<string[]> {
    const rows = this.handle
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      )
      .all() as { name: string }[]
    return rows.map((r) => r.name)
  }

  async getRows(table: string, opts: GetRowsOptions): Promise<RowsResult> {
    const { page, pageSize } = opts
    const offset = (page - 1) * pageSize
    const qualified = quoteIdent(table)

    const countRow = this.handle.prepare(`SELECT COUNT(*) AS total FROM ${qualified}`).get() as {
      total: number
    }
    const total = Number(countRow?.total ?? 0)

    const stmt = this.handle.prepare(`SELECT * FROM ${qualified} LIMIT ? OFFSET ?`)
    const rows = stmt.all(pageSize, offset) as Record<string, unknown>[]
    const columns = stmt.columns().map((c) => c.name)
    return {
      columns,
      rows: rows.map((r) => columns.map((c) => normalize(r[c]))),
      rowCount: rows.length,
      total,
      page,
      pageSize
    }
  }

  async getTableMeta(table: string): Promise<TableMeta> {
    const info = this.handle.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as {
      name: string
      type: string
      notnull: number
      pk: number
    }[]
    const columns: ColumnMeta[] = info.map((c) => ({
      name: c.name,
      dataType: (c.type || '').toLowerCase(),
      nullable: c.notnull === 0,
      isPrimaryKey: c.pk > 0
    }))
    return { columns, primaryKeys: columns.filter((c) => c.isPrimaryKey).map((c) => c.name) }
  }

  async updateRow(table: string, params: UpdateRowParams): Promise<UpdateRowResult> {
    const { pk, changes } = params
    const changeCols = Object.keys(changes)
    const pkCols = Object.keys(pk)
    if (changeCols.length === 0) return { affectedRows: 0 }
    if (pkCols.length === 0) throw new Error('Cannot update a row without a primary key')

    const setClause = changeCols.map((c) => `${quoteIdent(c)} = ?`).join(', ')
    const whereClause = pkCols.map((c) => `${quoteIdent(c)} = ?`).join(' AND ')
    // SQLite has no boolean type and better-sqlite3 refuses to bind booleans.
    const bind = (v: unknown): unknown => (typeof v === 'boolean' ? (v ? 1 : 0) : v)
    const values = [...changeCols.map((c) => bind(changes[c])), ...pkCols.map((c) => bind(pk[c]))]

    const stmt = this.handle.prepare(
      `UPDATE ${quoteIdent(table)} SET ${setClause} WHERE ${whereClause}`
    )
    const info = stmt.run(...(values as never[]))
    return { affectedRows: info.changes }
  }

  async runQuery(sql: string): Promise<QueryResult> {
    const stmt = this.handle.prepare(sql)
    if (stmt.reader) {
      const rows = stmt.all() as Record<string, unknown>[]
      const columns = stmt.columns().map((c) => c.name)
      return {
        columns,
        rows: rows.map((r) => columns.map((c) => normalize(r[c]))),
        rowCount: rows.length
      }
    }
    const info = stmt.run()
    return { columns: [], rows: [], rowCount: 0, affectedRows: info.changes }
  }
}

function normalize(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return value.toString('base64')
  if (typeof value === 'bigint') return value.toString()
  return value
}
