import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  ConnectionConfig,
  DataDockApi,
  GetRowsOptions,
  IpcResult,
  QueryResult,
  RedisScanResult,
  RedisValue,
  RowsResult
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
    openFile: (): Promise<string | null> => invoke('dialog:openFile')
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
