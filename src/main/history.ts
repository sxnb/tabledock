import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { IpcResult, QueryHistoryEntry } from './db/types'

/**
 * Per-connection query history, persisted to <userData>/query-history.json as
 * a map of connection id → entries (most recent first). Capped per connection;
 * re-running an identical query moves it to the top rather than duplicating.
 */

const MAX_ENTRIES = 200

type HistoryStore = Record<string, QueryHistoryEntry[]>

function storePath(): string {
  return join(app.getPath('userData'), 'query-history.json')
}

function readStore(): HistoryStore {
  const path = storePath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as HistoryStore) : {}
  } catch {
    return {}
  }
}

function writeStore(store: HistoryStore): void {
  writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf-8')
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

export function registerHistoryIpc(): void {
  handle('history:list', (connectionId: string): QueryHistoryEntry[] => {
    return readStore()[connectionId] ?? []
  })

  handle('history:add', (connectionId: string, entry: { sql: string; ok: boolean }): void => {
    const sql = entry.sql.trim()
    if (!sql) return
    const store = readStore()
    const existing = (store[connectionId] ?? []).filter((e) => e.sql !== sql)
    const next: QueryHistoryEntry = { id: randomUUID(), sql, executedAt: Date.now(), ok: entry.ok }
    store[connectionId] = [next, ...existing].slice(0, MAX_ENTRIES)
    writeStore(store)
  })

  handle('history:clear', (connectionId: string): void => {
    const store = readStore()
    delete store[connectionId]
    writeStore(store)
  })
}
