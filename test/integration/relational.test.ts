import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgresDriver } from '../../src/main/db/drivers/postgres'
import { MySqlDriver } from '../../src/main/db/drivers/mysql'
import type { RelationalDriver } from '../../src/main/db/types'
import { testConfig, RELATIONAL_KINDS, type TestKind } from '../support/dbconfig'

function makeDriver(kind: TestKind): RelationalDriver {
  const cfg = testConfig(kind)
  return kind === 'postgres' ? new PostgresDriver(cfg) : new MySqlDriver(cfg)
}

// One shared contract exercised against every relational driver.
for (const kind of RELATIONAL_KINDS) {
  describe(`relational driver: ${kind}`, () => {
    let driver: RelationalDriver
    const stamp = Date.now()
    const tmp = `tmp_${kind}_${stamp}`

    beforeAll(async () => {
      driver = makeDriver(kind)
      await driver.connect()
    })
    afterAll(async () => {
      await driver?.disconnect()
    })

    it('lists the seeded database and tables', async () => {
      expect(await driver.listDatabases()).toContain('tabledock_test')
      const tables = await driver.listTables()
      expect(tables).toEqual(expect.arrayContaining(['users', 'posts']))
    })

    it('reads rows with pagination', async () => {
      const res = await driver.getRows('users', { page: 1, pageSize: 10 })
      expect(res.total).toBe(3)
      expect(res.rows).toHaveLength(3)
      expect(res.columns).toContain('email')
    })

    it('sorts server-side', async () => {
      const res = await driver.getRows('users', {
        page: 1,
        pageSize: 10,
        sort: { column: 'id', direction: 'desc' }
      })
      const idIdx = res.columns.indexOf('id')
      expect(Number(res.rows[0][idIdx])).toBe(3)
    })

    it('filters server-side', async () => {
      const eq = await driver.getRows('users', {
        page: 1,
        pageSize: 10,
        filter: { column: 'email', operator: 'eq', value: 'bob@example.com' }
      })
      expect(eq.total).toBe(1)

      const contains = await driver.getRows('users', {
        page: 1,
        pageSize: 10,
        filter: { column: 'name', operator: 'contains', value: 'li' }
      })
      expect(contains.total).toBe(1) // Alice
    })

    it('reports primary key + structure', async () => {
      const meta = await driver.getTableMeta('users')
      expect(meta.primaryKeys).toContain('id')

      const structure = await driver.getTableStructure('users')
      expect(structure.columns.find((c) => c.name === 'id')?.isPrimaryKey).toBe(true)
      expect(structure.indexes.length).toBeGreaterThan(0)
      expect(structure.createSql).toBeTruthy()
    })

    it('exposes the foreign-key graph', async () => {
      const graph = await driver.getSchemaGraph()
      const rel = graph.relations.find(
        (r) => r.sourceTable === 'posts' && r.targetTable === 'users'
      )
      expect(rel?.targetColumn).toBe('id')
    })

    it('runs an arbitrary query', async () => {
      const res = await driver.runQuery('SELECT 1 AS one')
      expect(res.columns).toContain('one')
      expect(res.rows).toHaveLength(1)
    })

    it('creates a table', async () => {
      await driver.createTable(
        tmp,
        [
          { name: 'id', type: 'integer', nullable: false },
          { name: 'label', type: 'text', nullable: true }
        ],
        ['id']
      )
      expect(await driver.listTables()).toContain(tmp)
    })

    it('inserts, updates, and deletes a row', async () => {
      await driver.insertRow(tmp, { values: { id: 1, label: 'a' } })
      let res = await driver.getRows(tmp, { page: 1, pageSize: 10 })
      expect(res.total).toBe(1)

      const upd = await driver.updateRow(tmp, { pk: { id: 1 }, changes: { label: 'b' } })
      expect(upd.affectedRows).toBe(1)
      res = await driver.getRows(tmp, { page: 1, pageSize: 10 })
      expect(res.rows[0][res.columns.indexOf('label')]).toBe('b')

      const del = await driver.deleteRow(tmp, { pk: { id: 1 } })
      expect(del.affectedRows).toBe(1)
      res = await driver.getRows(tmp, { page: 1, pageSize: 10 })
      expect(res.total).toBe(0)
    })

    it('adds and drops a column', async () => {
      await driver.addColumn(tmp, { name: 'extra', type: 'integer', nullable: true })
      let structure = await driver.getTableStructure(tmp)
      expect(structure.columns.map((c) => c.name)).toContain('extra')

      await driver.dropColumn(tmp, 'extra')
      structure = await driver.getTableStructure(tmp)
      expect(structure.columns.map((c) => c.name)).not.toContain('extra')
    })

    it('renames and drops the table', async () => {
      const renamed = `${tmp}_r`
      await driver.renameTable(tmp, renamed)
      let tables = await driver.listTables()
      expect(tables).toContain(renamed)
      expect(tables).not.toContain(tmp)

      await driver.dropTable(renamed)
      tables = await driver.listTables()
      expect(tables).not.toContain(renamed)
    })

    it('creates and drops a database', async () => {
      const db = `ddl_${kind}_${stamp}`
      await driver.createDatabase(db)
      expect(await driver.listDatabases()).toContain(db)
      await driver.runQuery(`DROP DATABASE ${db}`)
      expect(await driver.listDatabases()).not.toContain(db)
    })
  })
}
