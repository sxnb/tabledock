import Database from 'better-sqlite3'
import { basename } from 'path'
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
    const { page, pageSize, sort, filter } = opts
    const offset = (page - 1) * pageSize
    const qualified = quoteIdent(table)
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`
      : ''
    const where = filter ? buildFilter(filter, quoteIdent, () => '?') : null
    const whereClause = where ? ` WHERE ${where.clause}` : ''
    const whereParams = where ? where.params : []

    const countRow = this.handle
      .prepare(`SELECT COUNT(*) AS total FROM ${qualified}${whereClause}`)
      .get(...(whereParams as never[])) as { total: number }
    const total = Number(countRow?.total ?? 0)

    const stmt = this.handle.prepare(
      `SELECT * FROM ${qualified}${whereClause}${orderBy} LIMIT ? OFFSET ?`
    )
    const rows = stmt.all(...([...whereParams, pageSize, offset] as never[])) as Record<
      string,
      unknown
    >[]
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

  async deleteRow(table: string, params: DeleteRowParams): Promise<UpdateRowResult> {
    const { pk } = params
    const pkCols = Object.keys(pk)
    if (pkCols.length === 0) throw new Error('Cannot delete a row without a primary key')

    const bind = (v: unknown): unknown => (typeof v === 'boolean' ? (v ? 1 : 0) : v)
    const whereClause = pkCols.map((c) => `${quoteIdent(c)} = ?`).join(' AND ')
    const stmt = this.handle.prepare(`DELETE FROM ${quoteIdent(table)} WHERE ${whereClause}`)
    const info = stmt.run(...(pkCols.map((c) => bind(pk[c])) as never[]))
    return { affectedRows: info.changes }
  }

  async insertRow(table: string, params: InsertRowParams): Promise<UpdateRowResult> {
    const { values } = params
    const cols = Object.keys(values)
    if (cols.length === 0) throw new Error('No values to insert')

    const bind = (v: unknown): unknown => (typeof v === 'boolean' ? (v ? 1 : 0) : v)
    const colList = cols.map(quoteIdent).join(', ')
    const placeholders = cols.map(() => '?').join(', ')
    const stmt = this.handle.prepare(
      `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`
    )
    const info = stmt.run(...(cols.map((c) => bind(values[c])) as never[]))
    return { affectedRows: info.changes }
  }

  async runScript(sql: string): Promise<void> {
    this.handle.exec(sql)
  }

  async dumpDatabase(): Promise<string> {
    const tables = this.handle
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      )
      .all() as { name: string; sql: string }[]
    const parts: string[] = [
      `-- DataDock dump of ${basename(this.config.filePath || 'database')} — ${new Date().toISOString()}\n`
    ]
    for (const { name, sql } of tables) {
      parts.push(`DROP TABLE IF EXISTS ${quoteIdent(name)};`)
      if (sql) parts.push(`${sql};`)
      const stmt = this.handle.prepare(`SELECT * FROM ${quoteIdent(name)}`)
      const cols = stmt.columns().map((c) => c.name)
      const rows = stmt.all() as Record<string, unknown>[]
      const data = rows.map((r) => cols.map((c) => r[c]))
      const inserts = buildInserts(quoteIdent(name), cols, data, quoteIdent)
      if (inserts) parts.push(inserts)
      parts.push('')
    }
    return parts.join('\n')
  }

  async getSchemaGraph(): Promise<SchemaGraph> {
    const tableNames = (
      this.handle
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`
        )
        .all() as { name: string }[]
    ).map((r) => r.name)

    const relations: SchemaRelation[] = []
    const fkCols = new Set<string>()
    let fkIndex = 0

    const tables: SchemaTable[] = tableNames.map((table) => {
      const fks = this.handle.prepare(`PRAGMA foreign_key_list(${quoteIdent(table)})`).all() as {
        table: string
        from: string
        to: string | null
      }[]
      for (const fk of fks) {
        fkCols.add(`${table}.${fk.from}`)
        relations.push({
          id: `fk-${fkIndex++}`,
          sourceTable: table,
          sourceColumn: fk.from,
          targetTable: fk.table,
          // `to` is null when the FK references the target's primary key implicitly.
          targetColumn: fk.to ?? 'rowid'
        })
      }

      const info = this.handle.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as {
        name: string
        type: string
        pk: number
      }[]
      const columns: SchemaColumn[] = info.map((c) => ({
        name: c.name,
        dataType: (c.type || '').toLowerCase(),
        isPrimaryKey: c.pk > 0,
        isForeignKey: fkCols.has(`${table}.${c.name}`)
      }))
      return { name: table, columns }
    })

    // Resolve implicit PK targets (`to` was null) to the referenced table's PK.
    const pkByTable = new Map<string, string | undefined>()
    for (const t of tables) {
      pkByTable.set(t.name, t.columns.find((c) => c.isPrimaryKey)?.name)
    }
    for (const rel of relations) {
      if (rel.targetColumn === 'rowid') {
        rel.targetColumn = pkByTable.get(rel.targetTable) ?? 'rowid'
      }
    }

    return { tables, relations }
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
