import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MongoDriver } from '../../src/main/db/drivers/mongo'
import { testConfig, TEST_DB } from '../support/dbconfig'

describe('mongo driver', () => {
  let driver: MongoDriver
  const stamp = Date.now()

  beforeAll(async () => {
    driver = new MongoDriver(testConfig('mongodb'))
    await driver.connect()
  })
  afterAll(async () => {
    await driver?.disconnect()
  })

  it('lists the seeded database and collections', async () => {
    expect(await driver.listDatabases()).toContain(TEST_DB)
    expect(await driver.listCollections(TEST_DB)).toContain('users')
  })

  it('finds with filter, sort, and projection', async () => {
    const all = await driver.find(TEST_DB, 'users', { filter: '{}', page: 1, pageSize: 10 })
    expect(all.total).toBe(3)

    const filtered = await driver.find(TEST_DB, 'users', {
      filter: '{ "name": "Bob" }',
      page: 1,
      pageSize: 10
    })
    expect(filtered.total).toBe(1)

    const sorted = await driver.find(TEST_DB, 'users', {
      filter: '{}',
      sort: '{ "age": -1 }',
      page: 1,
      pageSize: 10
    })
    const top = JSON.parse(sorted.documents[0].json)
    expect(top.name).toBe('Carol') // age 41

    const projected = await driver.find(TEST_DB, 'users', {
      filter: '{}',
      projection: '{ "name": 1 }',
      page: 1,
      pageSize: 1
    })
    const doc = JSON.parse(projected.documents[0].json)
    expect(doc.name).toBeDefined()
    expect(doc.age).toBeUndefined()
  })

  it('runs an aggregation pipeline', async () => {
    const res = await driver.aggregate(
      TEST_DB,
      'users',
      '[{ "$group": { "_id": "$active", "n": { "$sum": 1 } } }]'
    )
    expect(res.documents).toHaveLength(2) // active true / false
  })

  it('reports stats and indexes', async () => {
    const stats = await driver.collectionStats(TEST_DB, 'users')
    expect(stats.count).toBe(3)
    expect(stats.indexCount).toBeGreaterThanOrEqual(2) // _id + email unique

    const indexes = await driver.listIndexes(TEST_DB, 'users')
    expect(indexes.map((i) => i.name)).toContain('_id_')
  })

  it('creates and drops an index', async () => {
    const coll = `idx_${stamp}`
    await driver.createCollection(TEST_DB, coll)
    await driver.createIndex(TEST_DB, coll, '{ "name": 1 }', { unique: false, name: 'name_idx' })
    expect((await driver.listIndexes(TEST_DB, coll)).map((i) => i.name)).toContain('name_idx')
    await driver.dropIndex(TEST_DB, coll, 'name_idx')
    expect((await driver.listIndexes(TEST_DB, coll)).map((i) => i.name)).not.toContain('name_idx')
    await driver.dropCollection(TEST_DB, coll)
  })

  it('inserts, updates, and deletes a document', async () => {
    const coll = `crud_${stamp}`
    await driver.createCollection(TEST_DB, coll)
    await driver.insertDocument(TEST_DB, coll, '{ "x": 1 }')

    let res = await driver.find(TEST_DB, coll, { filter: '{}', page: 1, pageSize: 10 })
    expect(res.total).toBe(1)
    const id = res.documents[0].id

    await driver.updateDocument(TEST_DB, coll, id, '{ "x": 2 }')
    res = await driver.find(TEST_DB, coll, { filter: '{}', page: 1, pageSize: 10 })
    expect(JSON.parse(res.documents[0].json).x).toBe(2)

    await driver.deleteDocument(TEST_DB, coll, id)
    res = await driver.find(TEST_DB, coll, { filter: '{}', page: 1, pageSize: 10 })
    expect(res.total).toBe(0)

    await driver.dropCollection(TEST_DB, coll)
  })

  it('creates, renames, and drops a collection', async () => {
    const coll = `mgmt_${stamp}`
    const renamed = `${coll}_r`
    await driver.createCollection(TEST_DB, coll)
    expect(await driver.listCollections(TEST_DB)).toContain(coll)
    await driver.renameCollection(TEST_DB, coll, renamed)
    expect(await driver.listCollections(TEST_DB)).toContain(renamed)
    await driver.dropCollection(TEST_DB, renamed)
    expect(await driver.listCollections(TEST_DB)).not.toContain(renamed)
  })
})
