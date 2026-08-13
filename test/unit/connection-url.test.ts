import { describe, it, expect } from 'vitest'
import { parseConnectionUrl } from '../../src/shared/connection-url'

describe('parseConnectionUrl', () => {
  it('parses a full PostgreSQL URL', () => {
    expect(parseConnectionUrl('postgresql://alice:s3cret@db.example.com:6432/shop')).toEqual({
      kind: 'postgres',
      host: 'db.example.com',
      port: 6432,
      user: 'alice',
      password: 's3cret',
      database: 'shop'
    })
  })

  it('parses a full MySQL URL', () => {
    expect(parseConnectionUrl('mysql://root:pw@127.0.0.1:3307/app')).toEqual({
      kind: 'mysql',
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'pw',
      database: 'app'
    })
  })

  it('maps every supported scheme to its kind', () => {
    expect(parseConnectionUrl('postgres://h/d').kind).toBe('postgres')
    expect(parseConnectionUrl('postgresql://h/d').kind).toBe('postgres')
    expect(parseConnectionUrl('mysql://h/d').kind).toBe('mysql')
    expect(parseConnectionUrl('mariadb://h/d').kind).toBe('mariadb')
  })

  it('falls back to the default port for the scheme', () => {
    expect(parseConnectionUrl('postgres://h/d').port).toBe(5432)
    expect(parseConnectionUrl('mysql://h/d').port).toBe(3306)
    expect(parseConnectionUrl('mariadb://h/d').port).toBe(3306)
  })

  it('defaults the host when the URL omits it', () => {
    expect(parseConnectionUrl('postgresql:///mydb')).toEqual({
      kind: 'postgres',
      host: '127.0.0.1',
      port: 5432,
      database: 'mydb'
    })
  })

  it('omits user, password, and database when absent', () => {
    expect(parseConnectionUrl('postgres://db.example.com')).toEqual({
      kind: 'postgres',
      host: 'db.example.com',
      port: 5432
    })
  })

  it('decodes percent-encoded credentials', () => {
    const parsed = parseConnectionUrl('postgres://us%40er:p%40ss%2Fword@h:5432/my%20db')
    expect(parsed.user).toBe('us@er')
    expect(parsed.password).toBe('p@ss/word')
    expect(parsed.database).toBe('my db')
  })

  it('unwraps an IPv6 host', () => {
    expect(parseConnectionUrl('postgres://[::1]:5432/d').host).toBe('::1')
  })

  it('tolerates surrounding shell quotes and whitespace', () => {
    const parsed = parseConnectionUrl('  "postgres://h:5432/d"  ')
    expect(parsed.host).toBe('h')
    expect(parsed.database).toBe('d')
  })

  it('ignores unrelated query parameters', () => {
    const parsed = parseConnectionUrl(
      'postgres://h/d?application_name=tabledock&connect_timeout=10&pool_max=5'
    )
    expect(parsed).toEqual({ kind: 'postgres', host: 'h', port: 5432, database: 'd' })
  })

  describe('query-parameter fallbacks', () => {
    it('reads settings libpq allows as parameters', () => {
      expect(
        parseConnectionUrl('postgresql:///?host=pg.internal&port=6000&dbname=reports&user=bob')
      ).toEqual({
        kind: 'postgres',
        host: 'pg.internal',
        port: 6000,
        user: 'bob',
        database: 'reports'
      })
    })

    it('lets the URL itself win over the parameter', () => {
      const parsed = parseConnectionUrl(
        'postgres://carol@real.host:5432/realdb?host=other&dbname=otherdb&user=eve'
      )
      expect(parsed.host).toBe('real.host')
      expect(parsed.database).toBe('realdb')
      expect(parsed.user).toBe('carol')
    })
  })

  describe('TLS', () => {
    it('enables TLS for modes that require it', () => {
      for (const mode of ['require', 'verify-ca', 'verify-full', 'VERIFY_IDENTITY', 'REQUIRED']) {
        expect(parseConnectionUrl(`postgres://h/d?sslmode=${mode}`).ssl).toEqual({ enabled: true })
      }
    })

    it('leaves TLS off for fallback and disabled modes', () => {
      for (const mode of ['disable', 'disabled', 'prefer', 'allow']) {
        expect(parseConnectionUrl(`postgres://h/d?sslmode=${mode}`).ssl).toEqual({ enabled: false })
      }
    })

    it('accepts the MySQL and PlanetScale spellings', () => {
      expect(parseConnectionUrl('mysql://h/d?ssl-mode=REQUIRED').ssl).toEqual({ enabled: true })
      expect(parseConnectionUrl('mysql://h/d?sslaccept=strict').ssl).toEqual({ enabled: true })
      expect(parseConnectionUrl('mysql://h/d?ssl=true').ssl).toEqual({ enabled: true })
      expect(parseConnectionUrl('mysql://h/d?ssl=false').ssl).toEqual({ enabled: false })
    })

    it('picks up certificate paths and turns TLS on', () => {
      const parsed = parseConnectionUrl(
        'postgres://h/d?sslrootcert=/certs/ca.pem&sslcert=/certs/client.pem&sslkey=/certs/client.key'
      )
      expect(parsed.ssl).toEqual({
        enabled: true,
        ca: '/certs/ca.pem',
        cert: '/certs/client.pem',
        key: '/certs/client.key'
      })
    })

    it('keeps certificate paths when a mode is given too', () => {
      const parsed = parseConnectionUrl('mysql://h/d?ssl-mode=VERIFY_CA&ssl-ca=/certs/ca.pem')
      expect(parsed.ssl).toEqual({ enabled: true, ca: '/certs/ca.pem' })
    })

    it('says nothing about TLS when the URL does not', () => {
      expect(parseConnectionUrl('postgres://h/d').ssl).toBeUndefined()
    })

    it('ignores an unrecognized mode rather than failing', () => {
      expect(parseConnectionUrl('postgres://h/d?sslmode=something-new').ssl).toBeUndefined()
    })
  })

  describe('rejects unusable input', () => {
    it('rejects an empty string', () => {
      expect(() => parseConnectionUrl('   ')).toThrow('Enter a connection string')
    })

    it('rejects a string with no scheme', () => {
      expect(() => parseConnectionUrl('user:pw@host:5432/db')).toThrow(
        'Not a valid connection string'
      )
    })

    it('names the supported schemes when the scheme is wrong', () => {
      expect(() => parseConnectionUrl('mongodb://h/d')).toThrow(/Unsupported scheme "mongodb:\/\/"/)
      expect(() => parseConnectionUrl('redis://h')).toThrow(
        /postgresql:\/\/, postgres:\/\/, mysql:\/\/, or mariadb:\/\//
      )
    })

    it('rejects an out-of-range port', () => {
      expect(() => parseConnectionUrl('postgres://h/d?port=99999')).toThrow('not a valid port')
    })

    it('rejects malformed percent-encoding', () => {
      expect(() => parseConnectionUrl('postgres://h/d%ZZ')).toThrow('percent-encoding')
    })
  })
})
