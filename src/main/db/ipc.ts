import { ipcMain, dialog, BrowserWindow } from 'electron'
import { connectionManager } from './manager'
import {
  isRedisDriver,
  isRelationalDriver,
  type ConnectionConfig,
  type DeleteRowParams,
  type InsertRowParams,
  type GetRowsOptions,
  type IpcResult,
  type OpenFileOptions,
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
  handle('db:delete', (sessionId: string, table: string, params: DeleteRowParams) =>
    relational(sessionId).deleteRow(table, params)
  )
  handle('db:insert', (sessionId: string, table: string, params: InsertRowParams) =>
    relational(sessionId).insertRow(table, params)
  )
  handle('db:schemaGraph', (sessionId: string, database?: string) =>
    relational(sessionId).getSchemaGraph(database)
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

  // Generic file picker (SQLite database files, TLS certificates, …).
  handle('dialog:openFile', async (options?: OpenFileOptions) => {
    const properties: Electron.OpenDialogOptions['properties'] = options?.allowCreate
      ? ['openFile', 'createDirectory', 'promptToCreate']
      : ['openFile']
    const dialogOptions: Electron.OpenDialogOptions = {
      title: options?.title,
      properties,
      filters: options?.filters ?? [{ name: 'All Files', extensions: ['*'] }]
    }
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
