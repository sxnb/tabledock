import { ElectronAPI } from '@electron-toolkit/preload'
import type { DataDockApi } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: DataDockApi
  }
}
