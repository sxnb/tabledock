import { app, ipcMain, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ConnectionConfig, IpcResult, SshConfig } from './db/types'

/**
 * Persists saved connections to <userData>/connections.json. Secret fields (the
 * DB password and the SSH password/passphrase) are never written in the clear:
 * when the OS keychain is available they're encrypted via Electron safeStorage
 * and stored as base64, otherwise kept as a plaintext fallback.
 */

interface EncryptedField {
  enc?: string | null
  plain?: string | null
}

interface StoredSsh extends Omit<SshConfig, 'password' | 'passphrase'> {
  password?: EncryptedField
  passphrase?: EncryptedField
}

interface StoredConnection extends Omit<ConnectionConfig, 'password' | 'ssh'> {
  /** Base64 of safeStorage-encrypted password, or null. */
  encryptedPassword?: string | null
  /** Plaintext fallback when encryption is unavailable. */
  plainPassword?: string | null
  ssh?: StoredSsh
}

function storePath(): string {
  return join(app.getPath('userData'), 'connections.json')
}

function readStore(): StoredConnection[] {
  const path = storePath()
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStore(items: StoredConnection[]): void {
  writeFileSync(storePath(), JSON.stringify(items, null, 2), 'utf-8')
}

function encryptSecret(value: string | undefined): EncryptedField {
  if (!value) return { enc: null, plain: null }
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: safeStorage.encryptString(value).toString('base64'), plain: null }
  }
  return { enc: null, plain: value }
}

function decryptSecret(field: EncryptedField | undefined): string | undefined {
  if (!field) return undefined
  if (field.enc) {
    try {
      return safeStorage.decryptString(Buffer.from(field.enc, 'base64'))
    } catch {
      return undefined
    }
  }
  return field.plain ?? undefined
}

function toConfig(item: StoredConnection): ConnectionConfig {
  const { encryptedPassword, plainPassword, ssh, ...rest } = item
  const config: ConnectionConfig = {
    ...rest,
    password: decryptSecret({ enc: encryptedPassword, plain: plainPassword })
  }
  if (ssh) {
    const { password, passphrase, ...sshRest } = ssh
    config.ssh = {
      ...sshRest,
      password: decryptSecret(password),
      passphrase: decryptSecret(passphrase)
    }
  }
  return config
}

function toStored(config: ConnectionConfig): StoredConnection {
  const { password, ssh, ...rest } = config
  const secret = encryptSecret(password)
  const stored: StoredConnection = {
    ...rest,
    encryptedPassword: secret.enc,
    plainPassword: secret.plain
  }
  if (ssh) {
    const { password: sshPassword, passphrase, ...sshRest } = ssh
    stored.ssh = {
      ...sshRest,
      password: encryptSecret(sshPassword),
      passphrase: encryptSecret(passphrase)
    }
  }
  return stored
}

function handle<T>(channel: string, fn: (...args: never[]) => T): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: fn(...(args as never[])) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

export function registerStoreIpc(): void {
  handle('store:list', (): ConnectionConfig[] => readStore().map(toConfig))

  handle('store:save', (config: ConnectionConfig): ConnectionConfig => {
    const items = readStore()
    const stored = toStored(config)
    const idx = items.findIndex((i) => i.id === config.id)
    if (idx >= 0) items[idx] = stored
    else items.push(stored)
    writeStore(items)
    return toConfig(stored)
  })

  handle('store:delete', (id: string): void => {
    writeStore(readStore().filter((i) => i.id !== id))
  })
}
