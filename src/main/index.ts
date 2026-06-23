import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerDbIpc } from './db/ipc'
import { registerStoreIpc } from './store'
import { registerHistoryIpc } from './history'
import { registerSavedQueriesIpc } from './saved-queries'
import { registerSettingsIpc } from './settings'
import { registerAiIpc } from './ai/ipc'
import { registerHapticsIpc } from './haptics'
import { registerMenu } from './menu'
import { registerLicenseIpc } from './license'
import { connectionManager } from './db/manager'

app.setName('TableDock')

// Test isolation: redirect persisted data (connections, history, settings) to a
// throwaway directory so E2E runs start clean and never touch real app data.
if (process.env.TABLEDOCK_USER_DATA) {
  app.setPath('userData', process.env.TABLEDOCK_USER_DATA)
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0c0e16',
    // macOS: hide the native title bar so the app's own chrome flows to the top
    // edge; keep the traffic lights, inset to sit in the sidebar header row.
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 16, y: 13 } }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.colorcodesrl.tabledock')

  // In development the app runs as the Electron binary, so the dock would show
  // Electron's own icon. Override it explicitly. In production the .icns in the
  // app bundle is used automatically, and setting it here would prevent macOS
  // from applying dark/tinted dock icon transformations.
  if (is.dev && process.platform === 'darwin') app.dock?.setIcon(icon)

  // Default open or close DevTools by F12 in development.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Register database + connection-store IPC handlers.
  registerDbIpc()
  registerStoreIpc()
  registerHistoryIpc()
  registerSavedQueriesIpc()
  registerSettingsIpc()
  registerAiIpc()
  registerLicenseIpc()
  registerHapticsIpc()
  registerMenu()

  // Keep the native window background in sync with the renderer's theme.
  ipcMain.on('app:setBackgroundColor', (event, color: string) => {
    BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(color)
  })

  ipcMain.on('app:openExternal', (_event, url: string) => {
    void shell.openExternal(url)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Tear down any live database connections before exiting.
app.on('before-quit', () => {
  void connectionManager.closeAll()
})

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
