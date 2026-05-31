import { Menu, BrowserWindow, ipcMain, type MenuItemConstructorOptions } from 'electron'
import { type MenuContext } from './db/types'

let context: MenuContext = { sessionId: null, kind: null }

function send(channel: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(channel)
}

function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = []
  if (process.platform === 'darwin') template.push({ role: 'appMenu' })

  if (context.sessionId) {
    const items: MenuItemConstructorOptions[] = []
    if (context.kind !== 'redis') {
      items.push({ label: 'Import SQL files…', click: () => send('menu:import') })
    }
    items.push({ label: 'Create database dump…', click: () => send('menu:dump') })
    items.push({ type: 'separator' })
    items.push({
      label: 'Disconnect',
      accelerator: 'CmdOrCtrl+Shift+D',
      click: () => send('menu:disconnect')
    })
    template.push({ label: 'Connection', submenu: items })
  }

  template.push({ role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function registerMenu(): void {
  buildMenu()
  ipcMain.on('menu:setContext', (event, ctx: MenuContext) => {
    context = ctx
    buildMenu()
    // On Windows/Linux, only reveal the menu bar while connected.
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setMenuBarVisibility(Boolean(ctx.sessionId))
    win?.setAutoHideMenuBar(!ctx.sessionId)
  })
}
