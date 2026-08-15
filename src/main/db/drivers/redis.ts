import Redis from 'ioredis'
import { buildTls } from '../ssl'
import { chunked } from '../dump'
import type {
  ConnectionConfig,
  RedisDriverApi,
  RedisScanResult,
  RedisValue,
  RedisValuePage
} from '../types'

const PAGE_SIZE = 200

/** Elements per emitted command when dumping a list/set/zset/hash. */
const DUMP_ELEMENTS = 500

/** Quote a value as a double-quoted Redis command argument. */
function q(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

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
    if (type === 'string') {
      const meta = await this.keyMeta(key)
      return { type, value: await this.handle.get(key), ...meta }
    }
    // Collections: load the first page plus metadata.
    const [meta, page] = await Promise.all([this.keyMeta(key), this.readPage(key, type, '')])
    return { type, value: page.value, cursor: page.cursor, ...meta }
  }

  /** Fetch the next page of a collection key (list/set/hash/zset). */
  async pageKey(key: string, cursor: string, count: number): Promise<RedisValuePage> {
    const type = await this.handle.type(key)
    return this.readPage(key, type, cursor, count)
  }

  /**
   * Read one page of a collection. Lists/zsets page by index range; sets/hashes
   * page with SSCAN/HSCAN cursors. An empty cursor means "from the start" on the
   * way in and "no more pages" on the way out.
   */
  private async readPage(
    key: string,
    type: string,
    cursor: string,
    count = PAGE_SIZE
  ): Promise<RedisValuePage> {
    switch (type) {
      case 'list': {
        const start = cursor ? Number(cursor) : 0
        const items = await this.handle.lrange(key, start, start + count - 1)
        const next = start + items.length
        const len = await this.handle.llen(key)
        return { value: items, cursor: next < len ? String(next) : '' }
      }
      case 'set': {
        const [nc, members] = await this.handle.sscan(key, cursor || '0', 'COUNT', count)
        return { value: members, cursor: nc === '0' ? '' : nc }
      }
      case 'zset': {
        const start = cursor ? Number(cursor) : 0
        const flat = await this.handle.zrange(key, start, start + count - 1, 'WITHSCORES')
        const pairs: { member: string; score: string }[] = []
        for (let i = 0; i < flat.length; i += 2) pairs.push({ member: flat[i], score: flat[i + 1] })
        const next = start + pairs.length
        const len = await this.handle.zcard(key)
        return { value: pairs, cursor: next < len ? String(next) : '' }
      }
      case 'hash': {
        const [nc, flat] = await this.handle.hscan(key, cursor || '0', 'COUNT', count)
        const obj: Record<string, string> = {}
        for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1]
        return { value: obj, cursor: nc === '0' ? '' : nc }
      }
      default:
        return { value: `(unsupported type: ${type})`, cursor: '' }
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

  async deleteKey(key: string): Promise<void> {
    await this.handle.del(key)
  }

  async renameKey(key: string, newKey: string): Promise<void> {
    await this.handle.rename(key, newKey)
  }

  /** Set a TTL in seconds, or pass null to persist the key (remove expiry). */
  async setKeyTtl(key: string, seconds: number | null): Promise<void> {
    if (seconds == null) {
      await this.handle.persist(key)
    } else if (seconds > 0) {
      await this.handle.expire(key, seconds)
    } else {
      throw new Error('TTL must be a positive number of seconds')
    }
  }

  async runCommand(args: string[]): Promise<unknown> {
    if (args.length === 0) throw new Error('Empty command')
    const [cmd, ...rest] = args
    // ioredis exposes arbitrary commands via call().
    return this.handle.call(cmd, ...rest)
  }

  dumpKeyspace(): AsyncIterable<string> {
    return chunked(this.dumpCommands())
  }

  /**
   * Emit the keyspace one command at a time. Collections are read and written in
   * `DUMP_ELEMENTS` slices: RPUSH/SADD/ZADD/HSET all append, so a large key
   * simply becomes several commands rather than one unbounded line.
   */
  private async *dumpCommands(): AsyncGenerator<string> {
    let cursor = '0'
    do {
      const [next, keys] = await this.handle.scan(cursor, 'COUNT', 500)
      cursor = next
      for (const key of keys) {
        const type = await this.handle.type(key)
        if (type === 'string') {
          yield `SET ${q(key)} ${q((await this.handle.get(key)) ?? '')}\n`
        } else if (type === 'list') {
          for (let i = 0; ; i += DUMP_ELEMENTS) {
            const vals = await this.handle.lrange(key, i, i + DUMP_ELEMENTS - 1)
            if (!vals.length) break
            yield `RPUSH ${q(key)} ${vals.map(q).join(' ')}\n`
          }
        } else if (type === 'set') {
          let sc = '0'
          do {
            const [nextSc, members] = await this.handle.sscan(key, sc, 'COUNT', DUMP_ELEMENTS)
            sc = nextSc
            if (members.length) yield `SADD ${q(key)} ${members.map(q).join(' ')}\n`
          } while (sc !== '0')
        } else if (type === 'zset') {
          for (let i = 0; ; i += DUMP_ELEMENTS) {
            const flat = await this.handle.zrange(key, i, i + DUMP_ELEMENTS - 1, 'WITHSCORES')
            if (!flat.length) break
            const pairs: string[] = []
            for (let j = 0; j < flat.length; j += 2) pairs.push(`${flat[j + 1]} ${q(flat[j])}`)
            yield `ZADD ${q(key)} ${pairs.join(' ')}\n`
          }
        } else if (type === 'hash') {
          let hc = '0'
          do {
            const [nextHc, flat] = await this.handle.hscan(key, hc, 'COUNT', DUMP_ELEMENTS)
            hc = nextHc
            const fv: string[] = []
            for (let j = 0; j < flat.length; j += 2) fv.push(`${q(flat[j])} ${q(flat[j + 1])}`)
            if (fv.length) yield `HSET ${q(key)} ${fv.join(' ')}\n`
          } while (hc !== '0')
        }
      }
    } while (cursor !== '0')
  }
}
