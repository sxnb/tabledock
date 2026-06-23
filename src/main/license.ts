import { app, ipcMain, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { IpcResult, LicenseInfo, LicenseStatus } from './db/types'

// Store: https://colorcode.lemonsqueezy.com
const LS_PRODUCT_ID = 1168031

interface StoredLicense {
  /** safeStorage-encrypted key (base64) or plaintext fallback. */
  encKey?: string | null
  plainKey?: string | null
  /** safeStorage-encrypted instance ID (base64) or plaintext fallback. */
  encInstanceId?: string | null
  plainInstanceId?: string | null
  activatedAt: string
}

function storePath(): string {
  return join(app.getPath('userData'), 'license.json')
}

function readStored(): StoredLicense | null {
  const path = storePath()
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as StoredLicense) : null
  } catch {
    return null
  }
}

function writeStored(data: StoredLicense): void {
  writeFileSync(storePath(), JSON.stringify(data, null, 2), 'utf-8')
}

function clearStored(): void {
  const path = storePath()
  if (existsSync(path)) writeFileSync(path, JSON.stringify(null), 'utf-8')
}

function encrypt(value: string): { encKey: string; plainKey: null } | { encKey: null; plainKey: string } {
  if (safeStorage.isEncryptionAvailable()) {
    return { encKey: safeStorage.encryptString(value).toString('base64'), plainKey: null }
  }
  return { encKey: null, plainKey: value }
}

function decrypt(enc: string | null | undefined, plain: string | null | undefined): string | null {
  if (enc) {
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')) } catch { return null }
  }
  return plain ?? null
}

function maskKey(key: string): string {
  const parts = key.split('-')
  if (parts.length < 2) return key.slice(0, 4) + '****'
  return parts[0] + '-****-****-****-' + parts[parts.length - 1]
}

function buildInfo(stored: StoredLicense | null, status: LicenseStatus): LicenseInfo {
  if (!stored || status === 'personal') {
    return { status: 'personal', maskedKey: null, activatedAt: null }
  }
  const rawKey = decrypt(stored.encKey, stored.plainKey)
  return {
    status,
    maskedKey: rawKey ? maskKey(rawKey) : null,
    activatedAt: stored.activatedAt
  }
}

async function lsPost(endpoint: string, body: Record<string, string>): Promise<Response> {
  return fetch(`https://api.lemonsqueezy.com/v1/licenses/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body)
  })
}

function handle<T>(channel: string, fn: (...args: never[]) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(...(args as never[])) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

export function registerLicenseIpc(): void {
  handle('license:get', (): LicenseInfo => {
    const stored = readStored()
    return buildInfo(stored, stored ? 'active' : 'personal')
  })

  handle('license:activate', async (key: string): Promise<LicenseInfo> => {
    const res = await lsPost('activate', { license_key: key.trim(), instance_name: 'TableDock' })
    const json = await res.json() as {
      activated?: boolean
      error?: string | null
      instance?: { id: string }
      license_key?: { status: string }
      meta?: { product_id?: number; store_id?: number }
    }

    if (!json.activated || !json.instance?.id) {
      throw new Error(json.error ?? 'Activation failed — please check your license key.')
    }
    if (json.license_key?.status !== 'active') {
      throw new Error(`License is ${json.license_key?.status ?? 'invalid'}.`)
    }
    if (json.meta?.product_id !== LS_PRODUCT_ID) {
      throw new Error('This key is not a valid TableDock license.')
    }

    const { encKey, plainKey } = encrypt(key.trim())
    const instEnc = encrypt(json.instance.id)
    const stored: StoredLicense = {
      encKey,
      plainKey,
      encInstanceId: instEnc.encKey,
      plainInstanceId: instEnc.plainKey,
      activatedAt: new Date().toISOString()
    }
    writeStored(stored)
    return buildInfo(stored, 'active')
  })

  handle('license:deactivate', async (): Promise<void> => {
    const stored = readStored()
    if (!stored) return

    const key = decrypt(stored.encKey, stored.plainKey)
    const instanceId = decrypt(stored.encInstanceId, stored.plainInstanceId)
    if (key && instanceId) {
      try {
        await lsPost('deactivate', { license_key: key, instance_id: instanceId })
      } catch {
        // Best-effort — clear locally even if the API call fails.
      }
    }
    clearStored()
  })
}
