import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { AiProvider } from '../db/types'

/**
 * Per-provider AI API keys, persisted to <userData>/ai-keys.json. Keys are
 * encrypted with Electron safeStorage when available (base64), with a plaintext
 * fallback otherwise — mirroring how connection passwords are stored. Keys are
 * only ever read in the main process; the renderer sees `hasKey` booleans only.
 */

interface StoredKey {
  enc?: string | null
  plain?: string | null
}

type KeyStore = Partial<Record<AiProvider, StoredKey>>

function storePath(): string {
  return join(app.getPath('userData'), 'ai-keys.json')
}

function read(): KeyStore {
  const path = storePath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as KeyStore) : {}
  } catch {
    return {}
  }
}

function write(store: KeyStore): void {
  writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf-8')
}

export function setKey(provider: AiProvider, key: string): void {
  const store = read()
  if (!key) {
    delete store[provider]
  } else if (safeStorage.isEncryptionAvailable()) {
    store[provider] = { enc: safeStorage.encryptString(key).toString('base64'), plain: null }
  } else {
    store[provider] = { enc: null, plain: key }
  }
  write(store)
}

export function getKey(provider: AiProvider): string | undefined {
  const field = read()[provider]
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

export function hasKey(provider: AiProvider): boolean {
  const field = read()[provider]
  return Boolean(field && (field.enc || field.plain))
}
