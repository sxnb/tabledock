import type { ConnectionConfig, DriverKind } from '../../src/shared/types'

/**
 * Connection details for the Docker test databases (see test/docker-compose.yml).
 * Host/ports are overridable via env so the same configs work locally and, later,
 * in CI. Shared by the Vitest integration suite and the Playwright E2E suite.
 */
export const TEST_DB = 'tabledock_test'

const host = process.env.TABLEDOCK_TEST_HOST || '127.0.0.1'
const port = (envVar: string, fallback: number): number => Number(process.env[envVar] || fallback)

type TestKind = 'postgres' | 'mysql' | 'mariadb' | 'mongodb' | 'redis'

const PARAMS: Record<TestKind, ConnectionConfig> = {
  postgres: {
    id: 'test-postgres',
    name: 'Test Postgres',
    kind: 'postgres',
    host,
    port: port('TABLEDOCK_PG_PORT', 55432),
    user: 'tabledock',
    password: 'tabledock',
    database: TEST_DB
  },
  mysql: {
    id: 'test-mysql',
    name: 'Test MySQL',
    kind: 'mysql',
    host,
    port: port('TABLEDOCK_MYSQL_PORT', 53306),
    user: 'root',
    password: 'tabledock',
    database: TEST_DB
  },
  mariadb: {
    id: 'test-mariadb',
    name: 'Test MariaDB',
    kind: 'mariadb',
    host,
    port: port('TABLEDOCK_MARIADB_PORT', 53307),
    user: 'root',
    password: 'tabledock',
    database: TEST_DB
  },
  mongodb: {
    id: 'test-mongo',
    name: 'Test MongoDB',
    kind: 'mongodb',
    host,
    port: port('TABLEDOCK_MONGO_PORT', 57017),
    database: TEST_DB
  },
  redis: {
    id: 'test-redis',
    name: 'Test Redis',
    kind: 'redis',
    host,
    port: port('TABLEDOCK_REDIS_PORT', 56379),
    redisDb: 0
  }
}

/** Full ConnectionConfig for a test database kind. */
export function testConfig(kind: TestKind): ConnectionConfig {
  return { ...PARAMS[kind] }
}

export const RELATIONAL_KINDS: TestKind[] = ['postgres', 'mysql', 'mariadb']
export type { TestKind, DriverKind }
