import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PostgresDriver } from '../../src/main/db/drivers/postgres'
import { MySqlDriver } from '../../src/main/db/drivers/mysql'
import { MongoDriver } from '../../src/main/db/drivers/mongo'
import { RedisDriver } from '../../src/main/db/drivers/redis'
import { DUMP_CHUNK_CHARS } from '../../src/main/db/dump'
import type { RelationalDriver } from '../../src/main/db/types'
import { testConfig, RELATIONAL_KINDS } from '../support/dbconfig'

/** Rows × row size chosen to spill well past one chunk without being slow to seed. */
const BULK_ROWS = 20000
const BULK_TEXT = 300

async function collect(chunks: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = []
  for await (const chunk of chunks) out.push(chunk)
  return out
}

for (const kind of RELATIONAL_KINDS) {
  describe(`dump: ${kind}`, () => {
    let driver: RelationalDriver
    const bulk = `dump_bulk_${Date.now()}`
    const quirky = `dump_quirky_${Date.now()}`

    beforeAll(async () => {
      driver =
        kind === 'postgres'
          ? new PostgresDriver(testConfig(kind))
          : new MySqlDriver(testConfig(kind))
      await driver.connect()

      await driver.runQuery(`CREATE TABLE ${bulk} (id INT PRIMARY KEY, body VARCHAR(400))`)
      const body = 'x'.repeat(BULK_TEXT)
      for (let start = 0; start < BULK_ROWS; start += 2000) {
        const values = Array.from(
          { length: Math.min(2000, BULK_ROWS - start) },
          (_, i) => `(${start + i}, '${body}')`
        ).join(', ')
        await driver.runQuery(`INSERT INTO ${bulk} (id, body) VALUES ${values}`)
      }

      // Values a dump has to escape correctly.
      await driver.runQuery(`CREATE TABLE ${quirky} (id INT PRIMARY KEY, note VARCHAR(200))`)
      await driver.insertRow(quirky, { values: { id: 1, note: 'O\'Brien said "hi"' } })
      await driver.insertRow(quirky, { values: { id: 2, note: 'multi\nline — ünïcode' } })
      await driver.insertRow(quirky, { values: { id: 3, note: null } })
    })

    afterAll(async () => {
      await driver?.runQuery(`DROP TABLE IF EXISTS ${bulk}`).catch(() => {})
      await driver?.runQuery(`DROP TABLE IF EXISTS ${quirky}`).catch(() => {})
      await driver?.disconnect()
    })

    it('streams the dump in bounded chunks instead of one huge string', async () => {
      const chunks = await collect(driver.dumpDatabase())

      // The bulk table alone is ~7 MB of SQL, so a correct dump must arrive in
      // pieces; the pre-fix version built one string and blew V8's 512 MB cap.
      expect(chunks.length).toBeGreaterThan(1)
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(DUMP_CHUNK_CHARS * 2)
      }
    })

    it('dumps every row of a large table exactly once', async () => {
      const sql = (await collect(driver.dumpDatabase())).join('')
      const inserts = sql.match(new RegExp(`INSERT INTO [^\\n]*${bulk}[^\\n]*`, 'g')) ?? []
      expect(inserts).toHaveLength(BULK_ROWS)
      expect(sql.length).toBeGreaterThan(DUMP_CHUNK_CHARS)
    })

    it('includes the seeded tables and their data', async () => {
      const sql = (await collect(driver.dumpDatabase())).join('')
      expect(sql).toContain('alice@example.com')
      expect(sql).toContain('Hello world')
      expect(sql).toMatch(/INSERT INTO .*users/)
      expect(sql).toMatch(/INSERT INTO .*posts/)
    })

    it('escapes quotes, newlines, unicode, and NULLs', async () => {
      const sql = (await collect(driver.dumpDatabase())).join('')
      // Statements can span lines — a dumped value may contain a newline.
      const rows = sql.match(new RegExp(`INSERT INTO [^\\n]*${quirky}[\\s\\S]*?\\);`, 'g')) ?? []
      expect(rows).toHaveLength(3)
      expect(rows[0]).toContain("'O''Brien said \"hi\"'")
      expect(rows[1]).toContain("'multi\nline — ünïcode'")
      expect(rows[2]).toMatch(/NULL\);$/)
    })

    it('includes DROP TABLE + CREATE TABLE by default', async () => {
      const sql = (await collect(driver.dumpDatabase())).join('')
      expect(sql).toMatch(new RegExp(`DROP TABLE IF EXISTS[^\\n]*${quirky}`))
      expect(sql).toMatch(new RegExp(`CREATE TABLE[^\\n]*${quirky}`))
      expect(sql).toMatch(/CREATE TABLE[^\n]*users/)
      expect(sql).toMatch(/CREATE TABLE[^\n]*posts/)
    })

    it('omits all DDL when includeSchema is false', async () => {
      const sql = (await collect(driver.dumpDatabase(undefined, { includeSchema: false }))).join('')
      expect(sql).not.toMatch(/CREATE TABLE/i)
      expect(sql).not.toMatch(/DROP TABLE/i)
      // The data is still there.
      expect(sql).toContain('alice@example.com')
      expect(sql).toMatch(/INSERT INTO .*users/)
    })

    it('describes the seeded columns and primary key in the DDL', async () => {
      const sql = (await collect(driver.dumpDatabase())).join('')
      const create = sql.match(/CREATE TABLE[^\n]*users[\s\S]*?;/)?.[0] ?? ''
      expect(create).toBeTruthy()
      expect(create).toMatch(/email/)
      expect(create).toMatch(/name/)
      expect(create).toMatch(/PRIMARY KEY/i)
      expect(create).toMatch(/NOT NULL/i)
    })

    it('backs an auto-increment column with a sequence the dump also creates', async () => {
      const table = `dump_ddl_${Date.now()}`
      const create =
        kind === 'postgres'
          ? `CREATE TABLE ${table} (id serial PRIMARY KEY, label varchar(50) NOT NULL)`
          : `CREATE TABLE ${table} (id INT AUTO_INCREMENT PRIMARY KEY, label varchar(50) NOT NULL)`
      await driver.runQuery(create)

      try {
        const sql = (await collect(driver.dumpDatabase())).join('')
        const ddl = sql.match(new RegExp(`CREATE TABLE[^\\n]*${table}[\\s\\S]*?;\\n`))?.[0]
        expect(ddl).toBeTruthy()
        expect(ddl).toMatch(/label/)
        expect(ddl).toMatch(/PRIMARY KEY/i)

        if (kind === 'postgres') {
          // The column keeps its real nextval() default, so the sequence name is
          // preserved — which only works because the dump creates it beforehand.
          expect(ddl).toMatch(new RegExp(`nextval\\('${table}_id_seq'`))
          expect(sql).toMatch(new RegExp(`CREATE SEQUENCE "${table}_id_seq"`))
          expect(sql.indexOf(`CREATE SEQUENCE "${table}_id_seq"`)).toBeLessThan(
            sql.indexOf(ddl as string)
          )
          expect(sql).toMatch(new RegExp(`setval\\('public\\.${table}_id_seq'`))
        } else {
          expect(ddl).toMatch(/AUTO_INCREMENT/i)
        }
      } finally {
        await driver.runQuery(`DROP TABLE IF EXISTS ${table}`).catch(() => {})
      }
    })

    it('honours includeCreateDatabase', async () => {
      const withCreate = (
        await collect(driver.dumpDatabase(undefined, { includeCreateDatabase: true }))
      ).join('')
      expect(withCreate).toMatch(/CREATE DATABASE/i)

      const without = (await collect(driver.dumpDatabase())).join('')
      expect(without).not.toMatch(/CREATE DATABASE/i)
    })

    it('leaves the pool usable after a dump', async () => {
      await collect(driver.dumpDatabase())
      await collect(driver.dumpDatabase())
      const res = await driver.getRows('users', { page: 1, pageSize: 10 })
      expect(res.total).toBe(3)
    })
  })
}

describe('dump: mongodb', () => {
  let driver: MongoDriver
  const big = 'dump_bulk'

  beforeAll(async () => {
    driver = new MongoDriver(testConfig('mongodb'))
    await driver.connect()
    for (let i = 0; i < 4000; i++) {
      await driver.insertDocument(
        'tabledock_test',
        big,
        JSON.stringify({ n: i, body: 'x'.repeat(BULK_TEXT) })
      )
    }
  }, 120000)

  afterAll(async () => {
    await driver?.dropCollection('tabledock_test', big).catch(() => {})
    await driver?.disconnect()
  })

  it('streams collections in bounded chunks', async () => {
    const chunks = await collect(driver.dumpJson('tabledock_test'))
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(DUMP_CHUNK_CHARS * 2)
    }
  })

  it('emits a parseable JSON array per collection', async () => {
    const text = (await collect(driver.dumpJson('tabledock_test'))).join('')
    expect(text).toContain('// collection: users')

    // Each "// collection: x" header is followed by a self-contained array.
    const blocks = text.split(/\/\/ collection: \w+\n/).slice(1)
    expect(blocks.length).toBeGreaterThanOrEqual(2)
    const counts = blocks.map((block) => JSON.parse(block.trim()).length)
    expect(counts).toContain(3) // seeded users
    expect(counts).toContain(4000) // bulk collection
  })
})

describe('dump: redis', () => {
  let driver: RedisDriver

  beforeAll(async () => {
    driver = new RedisDriver(testConfig('redis'))
    await driver.connect()
    await driver.runCommand(['FLUSHDB'])
    await driver.runCommand(['SET', 'greeting', 'hello "world"'])
    await driver.runCommand(['HSET', 'h', 'f1', 'v1', 'f2', 'v2'])
    await driver.runCommand(['SADD', 'st', 'a', 'b'])
    await driver.runCommand(['ZADD', 'z', '1', 'x', '2', 'y'])
    // Larger than DUMP_ELEMENTS so it has to span several commands.
    const items = Array.from({ length: 1200 }, (_, i) => `item-${i}`)
    await driver.runCommand(['RPUSH', 'big', ...items])
  })

  afterAll(async () => {
    await driver?.runCommand(['FLUSHDB'])
    await driver?.disconnect()
  })

  it('emits one command per key type', async () => {
    const text = (await collect(driver.dumpKeyspace())).join('')
    expect(text).toContain('SET "greeting" "hello \\"world\\""')
    expect(text).toMatch(/HSET "h" /)
    expect(text).toMatch(/SADD "st" /)
    expect(text).toMatch(/ZADD "z" /)
  })

  it('splits a large collection across appending commands', async () => {
    const text = (await collect(driver.dumpKeyspace())).join('')
    const pushes = text.match(/^RPUSH "big" .*$/gm) ?? []
    expect(pushes.length).toBeGreaterThan(1)

    // Replaying the commands in order must rebuild the list exactly.
    const replayed = pushes.flatMap((line) =>
      (line.match(/"item-\d+"/g) ?? []).map((v) => v.slice(1, -1))
    )
    expect(replayed).toHaveLength(1200)
    expect(replayed[0]).toBe('item-0')
    expect(replayed[1199]).toBe('item-1199')
  })
})
