import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ConnectionConfig,
  DataDockApi,
  GetRowsOptions,
  IpcResult,
  OpenFileOptions,
  QueryHistoryEntry,
  QueryResult,
  RedisScanResult,
  RedisValue,
  RowsResult,
  SchemaGraph,
  TableMeta,
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
    update: (sessionId: string, table: string, params: UpdateRowParams): Promise<UpdateRowResult> =>
      invoke('db:update', sessionId, table, params),
    schemaGraph: (sessionId: string, database?: string): Promise<SchemaGraph> =>
      invoke('db:schemaGraph', sessionId, database),
    query: (sessionId: string, sql: string, database?: string): Promise<QueryResult> =>
      invoke('db:query', sessionId, sql, database)
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
    command: (sessionId: string, args: string[]): Promise<unknown> =>
      invoke('redis:command', sessionId, args)
  },
  dialog: {
    openFile: (options?: OpenFileOptions): Promise<string | null> =>
      invoke('dialog:openFile', options)
  },
  history: {
    list: (connectionId: string): Promise<QueryHistoryEntry[]> =>
      invoke('history:list', connectionId),
    add: (connectionId: string, entry: { sql: string; ok: boolean }): Promise<void> =>
      invoke('history:add', connectionId, entry),
    clear: (connectionId: string): Promise<void> => invoke('history:clear', connectionId)
  }
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
