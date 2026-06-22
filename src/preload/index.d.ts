import { ElectronAPI } from '@electron-toolkit/preload'
import type { TableDockApi } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: TableDockApi
  }
}
