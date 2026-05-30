import { ipcMain } from 'electron'

type PerformFeedback = (pattern: string, performanceTime: string) => void

let perform: PerformFeedback | null = null
let attempted = false

/**
 * Lazily load the optional native haptics module. It's a macOS-only optional
 * dependency, so this is a no-op on other platforms or if it isn't installed.
 */
function loadPerform(): PerformFeedback | null {
  if (attempted) return perform
  attempted = true
  if (process.platform !== 'darwin') return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('node-mac-haptics') as { performFeedback: PerformFeedback }
    perform = mod.performFeedback
  } catch {
    perform = null
  }
  return perform
}

export function registerHapticsIpc(): void {
  // Fire-and-forget: a trackpad detent tap with no response needed.
  ipcMain.on('haptics:tap', () => {
    try {
      loadPerform()?.('NSHapticFeedbackPatternLevelChange', 'NSHapticFeedbackPerformanceTimeNow')
    } catch {
      // Haptics unavailable; ignore.
    }
  })
}
