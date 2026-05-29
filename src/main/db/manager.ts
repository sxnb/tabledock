import { randomUUID } from 'crypto'
import type { AnyDriver, ConnectionConfig } from './types'
import { MySqlDriver } from './drivers/mysql'
import { PostgresDriver } from './drivers/postgres'
import { SqliteDriver } from './drivers/sqlite'
import { RedisDriver } from './drivers/redis'

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

/** Registry of live connections keyed by an ephemeral session id. */
class ConnectionManager {
  private sessions = new Map<string, AnyDriver>()

  async open(config: ConnectionConfig): Promise<string> {
    const driver = createDriver(config)
    await driver.connect()
    const sessionId = randomUUID()
    this.sessions.set(sessionId, driver)
    return sessionId
  }

  /** Connect, validate, then immediately disconnect — used by "Test". */
  async test(config: ConnectionConfig): Promise<void> {
    const driver = createDriver(config)
    await driver.connect()
    await driver.disconnect()
  }

  get(sessionId: string): AnyDriver {
    const driver = this.sessions.get(sessionId)
    if (!driver) throw new Error('Session not found or disconnected')
    return driver
  }

  async close(sessionId: string): Promise<void> {
    const driver = this.sessions.get(sessionId)
    if (driver) {
      this.sessions.delete(sessionId)
      await driver.disconnect().catch(() => undefined)
    }
  }

  async closeAll(): Promise<void> {
    const drivers = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(drivers.map((d) => d.disconnect().catch(() => undefined)))
  }
}

export const connectionManager = new ConnectionManager()
