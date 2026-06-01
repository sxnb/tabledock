import { app, ipcMain } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { AppSettings, IpcResult } from './db/types'

/** Persisted app-wide settings, stored at <userData>/settings.json. */

const DEFAULTS: AppSettings = {
  sidebar: { color: null, noise: 0.15 },
  themeMode: 'dark',
  showAiButton: true
}

function storePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  const path = storePath()
  if (!existsSync(path)) return DEFAULTS
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return {
      ...DEFAULTS,
      ...parsed,
      sidebar: { ...DEFAULTS.sidebar, ...(parsed?.sidebar ?? {}) }
    }
  } catch {
    return DEFAULTS
  }
}

export function saveSettings(settings: AppSettings): void {
  writeFileSync(storePath(), JSON.stringify(settings, null, 2), 'utf-8')
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

export function registerSettingsIpc(): void {
  handle('settings:get', (): AppSettings => getSettings())
  handle('settings:set', (settings: AppSettings): void => saveSettings(settings))
}
