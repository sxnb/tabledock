import { randomUUID } from 'crypto'
import type { AnyDriver, ConnectionConfig, DriverKind } from './types'
import { MySqlDriver } from './drivers/mysql'
import { PostgresDriver } from './drivers/postgres'
import { SqliteDriver } from './drivers/sqlite'
import { RedisDriver } from './drivers/redis'
import { openTunnel, type Tunnel } from './tunnel'

function createDriver(config: ConnectionConfig): AnyDriver {
  switch (config.kind) {
    case 'mysql':
      return new MySqlDriver(config)
    case 'postgres':
      return new PostgresDriver(config)
    case 'sqlite':
      return new SqliteDriver(config)
    case 'redis':
      return new RedisDriver(config)
    default:
      throw new Error(`Unsupported connection kind: ${(config as ConnectionConfig).kind}`)
  }
}

const DEFAULT_PORTS: Record<DriverKind, number> = {
  mysql: 3306,
  postgres: 5432,
  redis: 6379,
  sqlite: 0
}

/**
 * When SSH tunneling is enabled, open the tunnel and return a config whose
 * host/port point at the local tunnel endpoint (so the driver connects through
 * SSH). Otherwise returns the config unchanged with no tunnel.
 */
async function withTunnel(
  config: ConnectionConfig
): Promise<{ config: ConnectionConfig; tunnel?: Tunnel }> {
  if (!config.ssh?.enabled || config.kind === 'sqlite') return { config }
  const dstHost = config.host || '127.0.0.1'
  const dstPort = config.port || DEFAULT_PORTS[config.kind]
  const tunnel = await openTunnel(config, dstHost, dstPort)
  return { config: { ...config, host: tunnel.host, port: tunnel.port }, tunnel }
}

interface Live {
  driver: AnyDriver
  tunnel?: Tunnel
}

/** Registry of live connections keyed by an ephemeral session id. */
class ConnectionManager {
  private sessions = new Map<string, Live>()

  async open(config: ConnectionConfig): Promise<string> {
    const { config: effective, tunnel } = await withTunnel(config)
    const driver = createDriver(effective)
    try {
      await driver.connect()
    } catch (err) {
      tunnel?.close()
      throw err
    }
    const sessionId = randomUUID()
    this.sessions.set(sessionId, { driver, tunnel })
    return sessionId
  }

  /** Connect, validate, then immediately tear down — used by "Test". */
  async test(config: ConnectionConfig): Promise<void> {
    const { config: effective, tunnel } = await withTunnel(config)
    const driver = createDriver(effective)
    try {
      await driver.connect()
      await driver.disconnect()
    } finally {
      tunnel?.close()
    }
  }

  get(sessionId: string): AnyDriver {
    const live = this.sessions.get(sessionId)
    if (!live) throw new Error('Session not found or disconnected')
    return live.driver
  }

  async close(sessionId: string): Promise<void> {
    const live = this.sessions.get(sessionId)
    if (live) {
      this.sessions.delete(sessionId)
      await live.driver.disconnect().catch(() => undefined)
      live.tunnel?.close()
    }
  }

  async closeAll(): Promise<void> {
    const all = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(
      all.map(async (live) => {
        await live.driver.disconnect().catch(() => undefined)
        live.tunnel?.close()
      })
    )
  }
}

export const connectionManager = new ConnectionManager()
