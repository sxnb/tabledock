import { app, ipcMain, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ConnectionConfig, IpcResult } from './db/types'

/**
 * Persists saved connections to <userData>/connections.json. Passwords are
 * never written in the clear: when the OS keychain is available they're
 * encrypted via Electron safeStorage and stored as base64. The on-disk shape
 * keeps the encrypted blob separate from the rest of the config.
 */

interface StoredConnection extends Omit<ConnectionConfig, 'password'> {
  /** Base64 of safeStorage-encrypted password, or null. */
  encryptedPassword?: string | null
  /** Plaintext fallback when encryption is unavailable. */
  plainPassword?: string | null
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

function encrypt(
  password: string | undefined
): Pick<StoredConnection, 'encryptedPassword' | 'plainPassword'> {
  if (!password) return { encryptedPassword: null, plainPassword: null }
  if (safeStorage.isEncryptionAvailable()) {
    return {
      encryptedPassword: safeStorage.encryptString(password).toString('base64'),
      plainPassword: null
    }
  }
  return { encryptedPassword: null, plainPassword: password }
}

function decrypt(item: StoredConnection): string | undefined {
  if (item.encryptedPassword) {
    try {
      return safeStorage.decryptString(Buffer.from(item.encryptedPassword, 'base64'))
    } catch {
      return undefined
    }
  }
  return item.plainPassword ?? undefined
}

function toConfig(item: StoredConnection): ConnectionConfig {
  const { encryptedPassword, plainPassword, ...rest } = item
  void encryptedPassword
  void plainPassword
  return { ...rest, password: decrypt(item) }
}

function toStored(config: ConnectionConfig): StoredConnection {
  const { password, ...rest } = config
  return { ...rest, ...encrypt(password) }
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
