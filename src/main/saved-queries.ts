import { app, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { IpcResult, SavedQuery } from './db/types'

/**
 * Per-connection saved queries (named SQL snippets), persisted to
 * <userData>/saved-queries.json as a map of connection id → entries
 * (most recent first). Capped per connection.
 */

const MAX_ENTRIES = 500

type SavedQueryStore = Record<string, SavedQuery[]>

function storePath(): string {
  return join(app.getPath('userData'), 'saved-queries.json')
}

function readStore(): SavedQueryStore {
  const path = storePath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as SavedQueryStore) : {}
  } catch {
    return {}
  }
}

function writeStore(store: SavedQueryStore): void {
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

export function registerSavedQueriesIpc(): void {
  handle('savedQueries:list', (connectionId: string): SavedQuery[] => {
    return readStore()[connectionId] ?? []
  })

  handle(
    'savedQueries:save',
    (connectionId: string, query: { name: string; sql: string }): SavedQuery[] => {
      const name = query.name.trim()
      const sql = query.sql.trim()
      if (!name || !sql) throw new Error('A name and SQL are required')
      const store = readStore()
      const entry: SavedQuery = { id: randomUUID(), name, sql, createdAt: Date.now() }
      store[connectionId] = [entry, ...(store[connectionId] ?? [])].slice(0, MAX_ENTRIES)
      writeStore(store)
      return store[connectionId]
    }
  )

  handle('savedQueries:delete', (connectionId: string, id: string): SavedQuery[] => {
    const store = readStore()
    store[connectionId] = (store[connectionId] ?? []).filter((q) => q.id !== id)
    writeStore(store)
    return store[connectionId]
  })
}
