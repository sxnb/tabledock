import mysql from 'mysql2/promise'
import { buildTls } from '../ssl'
import { buildFilter } from '../filter'
import { buildInserts } from '../sqlformat'
import type {
  ColumnMeta,
  ConnectionConfig,
  DeleteRowParams,
  InsertRowParams,
  GetRowsOptions,
  QueryResult,
  RelationalDriver,
  RowsResult,
  SchemaColumn,
  SchemaGraph,
  SchemaRelation,
  SchemaTable,
  TableMeta,
  UpdateRowParams,
  UpdateRowResult,
  DumpOptions
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
    const tls = buildTls(this.config)
    this.pool = mysql.createPool({
      host: this.config.host || '127.0.0.1',
      port: this.config.port || 3306,
      user: this.config.user || 'root',
      password: this.config.password || undefined,
      database: this.config.database || undefined,
      connectionLimit: 4,
      waitForConnections: true,
      multipleStatements: false,
      ...(tls ? { ssl: tls } : {})
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
    const { page, pageSize, database, sort, filter } = opts
    const offset = (page - 1) * pageSize
    const qualified = database ? `${quoteIdent(database)}.${quoteIdent(table)}` : quoteIdent(table)
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`
      : ''
    const where = filter ? buildFilter(filter, quoteIdent, () => '?') : null
    const whereClause = where ? ` WHERE ${where.clause}` : ''
    const whereParams = where ? where.params : []

    const [countRows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM ${qualified}${whereClause}`,
      whereParams
    )
    const total = Number(countRows[0]?.total ?? 0)

    const [rows, fields] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT * FROM ${qualified}${whereClause}${orderBy} LIMIT ? OFFSET ?`,
      [...whereParams, pageSize, offset]
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

  async getTableMeta(table: string, database?: string): Promise<TableMeta> {
    const target = database || this.config.database
    if (!target) throw new Error('No database selected')
    const [rows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT column_name, data_type, column_type, is_nullable, column_key
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?
       ORDER BY ordinal_position`,
      [target, table]
    )
    const columns: ColumnMeta[] = rows.map((r) => {
      const name = String(r.column_name ?? r.COLUMN_NAME)
      const dataType = String(r.data_type ?? r.DATA_TYPE).toLowerCase()
      const columnType = String(r.column_type ?? r.COLUMN_TYPE)
      const key = String(r.column_key ?? r.COLUMN_KEY)
      const nullable = String(r.is_nullable ?? r.IS_NULLABLE).toUpperCase() === 'YES'
      const meta: ColumnMeta = { name, dataType, nullable, isPrimaryKey: key === 'PRI' }
      if (dataType === 'enum') meta.enumValues = parseEnumValues(columnType)
      return meta
    })
    return { columns, primaryKeys: columns.filter((c) => c.isPrimaryKey).map((c) => c.name) }
  }

  async updateRow(table: string, params: UpdateRowParams): Promise<UpdateRowResult> {
    const { database, pk, changes } = params
    const changeCols = Object.keys(changes)
    const pkCols = Object.keys(pk)
    if (changeCols.length === 0) return { affectedRows: 0 }
    if (pkCols.length === 0) throw new Error('Cannot update a row without a primary key')

    const qualified = database ? `${quoteIdent(database)}.${quoteIdent(table)}` : quoteIdent(table)
    const setClause = changeCols.map((c) => `${quoteIdent(c)} = ?`).join(', ')
    const whereClause = pkCols.map((c) => `${quoteIdent(c)} = ?`).join(' AND ')
    const values = [...changeCols.map((c) => changes[c]), ...pkCols.map((c) => pk[c])]

    const [result] = await this.db.query<mysql.ResultSetHeader>(
      `UPDATE ${qualified} SET ${setClause} WHERE ${whereClause} LIMIT 1`,
      values
    )
    return { affectedRows: result.affectedRows }
  }

  async deleteRow(table: string, params: DeleteRowParams): Promise<UpdateRowResult> {
    const { database, pk } = params
    const pkCols = Object.keys(pk)
    if (pkCols.length === 0) throw new Error('Cannot delete a row without a primary key')

    const qualified = database ? `${quoteIdent(database)}.${quoteIdent(table)}` : quoteIdent(table)
    const whereClause = pkCols.map((c) => `${quoteIdent(c)} = ?`).join(' AND ')
    const [result] = await this.db.query<mysql.ResultSetHeader>(
      `DELETE FROM ${qualified} WHERE ${whereClause} LIMIT 1`,
      pkCols.map((c) => pk[c])
    )
    return { affectedRows: result.affectedRows }
  }

  async insertRow(table: string, params: InsertRowParams): Promise<UpdateRowResult> {
    const { database, values } = params
    const cols = Object.keys(values)
    if (cols.length === 0) throw new Error('No values to insert')

    const qualified = database ? `${quoteIdent(database)}.${quoteIdent(table)}` : quoteIdent(table)
    const colList = cols.map(quoteIdent).join(', ')
    const placeholders = cols.map(() => '?').join(', ')
    const [result] = await this.db.query<mysql.ResultSetHeader>(
      `INSERT INTO ${qualified} (${colList}) VALUES (${placeholders})`,
      cols.map((c) => values[c])
    )
    return { affectedRows: result.affectedRows }
  }

  async runScript(sql: string, database?: string): Promise<void> {
    // A dedicated connection with multi-statement support (the pool disables it).
    const tls = buildTls(this.config)
    const conn = await mysql.createConnection({
      host: this.config.host || '127.0.0.1',
      port: this.config.port || 3306,
      user: this.config.user || 'root',
      password: this.config.password || undefined,
      database: database || this.config.database || undefined,
      multipleStatements: true,
      ...(tls ? { ssl: tls } : {})
    })
    try {
      await conn.query(sql)
    } finally {
      await conn.end()
    }
  }

  async dumpDatabase(database?: string, options?: DumpOptions): Promise<string> {
    const target = database || this.config.database
    if (!target) throw new Error('No database selected')
    const tables = await this.listTables(target)
    const parts: string[] = [`-- DataDock dump of \`${target}\` — ${new Date().toISOString()}\n`]
    if (options?.includeCreateDatabase) {
      parts.push(`CREATE DATABASE IF NOT EXISTS ${quoteIdent(target)};`)
      parts.push(`USE ${quoteIdent(target)};\n`)
    }
    for (const t of tables) {
      const qualified = `${quoteIdent(target)}.${quoteIdent(t)}`
      const [createRows] = await this.db.query<mysql.RowDataPacket[]>(
        `SHOW CREATE TABLE ${qualified}`
      )
      const ddl = String(createRows[0]?.['Create Table'] ?? '')
      parts.push(`DROP TABLE IF EXISTS ${quoteIdent(t)};`)
      if (ddl) parts.push(`${ddl};`)
      const [rows, fields] = await this.db.query<mysql.RowDataPacket[]>(
        `SELECT * FROM ${qualified}`
      )
      const columns = fields.map((f) => f.name)
      const data = rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c]))
      const inserts = buildInserts(quoteIdent(t), columns, data, quoteIdent)
      if (inserts) parts.push(inserts)
      parts.push('')
    }
    return parts.join('\n')
  }

  async getSchemaGraph(database?: string): Promise<SchemaGraph> {
    const target = database || this.config.database
    if (!target) throw new Error('No database selected')

    const [colRows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT table_name, column_name, data_type, column_key, ordinal_position
       FROM information_schema.columns
       WHERE table_schema = ?
       ORDER BY table_name, ordinal_position`,
      [target]
    )
    const [fkRows] = await this.db.query<mysql.RowDataPacket[]>(
      `SELECT table_name, column_name, referenced_table_name, referenced_column_name
       FROM information_schema.key_column_usage
       WHERE table_schema = ? AND referenced_table_name IS NOT NULL`,
      [target]
    )

    const relations: SchemaRelation[] = fkRows.map((r, i) => ({
      id: `fk-${i}`,
      sourceTable: String(r.table_name ?? r.TABLE_NAME),
      sourceColumn: String(r.column_name ?? r.COLUMN_NAME),
      targetTable: String(r.referenced_table_name ?? r.REFERENCED_TABLE_NAME),
      targetColumn: String(r.referenced_column_name ?? r.REFERENCED_COLUMN_NAME)
    }))
    const fkCols = new Set(relations.map((r) => `${r.sourceTable}.${r.sourceColumn}`))

    const byTable = new Map<string, SchemaColumn[]>()
    for (const r of colRows) {
      const table = String(r.table_name ?? r.TABLE_NAME)
      const name = String(r.column_name ?? r.COLUMN_NAME)
      const list = byTable.get(table) ?? []
      list.push({
        name,
        dataType: String(r.data_type ?? r.DATA_TYPE).toLowerCase(),
        isPrimaryKey: String(r.column_key ?? r.COLUMN_KEY) === 'PRI',
        isForeignKey: fkCols.has(`${table}.${name}`)
      })
      byTable.set(table, list)
    }
    const tables: SchemaTable[] = [...byTable.entries()].map(([name, columns]) => ({
      name,
      columns
    }))
    return { tables, relations }
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

/** Parse a MySQL `enum('a','b','c')` column type into its allowed values. */
function parseEnumValues(columnType: string): string[] {
  const inner = columnType.replace(/^enum\(/i, '').replace(/\)$/, '')
  const matches = inner.match(/'((?:[^']|'')*)'/g) ?? []
  return matches.map((m) => m.slice(1, -1).replace(/''/g, "'"))
}

/** mysql2 returns Buffers/Dates that don't serialize cleanly over IPC. */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  return value
}
