import { ipcMain, dialog, BrowserWindow } from 'electron'
import { connectionManager } from './manager'
import {
  isRedisDriver,
  isRelationalDriver,
  type ConnectionConfig,
  type GetRowsOptions,
  type IpcResult,
  type RedisDriverApi,
  type RelationalDriver,
  type UpdateRowParams
} from './types'

/** Run a handler and wrap success/failure in the IpcResult envelope. */
function handle<T>(channel: string, fn: (...args: never[]) => Promise<T>): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      const data = await fn(...(args as never[]))
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

function relational(sessionId: string): RelationalDriver {
  const driver = connectionManager.get(sessionId)
  if (!isRelationalDriver(driver)) throw new Error('Not a relational connection')
  return driver
}

function redis(sessionId: string): RedisDriverApi {
  const driver = connectionManager.get(sessionId)
  if (!isRedisDriver(driver)) throw new Error('Not a Redis connection')
  return driver
}

export function registerDbIpc(): void {
  // Connection lifecycle
  handle('db:connect', (config: ConnectionConfig) => connectionManager.open(config))
  handle('db:test', (config: ConnectionConfig) => connectionManager.test(config))
  handle('db:disconnect', (sessionId: string) => connectionManager.close(sessionId))

  // Relational
  handle('db:databases', (sessionId: string) => relational(sessionId).listDatabases())
  handle('db:tables', (sessionId: string, database?: string) =>
    relational(sessionId).listTables(database)
  )
  handle('db:rows', (sessionId: string, table: string, opts: GetRowsOptions) =>
    relational(sessionId).getRows(table, opts)
  )
  handle('db:tableMeta', (sessionId: string, table: string, database?: string) =>
    relational(sessionId).getTableMeta(table, database)
  )
  handle('db:update', (sessionId: string, table: string, params: UpdateRowParams) =>
    relational(sessionId).updateRow(table, params)
  )
  handle('db:query', (sessionId: string, sql: string, database?: string) =>
    relational(sessionId).runQuery(sql, database)
  )

  // Redis
  handle('redis:select', (sessionId: string, index: number) => redis(sessionId).selectDb(index))
  handle(
    'redis:keys',
    (sessionId: string, opts: { pattern: string; cursor: string; count: number }) =>
      redis(sessionId).listKeys(opts)
  )
  handle('redis:get', (sessionId: string, key: string) => redis(sessionId).getKey(key))
  handle('redis:command', (sessionId: string, args: string[]) => redis(sessionId).runCommand(args))

  // File picker for SQLite database files
  handle('dialog:openFile', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, openOptions)
      : await dialog.showOpenDialog(openOptions)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}

const openOptions: Electron.OpenDialogOptions = {
  title: 'Select or create a SQLite database file',
  properties: ['openFile', 'createDirectory', 'promptToCreate'],
  filters: [
    { name: 'SQLite', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
    { name: 'All Files', extensions: ['*'] }
  ]
}
