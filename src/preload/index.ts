import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  ConnectionConfig,
  CreateDumpParams,
  DataDockApi,
  DeleteRowParams,
  InsertRowParams,
  GetRowsOptions,
  IpcResult,
  MenuContext,
  MongoFindOptions,
  MongoFindResult,
  NewColumnSpec,
  OpenFileOptions,
  SaveTextOptions,
  QueryHistoryEntry,
  QueryResult,
  RedisScanResult,
  RedisValue,
  RedisValuePage,
  RowsResult,
  SavedQuery,
  SchemaGraph,
  TableMeta,
  TableStructure,
  UpdateRowParams,
  UpdateRowResult
} from '../shared/types'

/** Unwrap the IpcResult envelope into a resolved value or a thrown error. */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.data
}

const api: DataDockApi = {
  store: {
    list: (): Promise<ConnectionConfig[]> => invoke('store:list'),
    save: (config: ConnectionConfig): Promise<ConnectionConfig> => invoke('store:save', config),
    delete: (id: string): Promise<void> => invoke('store:delete', id)
  },
  db: {
    connect: (config: ConnectionConfig): Promise<string> => invoke('db:connect', config),
    test: (config: ConnectionConfig): Promise<void> => invoke('db:test', config),
    disconnect: (sessionId: string): Promise<void> => invoke('db:disconnect', sessionId),
    databases: (sessionId: string): Promise<string[]> => invoke('db:databases', sessionId),
    tables: (sessionId: string, database?: string): Promise<string[]> =>
      invoke('db:tables', sessionId, database),
    rows: (sessionId: string, table: string, opts: GetRowsOptions): Promise<RowsResult> =>
      invoke('db:rows', sessionId, table, opts),
    tableMeta: (sessionId: string, table: string, database?: string): Promise<TableMeta> =>
      invoke('db:tableMeta', sessionId, table, database),
    tableStructure: (
      sessionId: string,
      table: string,
      database?: string
    ): Promise<TableStructure> => invoke('db:tableStructure', sessionId, table, database),
    addColumn: (
      sessionId: string,
      table: string,
      column: NewColumnSpec,
      database?: string
    ): Promise<void> => invoke('db:addColumn', sessionId, table, column, database),
    dropColumn: (
      sessionId: string,
      table: string,
      column: string,
      database?: string
    ): Promise<void> => invoke('db:dropColumn', sessionId, table, column, database),
    renameTable: (
      sessionId: string,
      table: string,
      newName: string,
      database?: string
    ): Promise<void> => invoke('db:renameTable', sessionId, table, newName, database),
    dropTable: (sessionId: string, table: string, database?: string): Promise<void> =>
      invoke('db:dropTable', sessionId, table, database),
    update: (sessionId: string, table: string, params: UpdateRowParams): Promise<UpdateRowResult> =>
      invoke('db:update', sessionId, table, params),
    deleteRow: (
      sessionId: string,
      table: string,
      params: DeleteRowParams
    ): Promise<UpdateRowResult> => invoke('db:delete', sessionId, table, params),
    insertRow: (
      sessionId: string,
      table: string,
      params: InsertRowParams
    ): Promise<UpdateRowResult> => invoke('db:insert', sessionId, table, params),
    importSqlFiles: (sessionId: string, paths: string[], database?: string): Promise<number> =>
      invoke('db:importSqlFiles', sessionId, paths, database),
    importTableData: (
      sessionId: string,
      table: string,
      params: { database?: string; rows: Record<string, unknown>[] }
    ): Promise<number> => invoke('db:importTableData', sessionId, table, params),
    createDump: (sessionId: string, params: CreateDumpParams): Promise<string | null> =>
      invoke('db:createDump', sessionId, params),
    schemaGraph: (sessionId: string, database?: string): Promise<SchemaGraph> =>
      invoke('db:schemaGraph', sessionId, database),
    query: (sessionId: string, sql: string, database?: string): Promise<QueryResult> =>
      invoke('db:query', sessionId, sql, database)
  },
  mongo: {
    databases: (sessionId: string): Promise<string[]> => invoke('mongo:databases', sessionId),
    collections: (sessionId: string, database: string): Promise<string[]> =>
      invoke('mongo:collections', sessionId, database),
    find: (
      sessionId: string,
      database: string,
      collection: string,
      opts: MongoFindOptions
    ): Promise<MongoFindResult> => invoke('mongo:find', sessionId, database, collection, opts),
    aggregate: (
      sessionId: string,
      database: string,
      collection: string,
      pipeline: string
    ): Promise<MongoFindResult> =>
      invoke('mongo:aggregate', sessionId, database, collection, pipeline),
    insert: (
      sessionId: string,
      database: string,
      collection: string,
      json: string
    ): Promise<void> => invoke('mongo:insert', sessionId, database, collection, json),
    update: (
      sessionId: string,
      database: string,
      collection: string,
      id: string,
      json: string
    ): Promise<void> => invoke('mongo:update', sessionId, database, collection, id, json),
    remove: (sessionId: string, database: string, collection: string, id: string): Promise<void> =>
      invoke('mongo:remove', sessionId, database, collection, id)
  },
  redis: {
    select: (sessionId: string, index: number): Promise<void> =>
      invoke('redis:select', sessionId, index),
    keys: (
      sessionId: string,
      opts: { pattern: string; cursor: string; count: number }
    ): Promise<RedisScanResult> => invoke('redis:keys', sessionId, opts),
    get: (sessionId: string, key: string): Promise<RedisValue> =>
      invoke('redis:get', sessionId, key),
    page: (
      sessionId: string,
      key: string,
      cursor: string,
      count: number
    ): Promise<RedisValuePage> => invoke('redis:page', sessionId, key, cursor, count),
    command: (sessionId: string, args: string[]): Promise<unknown> =>
      invoke('redis:command', sessionId, args),
    dbSize: (sessionId: string): Promise<number> => invoke('redis:dbSize', sessionId),
    delete: (sessionId: string, key: string): Promise<void> =>
      invoke('redis:delete', sessionId, key),
    rename: (sessionId: string, key: string, newKey: string): Promise<void> =>
      invoke('redis:rename', sessionId, key, newKey),
    setTtl: (sessionId: string, key: string, seconds: number | null): Promise<void> =>
      invoke('redis:setTtl', sessionId, key, seconds),
    write: (sessionId: string, args: string[]): Promise<unknown> =>
      invoke('redis:write', sessionId, args)
  },
  dialog: {
    openFile: (options?: OpenFileOptions): Promise<string | null> =>
      invoke('dialog:openFile', options),
    openFiles: (options?: OpenFileOptions): Promise<string[]> =>
      invoke('dialog:openFiles', options),
    saveText: (content: string, options: SaveTextOptions): Promise<string | null> =>
      invoke('dialog:saveText', content, options)
  },
  history: {
    list: (connectionId: string): Promise<QueryHistoryEntry[]> =>
      invoke('history:list', connectionId),
    add: (connectionId: string, entry: { sql: string; ok: boolean }): Promise<void> =>
      invoke('history:add', connectionId, entry),
    clear: (connectionId: string): Promise<void> => invoke('history:clear', connectionId)
  },
  savedQueries: {
    list: (connectionId: string): Promise<SavedQuery[]> =>
      invoke('savedQueries:list', connectionId),
    save: (connectionId: string, query: { name: string; sql: string }): Promise<SavedQuery[]> =>
      invoke('savedQueries:save', connectionId, query),
    delete: (connectionId: string, id: string): Promise<SavedQuery[]> =>
      invoke('savedQueries:delete', connectionId, id)
  },
  settings: {
    get: (): Promise<AppSettings> => invoke('settings:get'),
    set: (settings: AppSettings): Promise<void> => invoke('settings:set', settings)
  },
  haptics: {
    tap: (): void => ipcRenderer.send('haptics:tap')
  },
  app: {
    setBackgroundColor: (color: string): void => ipcRenderer.send('app:setBackgroundColor', color)
  },
  menu: {
    setContext: (context: MenuContext): void => ipcRenderer.send('menu:setContext', context),
    onDisconnect: (callback: () => void): (() => void) => subscribe('menu:disconnect', callback),
    onImport: (callback: () => void): (() => void) => subscribe('menu:import', callback),
    onDump: (callback: () => void): (() => void) => subscribe('menu:dump', callback)
  }
}

/** Subscribe to a fire-and-forget main→renderer channel; returns an unsubscribe fn. */
function subscribe(channel: string, callback: () => void): () => void {
  const handler = (): void => callback()
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
