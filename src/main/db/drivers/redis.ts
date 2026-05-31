import Redis from 'ioredis'
import { buildTls } from '../ssl'
import type { ConnectionConfig, RedisDriverApi, RedisScanResult, RedisValue } from '../types'

export class RedisDriver implements RedisDriverApi {
  readonly kind = 'redis' as const
  private client: Redis | null = null

  constructor(private readonly config: ConnectionConfig) {}

  async connect(): Promise<void> {
    const tls = buildTls(this.config)
    this.client = new Redis({
      host: this.config.host || '127.0.0.1',
      port: this.config.port || 6379,
      password: this.config.password || undefined,
      db: this.config.redisDb || 0,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      ...(tls ? { tls } : {})
    })
    await this.client.connect()
    // Validate connection.
    await this.client.ping()
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      this.client.disconnect()
      this.client = null
    }
  }

  private get handle(): Redis {
    if (!this.client) throw new Error('Not connected')
    return this.client
  }

  async selectDb(index: number): Promise<void> {
    await this.handle.select(index)
  }

  async listKeys(opts: {
    pattern: string
    cursor: string
    count: number
  }): Promise<RedisScanResult> {
    const [nextCursor, keys] = await this.handle.scan(
      opts.cursor,
      'MATCH',
      opts.pattern || '*',
      'COUNT',
      opts.count || 200
    )
    const infos = await Promise.all(
      keys.map(async (key) => ({ key, type: await this.handle.type(key) }))
    )
    return { cursor: nextCursor, keys: infos }
  }

  async getKey(key: string): Promise<RedisValue> {
    const type = await this.handle.type(key)
    if (type === 'none') return { type: 'none', value: null }

    const meta = await this.keyMeta(key)
    switch (type) {
      case 'string':
        return { type, value: await this.handle.get(key), ...meta }
      case 'list':
        return { type, value: await this.handle.lrange(key, 0, -1), ...meta }
      case 'set':
        return { type, value: await this.handle.smembers(key), ...meta }
      case 'zset': {
        const flat = await this.handle.zrange(key, 0, -1, 'WITHSCORES')
        const pairs: { member: string; score: string }[] = []
        for (let i = 0; i < flat.length; i += 2) {
          pairs.push({ member: flat[i], score: flat[i + 1] })
        }
        return { type, value: pairs, ...meta }
      }
      case 'hash':
        return { type, value: await this.handle.hgetall(key), ...meta }
      default:
        return { type, value: `(unsupported type: ${type})`, ...meta }
    }
  }

  /** TTL, memory footprint, encoding, and element count for a key. */
  private async keyMeta(
    key: string
  ): Promise<{ ttl: number; memoryBytes?: number; encoding?: string; length?: number }> {
    const [ttl, memory, encoding, length] = await Promise.all([
      this.handle.ttl(key),
      this.handle.memory('USAGE', key).catch(() => null),
      this.handle.object('ENCODING', key).catch(() => null),
      this.elementCount(key).catch(() => undefined)
    ])
    return {
      ttl,
      memoryBytes: typeof memory === 'number' ? memory : undefined,
      encoding: typeof encoding === 'string' ? encoding : undefined,
      length
    }
  }

  private async elementCount(key: string): Promise<number | undefined> {
    const type = await this.handle.type(key)
    switch (type) {
      case 'list':
        return this.handle.llen(key)
      case 'set':
        return this.handle.scard(key)
      case 'zset':
        return this.handle.zcard(key)
      case 'hash':
        return this.handle.hlen(key)
      case 'string':
        return this.handle.strlen(key)
      default:
        return undefined
    }
  }

  async dbSize(): Promise<number> {
    return this.handle.dbsize()
  }

  async runCommand(args: string[]): Promise<unknown> {
    if (args.length === 0) throw new Error('Empty command')
    const [cmd, ...rest] = args
    // ioredis exposes arbitrary commands via call().
    return this.handle.call(cmd, ...rest)
  }

  async dumpKeyspace(): Promise<string> {
    const q = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    const lines: string[] = []
    let cursor = '0'
    do {
      const [next, keys] = await this.handle.scan(cursor, 'COUNT', 500)
      cursor = next
      for (const key of keys) {
        const type = await this.handle.type(key)
        if (type === 'string') {
          lines.push(`SET ${q(key)} ${q((await this.handle.get(key)) ?? '')}`)
        } else if (type === 'list') {
          const vals = await this.handle.lrange(key, 0, -1)
          if (vals.length) lines.push(`RPUSH ${q(key)} ${vals.map(q).join(' ')}`)
        } else if (type === 'set') {
          const members = await this.handle.smembers(key)
          if (members.length) lines.push(`SADD ${q(key)} ${members.map(q).join(' ')}`)
        } else if (type === 'zset') {
          const flat = await this.handle.zrange(key, 0, -1, 'WITHSCORES')
          const pairs: string[] = []
          for (let i = 0; i < flat.length; i += 2) pairs.push(`${flat[i + 1]} ${q(flat[i])}`)
          if (pairs.length) lines.push(`ZADD ${q(key)} ${pairs.join(' ')}`)
        } else if (type === 'hash') {
          const hash = await this.handle.hgetall(key)
          const fv = Object.entries(hash).map(([f, v]) => `${q(f)} ${q(v)}`)
          if (fv.length) lines.push(`HSET ${q(key)} ${fv.join(' ')}`)
        }
      }
    } while (cursor !== '0')
    return lines.join('\n') + '\n'
  }
}
