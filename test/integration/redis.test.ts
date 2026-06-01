import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RedisDriver } from '../../src/main/db/drivers/redis'
import { testConfig } from '../support/dbconfig'

describe('redis driver', () => {
  let driver: RedisDriver

  beforeAll(async () => {
    driver = new RedisDriver(testConfig('redis'))
    await driver.connect()
    await driver.runCommand(['FLUSHDB'])
  })
  afterAll(async () => {
    await driver?.runCommand(['FLUSHDB'])
    await driver?.disconnect()
  })

  it('reads a string value with metadata', async () => {
    await driver.runCommand(['SET', 'str', 'hello'])
    const v = await driver.getKey('str')
    expect(v.type).toBe('string')
    expect(v.value).toBe('hello')
    expect(v.ttl).toBe(-1)
    expect(v.length).toBe(5)
    expect(v.encoding).toBeTruthy()
  })

  it('reads hash, set, and zset types', async () => {
    await driver.runCommand(['HSET', 'h', 'f1', 'v1', 'f2', 'v2'])
    await driver.runCommand(['SADD', 'st', 'a', 'b'])
    await driver.runCommand(['ZADD', 'z', '1', 'x', '2', 'y'])

    const hash = await driver.getKey('h')
    expect(hash.type).toBe('hash')
    expect((hash.value as Record<string, string>).f1).toBe('v1')

    expect((await driver.getKey('st')).type).toBe('set')

    const zset = await driver.getKey('z')
    expect(zset.type).toBe('zset')
    expect(zset.value).toEqual([
      { member: 'x', score: '1' },
      { member: 'y', score: '2' }
    ])
  })

  it('paginates a large list', async () => {
    const items = Array.from({ length: 250 }, (_, i) => `item-${i}`)
    await driver.runCommand(['RPUSH', 'big', ...items])

    const first = await driver.getKey('big')
    expect(first.length).toBe(250)
    expect((first.value as string[]).length).toBe(200)
    expect(first.cursor).toBe('200')

    const next = await driver.pageKey('big', first.cursor as string, 200)
    expect((next.value as string[]).length).toBe(50)
    expect(next.cursor).toBe('')
  })

  it('scans keys and reports DBSIZE', async () => {
    const scan = await driver.listKeys({ pattern: '*', cursor: '0', count: 100 })
    expect(scan.keys.map((k) => k.key)).toEqual(expect.arrayContaining(['str', 'h']))
    expect(await driver.dbSize()).toBeGreaterThan(0)
  })

  it('sets and clears a TTL', async () => {
    await driver.setKeyTtl('str', 100)
    const withTtl = await driver.getKey('str')
    expect(withTtl.ttl).toBeGreaterThan(0)
    expect(withTtl.ttl).toBeLessThanOrEqual(100)

    await driver.setKeyTtl('str', null)
    expect((await driver.getKey('str')).ttl).toBe(-1)
  })

  it('renames and deletes a key', async () => {
    await driver.runCommand(['SET', 'rn', 'v'])
    await driver.renameKey('rn', 'rn2')
    expect((await driver.getKey('rn2')).value).toBe('v')
    expect((await driver.getKey('rn')).type).toBe('none')

    await driver.deleteKey('rn2')
    expect((await driver.getKey('rn2')).type).toBe('none')
  })
})
