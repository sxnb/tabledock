import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgresDriver } from '../../src/main/db/drivers/postgres'
import { MySqlDriver } from '../../src/main/db/drivers/mysql'
import { RedisDriver } from '../../src/main/db/drivers/redis'
import type { ConnectionConfig, RelationalDriver } from '../../src/main/db/types'
import { testConfig, RELATIONAL_KINDS, type TestKind } from '../support/dbconfig'

function makeDriver(kind: TestKind, config: ConnectionConfig): RelationalDriver {
  return kind === 'postgres' ? new PostgresDriver(config) : new MySqlDriver(config)
}

// Read-only connections must refuse writes from the SQL editor, not just from
// the app's own edit actions. A writable connection sets up and inspects a
// scratch table; the read-only one tries to change it.
for (const kind of RELATIONAL_KINDS) {
  describe(`read-only ${kind} connection`, () => {
    let writer: RelationalDriver
    let reader: RelationalDriver
    const table = `ro_${kind}_${Date.now()}`

    const writes = [
      `INSERT INTO ${table} (id, label) VALUES (2, 'b')`,
      `UPDATE ${table} SET label = 'changed'`,
      `DELETE FROM ${table}`,
      `TRUNCATE TABLE ${table}`,
      `DROP TABLE ${table}`,
      `ALTER TABLE ${table} ADD COLUMN extra integer`,
      `CREATE TABLE ${table}_new (id integer)`,
      // The transaction is per call, and a call can't hold a second statement.
      `COMMIT; DELETE FROM ${table}`,
      ...(kind === 'postgres'
        ? [
            `WITH gone AS (DELETE FROM ${table} RETURNING *) SELECT * FROM gone`,
            `EXPLAIN ANALYZE DELETE FROM ${table}`
          ]
        : [])
    ]

    const expectUnchanged = async (): Promise<void> => {
      const tables = await writer.listTables()
      expect(tables).toContain(table)
      expect(tables).not.toContain(`${table}_new`)
      const res = await writer.getRows(table, { page: 1, pageSize: 10 })
      expect(res.columns).toEqual(['id', 'label'])
      expect(res.rows).toEqual([[1, 'a']])
    }

    beforeAll(async () => {
      writer = makeDriver(kind, testConfig(kind))
      await writer.connect()
      await writer.runQuery(`CREATE TABLE ${table} (id integer PRIMARY KEY, label text)`)
      await writer.runQuery(`INSERT INTO ${table} (id, label) VALUES (1, 'a')`)
      reader = makeDriver(kind, { ...testConfig(kind), readOnly: true })
      await reader.connect()
    })
    afterAll(async () => {
      await reader?.disconnect()
      await writer?.runQuery(`DROP TABLE IF EXISTS ${table}`)
      await writer?.disconnect()
    })

    it('runs SELECTs', async () => {
      const res = await reader.runQuery(`SELECT label FROM ${table}`)
      expect(res.rows).toEqual([['a']])
    })

    for (const sql of writes) {
      it(`refuses: ${sql.replace(table, '<table>')}`, async () => {
        await expect(reader.runQuery(sql)).rejects.toThrow()
        await expectUnchanged()
        // The failed call leaves nothing behind on the pooled connection.
        const res = await reader.runQuery(`SELECT label FROM ${table}`)
        expect(res.rows).toEqual([['a']])
      })
    }

    // Statements that would turn writes back on for whatever runs next.
    const switches = [
      'COMMIT',
      ...(kind === 'postgres'
        ? ['BEGIN READ WRITE', 'SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE']
        : ['START TRANSACTION READ WRITE', 'SET SESSION TRANSACTION READ WRITE'])
    ]

    for (const sql of switches) {
      it(`still refuses writes after: ${sql}`, async () => {
        await reader.runQuery(sql).catch(() => undefined)
        await expect(reader.runQuery(`DELETE FROM ${table}`)).rejects.toThrow()
        await expectUnchanged()
      })
    }
  })
}

describe('read-only redis connection', () => {
  let writer: RedisDriver
  let reader: RedisDriver
  const key = `ro:${Date.now()}`

  beforeAll(async () => {
    writer = new RedisDriver(testConfig('redis'))
    await writer.connect()
    await writer.runCommand(['SET', key, 'v'])
    reader = new RedisDriver({ ...testConfig('redis'), readOnly: true })
    await reader.connect()
  })
  afterAll(async () => {
    await reader?.disconnect()
    await writer?.runCommand(['DEL', key])
    await writer?.disconnect()
  })

  it('runs read commands, including read-only subcommands and scripts', async () => {
    expect(await reader.runCommand(['GET', key])).toBe('v')
    expect(await reader.runCommand(['get', key])).toBe('v')
    expect(await reader.runCommand(['OBJECT', 'ENCODING', key])).toBeTruthy()
    expect(await reader.runCommand(['CONFIG', 'GET', 'maxmemory'])).toHaveLength(2)
    expect(
      await reader.runCommand(['EVAL_RO', "return redis.call('GET', KEYS[1])", '1', key])
    ).toBe('v')
  })

  const writes = [
    ['SET', key, 'changed'],
    ['set', key, 'changed'],
    ['DEL', key],
    ['EXPIRE', key, '1'],
    ['FLUSHDB'],
    ['FLUSHALL'],
    ['XGROUP', 'CREATE', `${key}:stream`, 'g', '$', 'MKSTREAM'],
    ['FUNCTION', 'FLUSH'],
    ['EVAL', "return redis.call('DEL', KEYS[1])", '1', key]
  ]

  for (const args of writes) {
    it(`refuses: ${args.join(' ').replace(key, '<key>')}`, async () => {
      await expect(reader.runCommand(args)).rejects.toThrow(/read-only/)
      expect(await writer.runCommand(['GET', key])).toBe('v')
      expect(await writer.runCommand(['TTL', key])).toBe(-1)
    })
  }

  it('refuses commands Redis does not know', async () => {
    await expect(reader.runCommand(['NOSUCHCOMMAND'])).rejects.toThrow(/unknown command/)
  })
})
