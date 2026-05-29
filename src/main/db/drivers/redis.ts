import Redis from 'ioredis'
import type { ConnectionConfig, RedisDriverApi, RedisScanResult, RedisValue } from '../types'

export class RedisDriver implements RedisDriverApi {
  readonly kind = 'redis' as const
  private client: Redis | null = null

  constructor(private readonly config: ConnectionConfig) {}

  async connect(): Promise<void> {
    this.client = new Redis({
      host: this.config.host || '127.0.0.1',
      port: this.config.port || 6379,
      password: this.config.password || undefined,
      db: this.config.redisDb || 0,
      lazyConnect: true,
      maxRetriesPerRequest: 1
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
    switch (type) {
      case 'string':
        return { type, value: await this.handle.get(key) }
      case 'list':
        return { type, value: await this.handle.lrange(key, 0, -1) }
      case 'set':
        return { type, value: await this.handle.smembers(key) }
      case 'zset': {
        const flat = await this.handle.zrange(key, 0, -1, 'WITHSCORES')
        const pairs: { member: string; score: string }[] = []
        for (let i = 0; i < flat.length; i += 2) {
          pairs.push({ member: flat[i], score: flat[i + 1] })
        }
        return { type, value: pairs }
      }
      case 'hash':
        return { type, value: await this.handle.hgetall(key) }
      case 'none':
        return { type: 'none', value: null }
      default:
        return { type, value: `(unsupported type: ${type})` }
    }
  }

  async runCommand(args: string[]): Promise<unknown> {
    if (args.length === 0) throw new Error('Empty command')
    const [cmd, ...rest] = args
    // ioredis exposes arbitrary commands via call().
    return this.handle.call(cmd, ...rest)
  }
}
