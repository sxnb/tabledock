import type { DriverKind, SslConfig } from './types'

/** Driver kinds that a connection URL can describe. */
export type UrlDriverKind = Extract<DriverKind, 'mysql' | 'mariadb' | 'postgres'>

/** URL scheme → driver kind. `postgresql://` is libpq's long form of `postgres://`. */
const SCHEMES: Record<string, UrlDriverKind> = {
  postgres: 'postgres',
  postgresql: 'postgres',
  mysql: 'mysql',
  mariadb: 'mariadb'
}

const DEFAULT_PORTS: Record<UrlDriverKind, number> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306
}

/**
 * TLS mode values that mean "use TLS". `prefer`/`allow` are deliberately absent:
 * they mean "try TLS but fall back to plaintext", which this app cannot express,
 * and turning TLS on would break a server that does not offer it.
 */
const SSL_ON = new Set([
  'require',
  'required',
  'verifyca',
  'verifyfull',
  'verifyidentity',
  'strict',
  'true',
  '1',
  'yes',
  'on'
])

const SSL_OFF = new Set([
  'disable',
  'disabled',
  'false',
  '0',
  'no',
  'off',
  'prefer',
  'preferred',
  'allow'
])

/** The endpoint a connection URL describes; fields the URL omits are undefined. */
export interface ParsedConnectionUrl {
  kind: UrlDriverKind
  host: string
  port: number
  user?: string
  password?: string
  database?: string
  /** Only set when the URL says something about TLS. */
  ssl?: SslConfig
}

/** Lowercase a name/value and drop separators, so `ssl-mode`/`SSL_MODE` both match `sslmode`. */
function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[-_]/g, '')
}

function decode(value: string, what: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error(`Could not decode the ${what} — check its percent-encoding (%).`)
  }
}

/** Read query parameters under normalized names, so casing and -/_ spelling do not matter. */
function normalizedParams(url: URL): Map<string, string> {
  const params = new Map<string, string>()
  for (const [key, value] of url.searchParams) {
    if (value !== '') params.set(normalizeKey(key), value)
  }
  return params
}

function parseSsl(params: Map<string, string>): SslConfig | undefined {
  const ca = params.get('sslrootcert') ?? params.get('sslca')
  const cert = params.get('sslcert')
  const key = params.get('sslkey')
  const mode = params.get('sslmode') ?? params.get('sslaccept') ?? params.get('ssl')

  let enabled: boolean | undefined
  if (mode != null) {
    const normalized = normalizeKey(mode)
    // An unrecognized mode falls through to the certificate check below rather
    // than failing the whole parse — URLs carry all sorts of driver-specific values.
    if (SSL_ON.has(normalized)) enabled = true
    else if (SSL_OFF.has(normalized)) enabled = false
  }
  if (enabled === undefined && (ca || cert || key)) enabled = true
  if (enabled === undefined) return undefined

  return {
    enabled,
    ...(ca ? { ca } : {}),
    ...(cert ? { cert } : {}),
    ...(key ? { key } : {})
  }
}

/**
 * Parse a PostgreSQL or MySQL/MariaDB connection URL into connection fields.
 *
 * Accepts the usual `scheme://user:password@host:port/database?params` form.
 * Where libpq allows a setting both in the URL and as a query parameter
 * (`user`, `password`, `dbname`/`database`, `host`, `port`), the URL itself wins
 * and the parameter acts as a fallback.
 *
 * Throws an `Error` with a user-facing message when the string is unusable.
 */
export function parseConnectionUrl(input: string): ParsedConnectionUrl {
  // Pasted strings often arrive wrapped in shell quotes.
  const trimmed = input
    .trim()
    .replace(/^(['"])(.*)\1$/s, '$2')
    .trim()
  if (!trimmed) throw new Error('Enter a connection string.')

  const malformed = new Error(
    'Not a valid connection string. Expected something like ' +
      'postgresql://user:password@host:5432/database'
  )
  // Require an explicit scheme: without one, `new URL` reads "user:pw@host/db"
  // as the scheme "user:" and the error would point at the wrong problem.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) throw malformed

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw malformed
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase()
  const kind = SCHEMES[scheme]
  if (!kind) {
    throw new Error(
      `Unsupported scheme "${scheme}://". Use postgresql://, postgres://, mysql://, or mariadb://.`
    )
  }

  const params = normalizedParams(url)

  // WHATWG URL keeps IPv6 literals in brackets; drivers want the bare address.
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1') || params.get('host') || '127.0.0.1'

  const rawPort = url.port || params.get('port') || ''
  const port = rawPort ? Number(rawPort) : DEFAULT_PORTS[kind]
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`"${rawPort}" is not a valid port.`)
  }

  const pathDatabase = url.pathname.replace(/^\//, '')
  const database =
    (pathDatabase ? decode(pathDatabase, 'database name') : '') ||
    params.get('dbname') ||
    params.get('database') ||
    undefined

  const user =
    (url.username ? decode(url.username, 'username') : '') || params.get('user') || undefined
  const password =
    (url.password ? decode(url.password, 'password') : '') || params.get('password') || undefined

  const ssl = parseSsl(params)

  return {
    kind,
    host,
    port,
    ...(user ? { user } : {}),
    ...(password ? { password } : {}),
    ...(database ? { database } : {}),
    ...(ssl ? { ssl } : {})
  }
}
