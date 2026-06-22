import pg from 'pg'
import { buildTls } from '../ssl'
import { buildFilter } from '../filter'
import { buildInserts } from '../sqlformat'
import { columnDdl, createTableSql } from '../ddl'
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
  NewColumnSpec,
  TableMeta,
  TableStructure,
  UpdateRowParams,
  UpdateRowResult,
  DumpOptions
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
    const tls = buildTls(this.config)
    this.pool = new pg.Pool({
      host: this.config.host || '127.0.0.1',
      port: this.config.port || 5432,
      user: this.config.user || 'postgres',
      password: this.config.password || undefined,
      database,
      max: 4,
      ...(tls ? { ssl: tls } : {})
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
    const { page, pageSize, database, sort, filter } = opts
    const offset = (page - 1) * pageSize
    const pool = await this.poolFor(database || this.currentDatabase)
    const qualified = `${quoteIdent('public')}.${quoteIdent(table)}`
    const orderBy = sort
      ? ` ORDER BY ${quoteIdent(sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`
      : ''

    // Single $-counter shared by the WHERE clause and the LIMIT/OFFSET that follow.
    let n = 0
    const where = filter ? buildFilter(filter, quoteIdent, () => `$${++n}`) : null
    const whereClause = where ? ` WHERE ${where.clause}` : ''
    const whereParams = where ? where.params : []

    const countRes = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM ${qualified}${whereClause}`,
      whereParams
    )
    const total = Number(countRes.rows[0]?.total ?? 0)

    const res = await pool.query(
      `SELECT * FROM ${qualified}${whereClause}${orderBy} LIMIT $${++n} OFFSET $${++n}`,
      [...whereParams, pageSize, offset]
    )
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

  async getTableMeta(table: string, database?: string): Promise<TableMeta> {
    const pool = await this.poolFor(database || this.currentDatabase)

    const colsRes = await pool.query<{
      column_name: string
      data_type: string
      udt_name: string
      is_nullable: string
    }>(
      `SELECT column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    )

    const pkRes = await pool.query<{ name: string }>(
      `SELECT a.attname AS name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
       WHERE i.indrelid = (quote_ident('public') || '.' || quote_ident($1))::regclass
         AND i.indisprimary`,
      [table]
    )
    const primaryKeys = pkRes.rows.map((r) => r.name)

    // Resolve enum labels for any user-defined (enum) column types.
    const enumTypes = colsRes.rows
      .filter((c) => c.data_type === 'USER-DEFINED')
      .map((c) => c.udt_name)
    const enumMap = await this.loadEnumLabels(pool, enumTypes)

    const columns: ColumnMeta[] = colsRes.rows.map((c) => {
      const meta: ColumnMeta = {
        name: c.column_name,
        dataType:
          c.data_type === 'USER-DEFINED' ? c.udt_name.toLowerCase() : c.data_type.toLowerCase(),
        nullable: c.is_nullable.toUpperCase() === 'YES',
        isPrimaryKey: primaryKeys.includes(c.column_name)
      }
      const labels = enumMap.get(c.udt_name)
      if (labels) meta.enumValues = labels
      return meta
    })

    return { columns, primaryKeys }
  }

  async getTableStructure(table: string, database?: string): Promise<TableStructure> {
    const pool = await this.poolFor(database || this.currentDatabase)

    const colsRes = await pool.query<{
      column_name: string
      data_type: string
      udt_name: string
      is_nullable: string
      column_default: string | null
      character_maximum_length: number | null
      numeric_precision: number | null
      numeric_scale: number | null
    }>(
      `SELECT column_name, data_type, udt_name, is_nullable, column_default,
              character_maximum_length, numeric_precision, numeric_scale
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table]
    )

    const pkRes = await pool.query<{ name: string }>(
      `SELECT a.attname AS name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
       WHERE i.indrelid = (quote_ident('public') || '.' || quote_ident($1))::regclass
         AND i.indisprimary`,
      [table]
    )
    const primaryKeys = pkRes.rows.map((r) => r.name)

    const columns = colsRes.rows.map((c) => {
      const def = c.column_default
      return {
        name: c.column_name,
        dataType: formatPgType(c),
        nullable: c.is_nullable.toUpperCase() === 'YES',
        default: def,
        isPrimaryKey: primaryKeys.includes(c.column_name),
        extra: def && /nextval\(/i.test(def) ? 'auto increment' : undefined
      }
    })

    const idxRes = await pool.query<{
      index_name: string
      is_unique: boolean
      column_name: string
    }>(
      `SELECT i.relname AS index_name, ix.indisunique AS is_unique, a.attname AS column_name
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
       WHERE n.nspname = 'public' AND t.relname = $1
       ORDER BY i.relname, k.ord`,
      [table]
    )
    const byName = new Map<string, { columns: string[]; unique: boolean }>()
    for (const r of idxRes.rows) {
      const entry = byName.get(r.index_name) ?? { columns: [], unique: r.is_unique }
      entry.columns.push(r.column_name)
      byName.set(r.index_name, entry)
    }
    const indexes = [...byName.entries()].map(([name, v]) => ({ name, ...v }))

    return { columns, indexes, createSql: buildPgCreate(table, columns, primaryKeys) }
  }

  private async loadEnumLabels(pool: pg.Pool, typeNames: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>()
    if (typeNames.length === 0) return map
    const res = await pool.query<{ typname: string; enumlabel: string }>(
      `SELECT t.typname, e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = ANY ($1)
       ORDER BY e.enumsortorder`,
      [typeNames]
    )
    for (const row of res.rows) {
      const list = map.get(row.typname) ?? []
      list.push(row.enumlabel)
      map.set(row.typname, list)
    }
    return map
  }

  async createDatabase(name: string): Promise<void> {
    const pool = await this.poolFor(this.currentDatabase)
    await pool.query(`CREATE DATABASE ${quoteIdent(name)}`)
  }

  async createTable(
    table: string,
    columns: NewColumnSpec[],
    primaryKey: string[],
    database?: string
  ): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool.query(
      createTableSql(
        `${quoteIdent('public')}.${quoteIdent(table)}`,
        columns,
        primaryKey,
        quoteIdent
      )
    )
  }

  async addColumn(table: string, column: NewColumnSpec, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool.query(
      `ALTER TABLE ${quoteIdent('public')}.${quoteIdent(table)} ADD COLUMN ${columnDdl(column, quoteIdent)}`
    )
  }

  async dropColumn(table: string, column: string, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool.query(
      `ALTER TABLE ${quoteIdent('public')}.${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)}`
    )
  }

  async renameTable(table: string, newName: string, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool.query(
      `ALTER TABLE ${quoteIdent('public')}.${quoteIdent(table)} RENAME TO ${quoteIdent(newName)}`
    )
  }

  async dropTable(table: string, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool.query(`DROP TABLE ${quoteIdent('public')}.${quoteIdent(table)}`)
  }

  async updateRow(table: string, params: UpdateRowParams): Promise<UpdateRowResult> {
    const { database, pk, changes } = params
    const changeCols = Object.keys(changes)
    const pkCols = Object.keys(pk)
    if (changeCols.length === 0) return { affectedRows: 0 }
    if (pkCols.length === 0) throw new Error('Cannot update a row without a primary key')

    const pool = await this.poolFor(database || this.currentDatabase)
    const qualified = `${quoteIdent('public')}.${quoteIdent(table)}`

    let i = 1
    const setClause = changeCols.map((c) => `${quoteIdent(c)} = $${i++}`).join(', ')
    const whereClause = pkCols.map((c) => `${quoteIdent(c)} = $${i++}`).join(' AND ')
    const values = [...changeCols.map((c) => changes[c]), ...pkCols.map((c) => pk[c])]

    const res = await pool.query(
      `UPDATE ${qualified} SET ${setClause} WHERE ${whereClause}`,
      values
    )
    return { affectedRows: res.rowCount ?? 0 }
  }

  async deleteRow(table: string, params: DeleteRowParams): Promise<UpdateRowResult> {
    const { database, pk } = params
    const pkCols = Object.keys(pk)
    if (pkCols.length === 0) throw new Error('Cannot delete a row without a primary key')

    const pool = await this.poolFor(database || this.currentDatabase)
    const qualified = `${quoteIdent('public')}.${quoteIdent(table)}`
    let i = 1
    const whereClause = pkCols.map((c) => `${quoteIdent(c)} = $${i++}`).join(' AND ')
    const res = await pool.query(
      `DELETE FROM ${qualified} WHERE ${whereClause}`,
      pkCols.map((c) => pk[c])
    )
    return { affectedRows: res.rowCount ?? 0 }
  }

  async insertRow(table: string, params: InsertRowParams): Promise<UpdateRowResult> {
    const { database, values } = params
    const cols = Object.keys(values)
    if (cols.length === 0) throw new Error('No values to insert')

    const pool = await this.poolFor(database || this.currentDatabase)
    const qualified = `${quoteIdent('public')}.${quoteIdent(table)}`
    const colList = cols.map(quoteIdent).join(', ')
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
    const res = await pool.query(
      `INSERT INTO ${qualified} (${colList}) VALUES (${placeholders})`,
      cols.map((c) => values[c])
    )
    return { affectedRows: res.rowCount ?? 0 }
  }

  async runScript(sql: string, database?: string): Promise<void> {
    // The simple query protocol runs multiple ;-separated statements.
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool.query(sql)
  }

  async dumpDatabase(database?: string, options?: DumpOptions): Promise<string> {
    const target = database || this.currentDatabase
    const pool = await this.poolFor(target)
    const tablesRes = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    )
    const parts: string[] = [
      `-- TableDock data dump of ${target} — ${new Date().toISOString()}`,
      '-- Note: schema (DDL) is not included; data only.\n'
    ]
    if (options?.includeCreateDatabase) parts.push(`CREATE DATABASE ${quoteIdent(target)};\n`)
    for (const { table_name } of tablesRes.rows) {
      const qualified = `${quoteIdent('public')}.${quoteIdent(table_name)}`
      const res = await pool.query(`SELECT * FROM ${qualified}`)
      const columns = res.fields.map((f) => f.name)
      const data = res.rows.map((r: Record<string, unknown>) => columns.map((c) => r[c]))
      const inserts = buildInserts(qualified, columns, data, quoteIdent)
      if (inserts) parts.push(inserts)
    }
    return parts.join('\n')
  }

  async getSchemaGraph(database?: string): Promise<SchemaGraph> {
    const pool = await this.poolFor(database || this.currentDatabase)

    const tablesRes = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    )
    const tableNames = new Set(tablesRes.rows.map((r) => r.table_name))

    const colsRes = await pool.query<{
      table_name: string
      column_name: string
      data_type: string
    }>(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`
    )

    const pkRes = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT src.relname AS table_name, sa.attname AS column_name
       FROM pg_constraint con
       JOIN pg_namespace ns ON ns.oid = con.connamespace AND ns.nspname = 'public'
       JOIN pg_class src ON src.oid = con.conrelid
       JOIN LATERAL unnest(con.conkey) AS ck(attnum) ON true
       JOIN pg_attribute sa ON sa.attrelid = con.conrelid AND sa.attnum = ck.attnum
       WHERE con.contype = 'p'`
    )
    const pkSet = new Set(pkRes.rows.map((r) => `${r.table_name}.${r.column_name}`))

    const fkRes = await pool.query<{
      source_table: string
      source_column: string
      target_table: string
      target_column: string
    }>(
      `SELECT src.relname AS source_table,
              sa.attname  AS source_column,
              tgt.relname AS target_table,
              ta.attname  AS target_column
       FROM pg_constraint con
       JOIN pg_namespace ns ON ns.oid = con.connamespace AND ns.nspname = 'public'
       JOIN pg_class src ON src.oid = con.conrelid
       JOIN pg_class tgt ON tgt.oid = con.confrelid
       JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS u(src_attnum, tgt_attnum, ord)
         ON true
       JOIN pg_attribute sa ON sa.attrelid = con.conrelid AND sa.attnum = u.src_attnum
       JOIN pg_attribute ta ON ta.attrelid = con.confrelid AND ta.attnum = u.tgt_attnum
       WHERE con.contype = 'f'
       ORDER BY con.conname, u.ord`
    )

    const relations: SchemaRelation[] = fkRes.rows.map((r, i) => ({
      id: `fk-${i}`,
      sourceTable: r.source_table,
      sourceColumn: r.source_column,
      targetTable: r.target_table,
      targetColumn: r.target_column
    }))
    const fkCols = new Set(relations.map((r) => `${r.sourceTable}.${r.sourceColumn}`))

    const byTable = new Map<string, SchemaColumn[]>()
    for (const c of colsRes.rows) {
      if (!tableNames.has(c.table_name)) continue
      const list = byTable.get(c.table_name) ?? []
      list.push({
        name: c.column_name,
        dataType: c.data_type.toLowerCase(),
        isPrimaryKey: pkSet.has(`${c.table_name}.${c.column_name}`),
        isForeignKey: fkCols.has(`${c.table_name}.${c.column_name}`)
      })
      byTable.set(c.table_name, list)
    }
    const tables: SchemaTable[] = [...byTable.entries()].map(([name, columns]) => ({
      name,
      columns
    }))
    return { tables, relations }
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

/** Format a Postgres column's type with length/precision, e.g. varchar(255). */
function formatPgType(c: {
  data_type: string
  udt_name: string
  character_maximum_length: number | null
  numeric_precision: number | null
  numeric_scale: number | null
}): string {
  if (c.data_type === 'USER-DEFINED' || c.data_type === 'ARRAY') return c.udt_name
  if (c.character_maximum_length != null) return `${c.data_type}(${c.character_maximum_length})`
  if (c.data_type === 'numeric' && c.numeric_precision != null) {
    return c.numeric_scale
      ? `numeric(${c.numeric_precision},${c.numeric_scale})`
      : `numeric(${c.numeric_precision})`
  }
  return c.data_type
}

/** Synthesize a CREATE TABLE statement (Postgres exposes no SHOW CREATE TABLE). */
function buildPgCreate(
  table: string,
  columns: { name: string; dataType: string; nullable: boolean; default: string | null }[],
  primaryKeys: string[]
): string {
  const lines = columns.map((c) => {
    let line = `  ${quoteIdent(c.name)} ${c.dataType}`
    if (c.default != null) line += ` DEFAULT ${c.default}`
    if (!c.nullable) line += ' NOT NULL'
    return line
  })
  if (primaryKeys.length > 0) {
    lines.push(`  PRIMARY KEY (${primaryKeys.map(quoteIdent).join(', ')})`)
  }
  return `CREATE TABLE ${quoteIdent('public')}.${quoteIdent(table)} (\n${lines.join(',\n')}\n);`
}
