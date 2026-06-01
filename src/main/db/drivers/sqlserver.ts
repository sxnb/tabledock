import sql from 'mssql'
import { buildTls } from '../ssl'
import { buildFilter } from '../filter'
import { buildInserts } from '../sqlformat'
import { columnDdl, createTableSql } from '../ddl'
import type {
  ColumnMeta,
  ConnectionConfig,
  DeleteRowParams,
  DumpOptions,
  GetRowsOptions,
  InsertRowParams,
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
  UpdateRowResult
} from '../types'

/** Wrap an identifier in brackets, escaping embedded brackets (T-SQL). */
function quoteIdent(name: string): string {
  return '[' + name.replace(/]/g, ']]') + ']'
}

/** Column names in their result-set order. */
function orderedColumns(recordset: sql.IRecordSet<Record<string, unknown>>): string[] {
  const cols = recordset.columns
  return Object.keys(cols).sort((a, b) => cols[a].index - cols[b].index)
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return value.toString('base64')
  return value
}

/** Microsoft SQL Server driver (T-SQL via the `mssql`/tedious package). */
export class SqlServerDriver implements RelationalDriver {
  readonly kind = 'mssql' as const
  private pool: sql.ConnectionPool | null = null
  private currentDatabase: string

  constructor(private readonly config: ConnectionConfig) {
    this.currentDatabase = config.database || 'master'
  }

  private poolConfig(database: string): sql.config {
    const tls = buildTls(this.config)
    const options: sql.IOptions = tls
      ? { encrypt: true, trustServerCertificate: !tls.rejectUnauthorized }
      : { encrypt: false, trustServerCertificate: true }
    if (tls && (tls.ca || tls.cert || tls.key)) {
      options.cryptoCredentialsDetails = {
        ...(tls.ca ? { ca: tls.ca } : {}),
        ...(tls.cert ? { cert: tls.cert } : {}),
        ...(tls.key ? { key: tls.key } : {})
      }
    }
    return {
      server: this.config.host || '127.0.0.1',
      port: this.config.port || 1433,
      user: this.config.user || 'sa',
      password: this.config.password || undefined,
      database,
      options,
      pool: { max: 4, min: 0, idleTimeoutMillis: 30000 }
    }
  }

  async connect(): Promise<void> {
    await this.poolFor(this.currentDatabase)
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close()
      this.pool = null
    }
  }

  /** SQL Server connects per-database; recreate the pool when switching. */
  private async poolFor(database: string): Promise<sql.ConnectionPool> {
    if (this.pool && this.currentDatabase === database) return this.pool
    if (this.pool) await this.pool.close()
    this.currentDatabase = database
    this.pool = new sql.ConnectionPool(this.poolConfig(database))
    await this.pool.connect()
    return this.pool
  }

  async listDatabases(): Promise<string[]> {
    const pool = await this.poolFor(this.currentDatabase)
    const res = await pool.request().query<{ name: string }>(
      `SELECT name FROM sys.databases
         WHERE name NOT IN ('master','tempdb','model','msdb')
         ORDER BY name`
    )
    return res.recordset.map((r) => r.name)
  }

  async listTables(database?: string): Promise<string[]> {
    const pool = await this.poolFor(database || this.currentDatabase)
    const res = await pool.request().query<{ TABLE_NAME: string }>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'dbo'
       ORDER BY TABLE_NAME`
    )
    return res.recordset.map((r) => r.TABLE_NAME)
  }

  async getRows(table: string, opts: GetRowsOptions): Promise<RowsResult> {
    const { page, pageSize, database, sort, filter } = opts
    const offset = (page - 1) * pageSize
    const pool = await this.poolFor(database || this.currentDatabase)
    const qualified = `${quoteIdent('dbo')}.${quoteIdent(table)}`

    let n = 0
    const where = filter ? buildFilter(filter, quoteIdent, () => `@f${n++}`) : null
    const whereClause = where ? ` WHERE ${where.clause}` : ''

    const countReq = pool.request()
    if (where) where.params.forEach((p, i) => countReq.input(`f${i}`, p))
    const countRes = await countReq.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM ${qualified}${whereClause}`
    )
    const total = Number(countRes.recordset[0]?.total ?? 0)

    const orderBy = sort
      ? `${quoteIdent(sort.column)} ${sort.direction === 'desc' ? 'DESC' : 'ASC'}`
      : '(SELECT NULL)'
    const rowsReq = pool.request()
    if (where) where.params.forEach((p, i) => rowsReq.input(`f${i}`, p))
    rowsReq.input('off', offset).input('lim', pageSize)
    const res = await rowsReq.query<Record<string, unknown>>(
      `SELECT * FROM ${qualified}${whereClause}
       ORDER BY ${orderBy} OFFSET @off ROWS FETCH NEXT @lim ROWS ONLY`
    )
    const columns = orderedColumns(res.recordset)
    return {
      columns,
      rows: res.recordset.map((r) => columns.map((c) => normalize(r[c]))),
      rowCount: res.recordset.length,
      total,
      page,
      pageSize
    }
  }

  async getTableMeta(table: string, database?: string): Promise<TableMeta> {
    const pool = await this.poolFor(database || this.currentDatabase)
    const colsRes = await pool
      .request()
      .input('t', table)
      .query<{ COLUMN_NAME: string; DATA_TYPE: string; IS_NULLABLE: string }>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @t
         ORDER BY ORDINAL_POSITION`
      )
    const pkRes = await pool
      .request()
      .input('t', table)
      .query<{ COLUMN_NAME: string }>(
        `SELECT kcu.COLUMN_NAME
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
         WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = 'dbo' AND tc.TABLE_NAME = @t`
      )
    const pkSet = new Set(pkRes.recordset.map((r) => r.COLUMN_NAME))
    const columns: ColumnMeta[] = colsRes.recordset.map((c) => ({
      name: c.COLUMN_NAME,
      dataType: c.DATA_TYPE.toLowerCase(),
      nullable: c.IS_NULLABLE.toUpperCase() === 'YES',
      isPrimaryKey: pkSet.has(c.COLUMN_NAME)
    }))
    return { columns, primaryKeys: columns.filter((c) => c.isPrimaryKey).map((c) => c.name) }
  }

  async getTableStructure(table: string, database?: string): Promise<TableStructure> {
    const pool = await this.poolFor(database || this.currentDatabase)
    const full = `dbo.${table}`

    const colsRes = await pool
      .request()
      .input('t', table)
      .query<{
        COLUMN_NAME: string
        DATA_TYPE: string
        IS_NULLABLE: string
        COLUMN_DEFAULT: string | null
        CHARACTER_MAXIMUM_LENGTH: number | null
        NUMERIC_PRECISION: number | null
        NUMERIC_SCALE: number | null
      }>(
        `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
                CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @t
         ORDER BY ORDINAL_POSITION`
      )

    const pkRes = await pool
      .request()
      .input('t', table)
      .query<{ COLUMN_NAME: string }>(
        `SELECT kcu.COLUMN_NAME
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
         JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
         WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = 'dbo' AND tc.TABLE_NAME = @t`
      )
    const pkSet = new Set(pkRes.recordset.map((r) => r.COLUMN_NAME))
    const primaryKeys = [...pkSet]

    const identRes = await pool.request().input('full', full).query<{
      name: string
    }>(`SELECT name FROM sys.identity_columns WHERE object_id = OBJECT_ID(@full)`)
    const identitySet = new Set(identRes.recordset.map((r) => r.name))

    const columns = colsRes.recordset.map((c) => ({
      name: c.COLUMN_NAME,
      dataType: formatMssqlType(c),
      nullable: c.IS_NULLABLE.toUpperCase() === 'YES',
      default: c.COLUMN_DEFAULT,
      isPrimaryKey: pkSet.has(c.COLUMN_NAME),
      extra: identitySet.has(c.COLUMN_NAME) ? 'identity' : undefined
    }))

    const idxRes = await pool
      .request()
      .input('full', full)
      .query<{ index_name: string; is_unique: boolean; column_name: string }>(
        `SELECT i.name AS index_name, i.is_unique, c.name AS column_name
         FROM sys.indexes i
         JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
         WHERE i.object_id = OBJECT_ID(@full) AND i.name IS NOT NULL
         ORDER BY i.name, ic.key_ordinal`
      )
    const byName = new Map<string, { columns: string[]; unique: boolean }>()
    for (const r of idxRes.recordset) {
      const entry = byName.get(r.index_name) ?? { columns: [], unique: r.is_unique }
      entry.columns.push(r.column_name)
      byName.set(r.index_name, entry)
    }
    const indexes = [...byName.entries()].map(([name, v]) => ({ name, ...v }))

    return { columns, indexes, createSql: buildMssqlCreate(table, columns, primaryKeys) }
  }

  async createDatabase(name: string): Promise<void> {
    const pool = await this.poolFor(this.currentDatabase)
    await pool.request().query(`CREATE DATABASE ${quoteIdent(name)}`)
  }

  async createTable(
    table: string,
    columns: NewColumnSpec[],
    primaryKey: string[],
    database?: string
  ): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool
      .request()
      .query(
        createTableSql(`${quoteIdent('dbo')}.${quoteIdent(table)}`, columns, primaryKey, quoteIdent)
      )
  }

  async addColumn(table: string, column: NewColumnSpec, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    // T-SQL: ADD takes no COLUMN keyword.
    await pool
      .request()
      .query(
        `ALTER TABLE ${quoteIdent('dbo')}.${quoteIdent(table)} ADD ${columnDdl(column, quoteIdent)}`
      )
  }

  async dropColumn(table: string, column: string, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool
      .request()
      .query(
        `ALTER TABLE ${quoteIdent('dbo')}.${quoteIdent(table)} DROP COLUMN ${quoteIdent(column)}`
      )
  }

  async renameTable(table: string, newName: string, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    // sp_rename's new-name argument is unqualified.
    await pool
      .request()
      .input('o', `dbo.${table}`)
      .input('n', newName)
      .query('EXEC sp_rename @o, @n')
  }

  async dropTable(table: string, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool.request().query(`DROP TABLE ${quoteIdent('dbo')}.${quoteIdent(table)}`)
  }

  async updateRow(table: string, params: UpdateRowParams): Promise<UpdateRowResult> {
    const { database, pk, changes } = params
    const changeCols = Object.keys(changes)
    const pkCols = Object.keys(pk)
    if (changeCols.length === 0) return { affectedRows: 0 }
    if (pkCols.length === 0) throw new Error('Cannot update a row without a primary key')

    const pool = await this.poolFor(database || this.currentDatabase)
    const req = pool.request()
    const setClause = changeCols
      .map((c, i) => {
        req.input(`s${i}`, changes[c])
        return `${quoteIdent(c)} = @s${i}`
      })
      .join(', ')
    const whereClause = pkCols
      .map((c, i) => {
        req.input(`w${i}`, pk[c])
        return `${quoteIdent(c)} = @w${i}`
      })
      .join(' AND ')
    const res = await req.query(
      `UPDATE ${quoteIdent('dbo')}.${quoteIdent(table)} SET ${setClause} WHERE ${whereClause}`
    )
    return { affectedRows: res.rowsAffected[0] ?? 0 }
  }

  async deleteRow(table: string, params: DeleteRowParams): Promise<UpdateRowResult> {
    const { database, pk } = params
    const pkCols = Object.keys(pk)
    if (pkCols.length === 0) throw new Error('Cannot delete a row without a primary key')

    const pool = await this.poolFor(database || this.currentDatabase)
    const req = pool.request()
    const whereClause = pkCols
      .map((c, i) => {
        req.input(`w${i}`, pk[c])
        return `${quoteIdent(c)} = @w${i}`
      })
      .join(' AND ')
    const res = await req.query(
      `DELETE FROM ${quoteIdent('dbo')}.${quoteIdent(table)} WHERE ${whereClause}`
    )
    return { affectedRows: res.rowsAffected[0] ?? 0 }
  }

  async insertRow(table: string, params: InsertRowParams): Promise<UpdateRowResult> {
    const { database, values } = params
    const cols = Object.keys(values)
    if (cols.length === 0) throw new Error('No values to insert')

    const pool = await this.poolFor(database || this.currentDatabase)
    const req = pool.request()
    const placeholders = cols
      .map((c, i) => {
        req.input(`v${i}`, values[c])
        return `@v${i}`
      })
      .join(', ')
    const colList = cols.map(quoteIdent).join(', ')
    const res = await req.query(
      `INSERT INTO ${quoteIdent('dbo')}.${quoteIdent(table)} (${colList}) VALUES (${placeholders})`
    )
    return { affectedRows: res.rowsAffected[0] ?? 0 }
  }

  async getSchemaGraph(database?: string): Promise<SchemaGraph> {
    const pool = await this.poolFor(database || this.currentDatabase)

    const tablesRes = await pool.request().query<{ TABLE_NAME: string }>(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = 'dbo'`
    )
    const tableNames = new Set(tablesRes.recordset.map((r) => r.TABLE_NAME))

    const colsRes = await pool
      .request()
      .query<{ TABLE_NAME: string; COLUMN_NAME: string; DATA_TYPE: string }>(
        `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = 'dbo' ORDER BY TABLE_NAME, ORDINAL_POSITION`
      )

    const pkRes = await pool.request().query<{ TABLE_NAME: string; COLUMN_NAME: string }>(
      `SELECT tc.TABLE_NAME, kcu.COLUMN_NAME
       FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
       JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
       WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = 'dbo'`
    )
    const pkSet = new Set(pkRes.recordset.map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`))

    const fkRes = await pool.request().query<{
      source_table: string
      source_column: string
      target_table: string
      target_column: string
    }>(
      `SELECT fk.TABLE_NAME AS source_table, fk.COLUMN_NAME AS source_column,
              pk.TABLE_NAME AS target_table, pk.COLUMN_NAME AS target_column
       FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
       JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE fk ON fk.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
       JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pk ON pk.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME
         AND pk.ORDINAL_POSITION = fk.ORDINAL_POSITION
       WHERE fk.TABLE_SCHEMA = 'dbo'`
    )
    const relations: SchemaRelation[] = fkRes.recordset.map((r, i) => ({
      id: `fk-${i}`,
      sourceTable: r.source_table,
      sourceColumn: r.source_column,
      targetTable: r.target_table,
      targetColumn: r.target_column
    }))
    const fkCols = new Set(relations.map((r) => `${r.sourceTable}.${r.sourceColumn}`))

    const byTable = new Map<string, SchemaColumn[]>()
    for (const c of colsRes.recordset) {
      if (!tableNames.has(c.TABLE_NAME)) continue
      const list = byTable.get(c.TABLE_NAME) ?? []
      list.push({
        name: c.COLUMN_NAME,
        dataType: c.DATA_TYPE.toLowerCase(),
        isPrimaryKey: pkSet.has(`${c.TABLE_NAME}.${c.COLUMN_NAME}`),
        isForeignKey: fkCols.has(`${c.TABLE_NAME}.${c.COLUMN_NAME}`)
      })
      byTable.set(c.TABLE_NAME, list)
    }
    const tables: SchemaTable[] = [...byTable.entries()].map(([name, columns]) => ({
      name,
      columns
    }))
    return { tables, relations }
  }

  async runQuery(sql_: string, database?: string): Promise<QueryResult> {
    const pool = await this.poolFor(database || this.currentDatabase)
    const res = await pool.request().query<Record<string, unknown>>(sql_)
    if (res.recordset) {
      const columns = orderedColumns(res.recordset)
      return {
        columns,
        rows: res.recordset.map((r) => columns.map((c) => normalize(r[c]))),
        rowCount: res.recordset.length
      }
    }
    return { columns: [], rows: [], rowCount: 0, affectedRows: res.rowsAffected[0] ?? 0 }
  }

  async runScript(sql_: string, database?: string): Promise<void> {
    const pool = await this.poolFor(database || this.currentDatabase)
    await pool.request().batch(sql_)
  }

  async dumpDatabase(database?: string, options?: DumpOptions): Promise<string> {
    const target = database || this.currentDatabase
    const pool = await this.poolFor(target)
    const tables = await this.listTables(target)
    const parts: string[] = [
      `-- DataDock data dump of ${target} — ${new Date().toISOString()}`,
      '-- Note: schema (DDL) is not included; data only.\n'
    ]
    if (options?.includeCreateDatabase) {
      parts.push(`CREATE DATABASE ${quoteIdent(target)};\nGO\nUSE ${quoteIdent(target)};\nGO\n`)
    }
    for (const t of tables) {
      const qualified = `${quoteIdent('dbo')}.${quoteIdent(t)}`
      const res = await pool.request().query<Record<string, unknown>>(`SELECT * FROM ${qualified}`)
      const columns = orderedColumns(res.recordset)
      const data = res.recordset.map((r) => columns.map((c) => r[c]))
      const inserts = buildInserts(qualified, columns, data, quoteIdent)
      if (inserts) parts.push(inserts)
    }
    return parts.join('\n')
  }
}

/** Format a SQL Server column's type with length/precision, e.g. varchar(255). */
function formatMssqlType(c: {
  DATA_TYPE: string
  CHARACTER_MAXIMUM_LENGTH: number | null
  NUMERIC_PRECISION: number | null
  NUMERIC_SCALE: number | null
}): string {
  const type = c.DATA_TYPE.toLowerCase()
  if (c.CHARACTER_MAXIMUM_LENGTH != null) {
    return `${type}(${c.CHARACTER_MAXIMUM_LENGTH === -1 ? 'max' : c.CHARACTER_MAXIMUM_LENGTH})`
  }
  if ((type === 'decimal' || type === 'numeric') && c.NUMERIC_PRECISION != null) {
    return `${type}(${c.NUMERIC_PRECISION},${c.NUMERIC_SCALE ?? 0})`
  }
  return type
}

/** Synthesize a CREATE TABLE statement (built from column metadata). */
function buildMssqlCreate(
  table: string,
  columns: {
    name: string
    dataType: string
    nullable: boolean
    default: string | null
    extra?: string
  }[],
  primaryKeys: string[]
): string {
  const lines = columns.map((c) => {
    let line = `  ${quoteIdent(c.name)} ${c.dataType}`
    if (c.extra === 'identity') line += ' IDENTITY(1,1)'
    if (c.default != null) line += ` DEFAULT ${c.default}`
    line += c.nullable ? ' NULL' : ' NOT NULL'
    return line
  })
  if (primaryKeys.length > 0) {
    lines.push(`  PRIMARY KEY (${primaryKeys.map(quoteIdent).join(', ')})`)
  }
  return `CREATE TABLE ${quoteIdent('dbo')}.${quoteIdent(table)} (\n${lines.join(',\n')}\n);`
}
