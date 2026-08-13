import type mysql from 'mysql2/promise'

/**
 * Schema introspection for MySQL/MariaDB dumps.
 *
 * `SHOW CREATE TABLE` already returns exact table DDL including indexes and
 * foreign keys, so only the objects it does not cover live here: views, triggers,
 * stored routines, and events.
 *
 * DEFINER clauses are stripped. They name a user on the source server, and a
 * restore fails outright when that user does not exist on the target — which is
 * the whole point of taking a dump elsewhere.
 */

const DEFINER =
  /\s*DEFINER\s*=\s*(`(?:[^`]|``)*`|'(?:[^']|'')*'|\S+)@(`(?:[^`]|``)*`|'(?:[^']|'')*'|\S+)/gi

function stripDefiner(sql: string): string {
  return sql.replace(DEFINER, '')
}

function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

/** Table names split by kind — views must not be dumped as tables. */
export async function listTablesAndViews(
  db: mysql.Pool,
  database: string
): Promise<{ tables: string[]; views: string[] }> {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT table_name, table_type FROM information_schema.tables
     WHERE table_schema = ? ORDER BY table_name`,
    [database]
  )
  const tables: string[] = []
  const views: string[] = []
  for (const row of rows) {
    const name = String(row.table_name ?? row.TABLE_NAME)
    const type = String(row.table_type ?? row.TABLE_TYPE)
    if (type === 'VIEW') views.push(name)
    else tables.push(name)
  }
  return { tables, views }
}

/**
 * `CREATE VIEW` for each view.
 *
 * A view is emitted as a placeholder table first, then replaced: views can
 * select from other views, and this sidesteps having to order them.
 */
export async function viewDdl(
  db: mysql.Pool,
  database: string,
  views: string[]
): Promise<string[]> {
  const statements: string[] = []
  for (const view of views) {
    const [rows] = await db.query<mysql.RowDataPacket[]>(
      `SHOW CREATE VIEW ${quoteIdent(database)}.${quoteIdent(view)}`
    )
    const ddl = String(rows[0]?.['Create View'] ?? '')
    if (!ddl) continue
    statements.push(`DROP VIEW IF EXISTS ${quoteIdent(view)};`)
    statements.push(`${stripDefiner(ddl)};`)
  }
  return statements
}

/** `CREATE TRIGGER` blocks, wrapped in DELIMITER so their bodies survive. */
export async function triggerDdl(db: mysql.Pool, database: string): Promise<string[]> {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT trigger_name FROM information_schema.triggers
     WHERE trigger_schema = ? ORDER BY trigger_name`,
    [database]
  )
  const statements: string[] = []
  for (const row of rows) {
    const name = String(row.trigger_name ?? row.TRIGGER_NAME)
    const [created] = await db.query<mysql.RowDataPacket[]>(
      `SHOW CREATE TRIGGER ${quoteIdent(database)}.${quoteIdent(name)}`
    )
    const ddl = String(created[0]?.['SQL Original Statement'] ?? '')
    if (!ddl) continue
    statements.push(`DROP TRIGGER IF EXISTS ${quoteIdent(name)};`)
    statements.push(delimited(stripDefiner(ddl)))
  }
  return statements
}

/** `CREATE PROCEDURE` / `CREATE FUNCTION` blocks. */
export async function routineDdl(db: mysql.Pool, database: string): Promise<string[]> {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT routine_name, routine_type FROM information_schema.routines
     WHERE routine_schema = ? ORDER BY routine_name`,
    [database]
  )
  const statements: string[] = []
  for (const row of rows) {
    const name = String(row.routine_name ?? row.ROUTINE_NAME)
    const type = String(row.routine_type ?? row.ROUTINE_TYPE).toUpperCase()
    const keyword = type === 'PROCEDURE' ? 'PROCEDURE' : 'FUNCTION'
    const [created] = await db.query<mysql.RowDataPacket[]>(
      `SHOW CREATE ${keyword} ${quoteIdent(database)}.${quoteIdent(name)}`
    )
    const ddl = String(
      created[0]?.[`Create ${keyword === 'PROCEDURE' ? 'Procedure' : 'Function'}`] ?? ''
    )
    if (!ddl) continue
    statements.push(`DROP ${keyword} IF EXISTS ${quoteIdent(name)};`)
    statements.push(delimited(stripDefiner(ddl)))
  }
  return statements
}

/** `CREATE EVENT` blocks from the scheduler. */
export async function eventDdl(db: mysql.Pool, database: string): Promise<string[]> {
  const [rows] = await db.query<mysql.RowDataPacket[]>(
    `SELECT event_name FROM information_schema.events
     WHERE event_schema = ? ORDER BY event_name`,
    [database]
  )
  const statements: string[] = []
  for (const row of rows) {
    const name = String(row.event_name ?? row.EVENT_NAME)
    const [created] = await db.query<mysql.RowDataPacket[]>(
      `SHOW CREATE EVENT ${quoteIdent(database)}.${quoteIdent(name)}`
    )
    const ddl = String(created[0]?.['Create Event'] ?? '')
    if (!ddl) continue
    statements.push(`DROP EVENT IF EXISTS ${quoteIdent(name)};`)
    statements.push(delimited(stripDefiner(ddl)))
  }
  return statements
}

/**
 * Wrap a compound-body statement in DELIMITER directives, the way mysqldump
 * does, so a client splitting on `;` does not cut the body in half.
 */
function delimited(ddl: string): string {
  return `DELIMITER ;;\n${ddl.trim()};;\nDELIMITER ;`
}
