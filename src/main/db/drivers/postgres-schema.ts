import type pg from 'pg'

/**
 * Schema introspection for PostgreSQL dumps.
 *
 * Postgres has no SHOW CREATE TABLE, but pg_catalog exposes the same generators
 * pg_dump uses — `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_viewdef`,
 * `pg_get_functiondef`, `pg_get_triggerdef`, `format_type`. Reading DDL back
 * from those is far more faithful than rebuilding it from information_schema,
 * which loses array types, enums, and every constraint that is not a PK.
 *
 * Everything here is scoped to the `public` schema, which is the only schema the
 * rest of the driver browses.
 */

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function qualified(table: string): string {
  return `${quoteIdent('public')}.${quoteIdent(table)}`
}

/** `CREATE EXTENSION` for everything installed but plpgsql, which always exists. */
export async function extensionDdl(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ extname: string }>(
    `SELECT e.extname
     FROM pg_extension e
     WHERE e.extname <> 'plpgsql'
     ORDER BY e.extname`
  )
  return res.rows.map((r) => `CREATE EXTENSION IF NOT EXISTS ${quoteIdent(r.extname)};`)
}

/** User-defined enum, domain, and composite types. */
export async function typeDdl(pool: pg.Pool): Promise<{ create: string[]; drop: string[] }> {
  const create: string[] = []
  const drop: string[] = []

  const enums = await pool.query<{ typname: string; labels: string[] }>(
    // enumlabel is a `name`; cast so node-pg parses the aggregate as a JS array.
    `SELECT t.typname, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS labels
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
     JOIN pg_enum e ON e.enumtypid = t.oid
     GROUP BY t.typname
     ORDER BY t.typname`
  )
  for (const row of enums.rows) {
    const labels = row.labels.map(quoteLiteral).join(', ')
    create.push(`CREATE TYPE ${quoteIdent(row.typname)} AS ENUM (${labels});`)
    drop.push(`DROP TYPE IF EXISTS ${quoteIdent(row.typname)} CASCADE;`)
  }

  const domains = await pool.query<{
    typname: string
    base: string
    notnull: boolean
    def: string | null
    checks: string | null
  }>(
    `SELECT t.typname,
            format_type(t.typbasetype, t.typtypmod) AS base,
            t.typnotnull AS notnull,
            pg_get_expr(t.typdefaultbin, 0) AS def,
            (SELECT string_agg(pg_get_constraintdef(c.oid), ' ')
             FROM pg_constraint c WHERE c.contypid = t.oid) AS checks
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
     WHERE t.typtype = 'd'
     ORDER BY t.typname`
  )
  for (const row of domains.rows) {
    let sql = `CREATE DOMAIN ${quoteIdent(row.typname)} AS ${row.base}`
    if (row.def) sql += ` DEFAULT ${row.def}`
    if (row.notnull) sql += ' NOT NULL'
    if (row.checks) sql += ` ${row.checks}`
    create.push(`${sql};`)
    drop.push(`DROP DOMAIN IF EXISTS ${quoteIdent(row.typname)} CASCADE;`)
  }

  // Standalone composite types (a table's implicit row type has relkind 'r').
  const composites = await pool.query<{ typname: string; cols: string[] }>(
    `SELECT t.typname,
            array_agg(quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
                      ORDER BY a.attnum) AS cols
     FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
     JOIN pg_class c ON c.oid = t.typrelid AND c.relkind = 'c'
     JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE t.typtype = 'c'
     GROUP BY t.typname
     ORDER BY t.typname`
  )
  for (const row of composites.rows) {
    create.push(`CREATE TYPE ${quoteIdent(row.typname)} AS (${row.cols.join(', ')});`)
    drop.push(`DROP TYPE IF EXISTS ${quoteIdent(row.typname)} CASCADE;`)
  }

  return { create, drop }
}

/**
 * Sequences, emitted explicitly rather than folded into `serial`. Keeping the
 * real sequence name matters: defaults, other tables, and application code may
 * all reference it by name.
 */
export async function sequenceDdl(pool: pg.Pool): Promise<{ create: string[]; drop: string[] }> {
  const res = await pool.query<{
    seqname: string
    data_type: string
    start_value: string
    increment: string
    min_value: string
    max_value: string
    cycle: boolean
  }>(
    `SELECT c.relname AS seqname,
            format_type(s.seqtypid, NULL) AS data_type,
            s.seqstart::text AS start_value,
            s.seqincrement::text AS increment,
            s.seqmin::text AS min_value,
            s.seqmax::text AS max_value,
            s.seqcycle AS cycle
     FROM pg_sequence s
     JOIN pg_class c ON c.oid = s.seqrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     -- Identity-column sequences are created by the column definition itself.
     WHERE NOT EXISTS (
       SELECT 1 FROM pg_depend d
       WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'i'
     )
     ORDER BY c.relname`
  )
  const create = res.rows.map((r) => {
    const parts = [`CREATE SEQUENCE ${quoteIdent(r.seqname)}`]
    if (r.data_type && r.data_type !== 'bigint') parts.push(`AS ${r.data_type}`)
    parts.push(`START WITH ${r.start_value}`)
    parts.push(`INCREMENT BY ${r.increment}`)
    parts.push(`MINVALUE ${r.min_value}`)
    parts.push(`MAXVALUE ${r.max_value}`)
    if (r.cycle) parts.push('CYCLE')
    return `${parts.join('\n  ')};`
  })
  const drop = res.rows.map((r) => `DROP SEQUENCE IF EXISTS ${quoteIdent(r.seqname)} CASCADE;`)
  return { create, drop }
}

/** `ALTER SEQUENCE … OWNED BY`, so dropping the table still drops its sequence. */
export async function sequenceOwnershipDdl(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ seqname: string; tablename: string; colname: string }>(
    `SELECT s.relname AS seqname, t.relname AS tablename, a.attname AS colname
     FROM pg_depend d
     JOIN pg_class s ON s.oid = d.objid AND s.relkind = 'S'
     JOIN pg_class t ON t.oid = d.refobjid
     JOIN pg_namespace n ON n.oid = s.relnamespace AND n.nspname = 'public'
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
     WHERE d.classid = 'pg_class'::regclass AND d.deptype = 'a'
     ORDER BY s.relname`
  )
  return res.rows.map(
    (r) =>
      `ALTER SEQUENCE ${quoteIdent(r.seqname)} OWNED BY ${qualified(r.tablename)}.${quoteIdent(r.colname)};`
  )
}

/** `setval` for every sequence, so ids continue past the dumped rows. */
export async function sequenceValueDdl(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ seqname: string }>(
    `SELECT c.relname AS seqname
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relkind = 'S'
     ORDER BY c.relname`
  )
  const statements: string[] = []
  for (const { seqname } of res.rows) {
    const state = await pool.query<{ last_value: string; is_called: boolean }>(
      `SELECT last_value::text, is_called FROM ${qualified(seqname)}`
    )
    const row = state.rows[0]
    if (!row) continue
    statements.push(
      `SELECT pg_catalog.setval(${quoteLiteral(`public.${seqname}`)}, ${row.last_value}, ${row.is_called});`
    )
  }
  return statements
}

interface PgColumn {
  attname: string
  type: string
  notnull: boolean
  default_expr: string | null
  identity: string
  generated: string
}

/**
 * `CREATE TABLE` with exact column types plus every constraint except foreign
 * keys, which are added later so table order cannot break the restore.
 */
export async function tableDdl(pool: pg.Pool, table: string): Promise<string> {
  const cols = await pool.query<PgColumn>(
    `SELECT a.attname,
            format_type(a.atttypid, a.atttypmod) AS type,
            a.attnotnull AS notnull,
            pg_get_expr(d.adbin, d.adrelid) AS default_expr,
            a.attidentity AS identity,
            a.attgenerated AS generated
     FROM pg_attribute a
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [qualified(table)]
  )

  const lines = cols.rows.map((c) => {
    let line = `  ${quoteIdent(c.attname)} ${c.type}`
    if (c.identity === 'a') line += ' GENERATED ALWAYS AS IDENTITY'
    else if (c.identity === 'd') line += ' GENERATED BY DEFAULT AS IDENTITY'
    else if (c.generated === 's' && c.default_expr)
      line += ` GENERATED ALWAYS AS (${c.default_expr}) STORED`
    else if (c.default_expr != null) line += ` DEFAULT ${c.default_expr}`
    if (c.notnull && c.generated !== 's') line += ' NOT NULL'
    return line
  })

  // Primary key, unique, and check constraints live inside the CREATE TABLE.
  const constraints = await pool.query<{ conname: string; def: string }>(
    `SELECT con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     WHERE con.conrelid = $1::regclass AND con.contype IN ('p', 'u', 'c')
     ORDER BY con.contype DESC, con.conname`,
    [qualified(table)]
  )
  for (const con of constraints.rows) {
    lines.push(`  CONSTRAINT ${quoteIdent(con.conname)} ${con.def}`)
  }

  return `CREATE TABLE ${qualified(table)} (\n${lines.join(',\n')}\n);`
}

/** Indexes that are not already implied by a constraint. */
export async function indexDdl(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ def: string }>(
    `SELECT pg_get_indexdef(i.indexrelid) AS def
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indrelid
     JOIN pg_class ic ON ic.oid = i.indexrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relkind IN ('r', 'p')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = i.indexrelid)
     ORDER BY c.relname, ic.relname`
  )
  return res.rows.map((r) => `${r.def};`)
}

/** Foreign keys, emitted after every table exists. */
export async function foreignKeyDdl(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ tablename: string; conname: string; def: string }>(
    `SELECT c.relname AS tablename, con.conname, pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class c ON c.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE con.contype = 'f'
     ORDER BY c.relname, con.conname`
  )
  return res.rows.map(
    (r) => `ALTER TABLE ${qualified(r.tablename)} ADD CONSTRAINT ${quoteIdent(r.conname)} ${r.def};`
  )
}

/** Views, ordered so a view is created after anything it selects from. */
export async function viewDdl(pool: pg.Pool): Promise<{ create: string[]; drop: string[] }> {
  const res = await pool.query<{ viewname: string; def: string; matview: boolean }>(
    `SELECT c.relname AS viewname,
            pg_get_viewdef(c.oid, true) AS def,
            (c.relkind = 'm') AS matview
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE c.relkind IN ('v', 'm')`
  )
  if (res.rows.length === 0) return { create: [], drop: [] }

  const deps = await pool.query<{ viewname: string; depends_on: string }>(
    `SELECT DISTINCT dependent.relname AS viewname, source.relname AS depends_on
     FROM pg_depend d
     JOIN pg_rewrite r ON r.oid = d.objid
     JOIN pg_class dependent ON dependent.oid = r.ev_class
     JOIN pg_class source ON source.oid = d.refobjid
     JOIN pg_namespace n ON n.oid = dependent.relnamespace AND n.nspname = 'public'
     WHERE d.refclassid = 'pg_class'::regclass
       AND dependent.relkind IN ('v', 'm')
       AND source.relkind IN ('v', 'm')
       AND dependent.oid <> source.oid`
  )

  const names = res.rows.map((r) => r.viewname)
  const ordered = topoSort(
    names,
    deps.rows.filter((d) => names.includes(d.depends_on)).map((d) => [d.viewname, d.depends_on])
  )
  const byName = new Map(res.rows.map((r) => [r.viewname, r]))

  const create = ordered.map((name) => {
    const view = byName.get(name)
    if (!view) return ''
    const kind = view.matview ? 'MATERIALIZED VIEW' : 'VIEW'
    return `CREATE ${kind} ${qualified(name)} AS\n${view.def}`
  })
  // Dropped in reverse so dependents go first.
  const drop = [...ordered].reverse().map((name) => {
    const kind = byName.get(name)?.matview ? 'MATERIALIZED VIEW' : 'VIEW'
    return `DROP ${kind} IF EXISTS ${qualified(name)} CASCADE;`
  })
  return { create: create.filter(Boolean), drop }
}

/** Functions and procedures defined in the schema, skipping extension-owned ones. */
export async function functionDdl(pool: pg.Pool): Promise<{ create: string[]; drop: string[] }> {
  const res = await pool.query<{ def: string; name: string; args: string; kind: string }>(
    `SELECT pg_get_functiondef(p.oid) AS def,
            p.proname AS name,
            pg_get_function_identity_arguments(p.oid) AS args,
            CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END AS kind
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
     WHERE p.prokind IN ('f', 'p')
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
         WHERE d.objid = p.oid AND d.deptype = 'e'
       )
     ORDER BY p.proname`
  )
  return {
    create: res.rows.map((r) => `${r.def};`),
    drop: res.rows.map((r) => `DROP ${r.kind} IF EXISTS ${quoteIdent(r.name)}(${r.args}) CASCADE;`)
  }
}

/** User triggers (internal constraint triggers are excluded). */
export async function triggerDdl(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ def: string }>(
    `SELECT pg_get_triggerdef(t.oid) AS def
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE NOT t.tgisinternal
     ORDER BY c.relname, t.tgname`
  )
  return res.rows.map((r) => `${r.def};`)
}

/** Kahn's algorithm; `edges` are [dependent, dependency] pairs. */
function topoSort(nodes: string[], edges: [string, string][]): string[] {
  const remaining = new Set(nodes)
  const result: string[] = []
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((n) => !edges.some(([from, to]) => from === n && remaining.has(to) && to !== n))
      .sort()
    // A cycle (or a dependency we cannot resolve) — emit the rest as-is.
    if (ready.length === 0) return [...result, ...[...remaining].sort()]
    for (const node of ready) {
      result.push(node)
      remaining.delete(node)
    }
  }
  return result
}
