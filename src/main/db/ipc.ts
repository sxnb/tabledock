import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { connectionManager } from './manager'
import {
  isMongoDriver,
  isRedisDriver,
  isRelationalDriver,
  type ConnectionConfig,
  type CreateDumpParams,
  type DeleteRowParams,
  type InsertRowParams,
  type GetRowsOptions,
  type IpcResult,
  type MongoDriverApi,
  type MongoFindOptions,
  type NewColumnSpec,
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

function mongo(sessionId: string): MongoDriverApi {
  const driver = connectionManager.get(sessionId)
  if (!isMongoDriver(driver)) throw new Error('Not a MongoDB connection')
  return driver
}

function assertWritable(sessionId: string): void {
  if (connectionManager.isReadOnly(sessionId)) throw new Error('Connection is read-only')
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
  handle('db:tableStructure', (sessionId: string, table: string, database?: string) =>
    relational(sessionId).getTableStructure(table, database)
  )
  handle('db:createDatabase', (sessionId: string, name: string) => {
    assertWritable(sessionId)
    return relational(sessionId).createDatabase(name)
  })
  handle(
    'db:createTable',
    (
      sessionId: string,
      table: string,
      columns: NewColumnSpec[],
      primaryKey: string[],
      db?: string
    ) => {
      assertWritable(sessionId)
      return relational(sessionId).createTable(table, columns, primaryKey, db)
    }
  )
  handle('db:addColumn', (sessionId: string, table: string, column: NewColumnSpec, db?: string) => {
    assertWritable(sessionId)
    return relational(sessionId).addColumn(table, column, db)
  })
  handle('db:dropColumn', (sessionId: string, table: string, column: string, db?: string) => {
    assertWritable(sessionId)
    return relational(sessionId).dropColumn(table, column, db)
  })
  handle('db:renameTable', (sessionId: string, table: string, newName: string, db?: string) => {
    assertWritable(sessionId)
    return relational(sessionId).renameTable(table, newName, db)
  })
  handle('db:dropTable', (sessionId: string, table: string, db?: string) => {
    assertWritable(sessionId)
    return relational(sessionId).dropTable(table, db)
  })
  handle('db:update', (sessionId: string, table: string, params: UpdateRowParams) => {
    assertWritable(sessionId)
    return relational(sessionId).updateRow(table, params)
  })
  handle('db:delete', (sessionId: string, table: string, params: DeleteRowParams) => {
    assertWritable(sessionId)
    return relational(sessionId).deleteRow(table, params)
  })
  handle('db:insert', (sessionId: string, table: string, params: InsertRowParams) => {
    assertWritable(sessionId)
    return relational(sessionId).insertRow(table, params)
  })
  handle('db:schemaGraph', (sessionId: string, database?: string) =>
    relational(sessionId).getSchemaGraph(database)
  )
  handle('db:query', (sessionId: string, sql: string, database?: string) =>
    relational(sessionId).runQuery(sql, database)
  )
  handle(
    'db:importTableData',
    async (
      sessionId: string,
      table: string,
      params: { database?: string; rows: Record<string, unknown>[] }
    ) => {
      assertWritable(sessionId)
      const driver = relational(sessionId)
      let inserted = 0
      for (const values of params.rows) {
        if (Object.keys(values).length === 0) continue
        await driver.insertRow(table, { database: params.database, values })
        inserted++
      }
      return inserted
    }
  )
  handle('db:importSqlFiles', async (sessionId: string, paths: string[], database?: string) => {
    assertWritable(sessionId)
    const driver = relational(sessionId)
    for (const path of paths) {
      await driver.runScript(readFileSync(path, 'utf-8'), database)
    }
    return paths.length
  })
  handle('db:createDump', async (sessionId: string, params: CreateDumpParams) => {
    const driver = connectionManager.get(sessionId)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const ext = isRedisDriver(driver) ? 'txt' : isMongoDriver(driver) ? 'json' : 'sql'
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const save = win
      ? await dialog.showSaveDialog(win, saveOptions(params.name, stamp, ext))
      : await dialog.showSaveDialog(saveOptions(params.name, stamp, ext))
    if (save.canceled || !save.filePath) return null
    let content = ''
    if (isRedisDriver(driver)) content = await driver.dumpKeyspace()
    else if (isMongoDriver(driver)) content = await driver.dumpJson(params.database || '')
    else if (isRelationalDriver(driver)) {
      content = await driver.dumpDatabase(params.database, {
        includeCreateDatabase: params.includeCreateDatabase
      })
    }
    writeFileSync(save.filePath, content, 'utf-8')
    return save.filePath
  })

  // Redis
  handle('redis:select', (sessionId: string, index: number) => redis(sessionId).selectDb(index))
  handle(
    'redis:keys',
    (sessionId: string, opts: { pattern: string; cursor: string; count: number }) =>
      redis(sessionId).listKeys(opts)
  )
  handle('redis:get', (sessionId: string, key: string) => redis(sessionId).getKey(key))
  handle('redis:page', (sessionId: string, key: string, cursor: string, count: number) =>
    redis(sessionId).pageKey(key, cursor, count)
  )
  handle('redis:command', (sessionId: string, args: string[]) => redis(sessionId).runCommand(args))
  handle('redis:dbSize', (sessionId: string) => redis(sessionId).dbSize())
  handle('redis:delete', (sessionId: string, key: string) => {
    assertWritable(sessionId)
    return redis(sessionId).deleteKey(key)
  })
  handle('redis:rename', (sessionId: string, key: string, newKey: string) => {
    assertWritable(sessionId)
    return redis(sessionId).renameKey(key, newKey)
  })
  handle('redis:setTtl', (sessionId: string, key: string, seconds: number | null) => {
    assertWritable(sessionId)
    return redis(sessionId).setKeyTtl(key, seconds)
  })
  // Structured value edits (SET/HSET/LSET/SADD/ZADD/…) built by the UI.
  handle('redis:write', (sessionId: string, args: string[]) => {
    assertWritable(sessionId)
    return redis(sessionId).runCommand(args)
  })

  // MongoDB
  handle('mongo:databases', (sessionId: string) => mongo(sessionId).listDatabases())
  handle('mongo:collections', (sessionId: string, database: string) =>
    mongo(sessionId).listCollections(database)
  )
  handle(
    'mongo:find',
    (sessionId: string, database: string, collection: string, opts: MongoFindOptions) =>
      mongo(sessionId).find(database, collection, opts)
  )
  handle(
    'mongo:aggregate',
    (sessionId: string, database: string, collection: string, pipeline: string) =>
      mongo(sessionId).aggregate(database, collection, pipeline)
  )
  handle('mongo:indexes', (sessionId: string, database: string, collection: string) =>
    mongo(sessionId).listIndexes(database, collection)
  )
  handle('mongo:stats', (sessionId: string, database: string, collection: string) =>
    mongo(sessionId).collectionStats(database, collection)
  )
  handle('mongo:createCollection', (sessionId: string, database: string, name: string) => {
    assertWritable(sessionId)
    return mongo(sessionId).createCollection(database, name)
  })
  handle('mongo:dropCollection', (sessionId: string, database: string, name: string) => {
    assertWritable(sessionId)
    return mongo(sessionId).dropCollection(database, name)
  })
  handle(
    'mongo:renameCollection',
    (sessionId: string, database: string, from: string, to: string) => {
      assertWritable(sessionId)
      return mongo(sessionId).renameCollection(database, from, to)
    }
  )
  handle(
    'mongo:createIndex',
    (
      sessionId: string,
      database: string,
      collection: string,
      keysJson: string,
      options: { unique?: boolean; name?: string }
    ) => {
      assertWritable(sessionId)
      return mongo(sessionId).createIndex(database, collection, keysJson, options)
    }
  )
  handle(
    'mongo:dropIndex',
    (sessionId: string, database: string, collection: string, name: string) => {
      assertWritable(sessionId)
      return mongo(sessionId).dropIndex(database, collection, name)
    }
  )
  handle(
    'mongo:insert',
    (sessionId: string, database: string, collection: string, json: string) => {
      assertWritable(sessionId)
      return mongo(sessionId).insertDocument(database, collection, json)
    }
  )
  handle(
    'mongo:update',
    (sessionId: string, database: string, collection: string, id: string, json: string) => {
      assertWritable(sessionId)
      return mongo(sessionId).updateDocument(database, collection, id, json)
    }
  )
  handle('mongo:remove', (sessionId: string, database: string, collection: string, id: string) => {
    assertWritable(sessionId)
    return mongo(sessionId).deleteDocument(database, collection, id)
  })

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

  // Save arbitrary text to a user-chosen file (result export).
  handle(
    'dialog:saveText',
    async (
      content: string,
      options: { defaultName: string; filters?: { name: string; extensions: string[] }[] }
    ) => {
      const dialogOptions: Electron.SaveDialogOptions = {
        defaultPath: options.defaultName,
        filters: options.filters ?? [{ name: 'All Files', extensions: ['*'] }]
      }
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const save = win
        ? await dialog.showSaveDialog(win, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions)
      if (save.canceled || !save.filePath) return null
      writeFileSync(save.filePath, content, 'utf-8')
      return save.filePath
    }
  )

  // Multi-select file picker (SQL import).
  handle('dialog:openFiles', async (options?: OpenFileOptions) => {
    const dialogOptions: Electron.OpenDialogOptions = {
      title: options?.title,
      properties: ['openFile', 'multiSelections'],
      filters: options?.filters ?? [{ name: 'All Files', extensions: ['*'] }]
    }
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    return result.canceled ? [] : result.filePaths
  })
}

function saveOptions(
  name: string | undefined,
  stamp: string,
  ext: string
): Electron.SaveDialogOptions {
  return {
    title: 'Create database dump',
    defaultPath: `${name || 'tabledock'}-${stamp}.${ext}`,
    filters: [
      { name: ext.toUpperCase(), extensions: [ext] },
      { name: 'All Files', extensions: ['*'] }
    ]
  }
}
