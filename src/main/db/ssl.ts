import { readFileSync } from 'fs'
import type { ConnectionConfig } from '../../shared/types'

export interface TlsMaterial {
  ca?: string
  cert?: string
  key?: string
  /** Verify the server certificate. Only enabled when a CA is supplied. */
  rejectUnauthorized: boolean
}

/**
 * Read the connection's configured certificate files into TLS material, or
 * return undefined when SSL is not enabled. Shared by the MySQL, PostgreSQL,
 * and Redis drivers (each maps it onto its own option shape). Without a CA we
 * leave verification off so self-signed servers still connect.
 */
export function buildTls(config: ConnectionConfig): TlsMaterial | undefined {
  const ssl = config.ssl
  if (!ssl?.enabled) return undefined
  const material: TlsMaterial = { rejectUnauthorized: Boolean(ssl.ca) }
  if (ssl.ca) material.ca = readFileSync(ssl.ca, 'utf-8')
  if (ssl.cert) material.cert = readFileSync(ssl.cert, 'utf-8')
  if (ssl.key) material.key = readFileSync(ssl.key, 'utf-8')
  return material
}
