import { ipcMain } from 'electron'
import { getSettings, saveSettings } from '../settings'
import * as keys from './keys'
import { streamChat } from './providers'
import type { AiChatRequest, AiConfig, AiProvider, IpcResult } from '../db/types'

const DEFAULT_CONFIG: AiConfig = { provider: 'openai', model: 'gpt-4o-mini' }

/** Run a handler and wrap success/failure in the IpcResult envelope. */
function handle<T>(channel: string, fn: (...args: never[]) => T): void {
  ipcMain.handle(channel, async (_event, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: fn(...(args as never[])) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

// In-flight chat requests, so the renderer can cancel a stream.
const controllers = new Map<string, AbortController>()

export function registerAiIpc(): void {
  handle('ai:getConfig', () => {
    const cfg = getSettings().ai ?? DEFAULT_CONFIG
    return { ...cfg, hasKey: keys.hasKey(cfg.provider) }
  })

  handle('ai:setConfig', (config: AiConfig): void => {
    saveSettings({ ...getSettings(), ai: config })
  })

  handle('ai:setKey', (provider: AiProvider, key: string): void => keys.setKey(provider, key))
  handle('ai:hasKey', (provider: AiProvider): boolean => keys.hasKey(provider))

  // Streams chunks on `ai:chunk:<requestId>` and resolves with the full text.
  ipcMain.handle(
    'ai:chat',
    async (event, requestId: string, request: AiChatRequest): Promise<IpcResult<string>> => {
      const key = keys.getKey(request.provider)
      if (!key) return { ok: false, error: `No API key configured for ${request.provider}` }
      const controller = new AbortController()
      controllers.set(requestId, controller)
      try {
        const text = await streamChat(
          request,
          key,
          (delta) => event.sender.send(`ai:chunk:${requestId}`, delta),
          controller.signal
        )
        return { ok: true, data: text }
      } catch (err) {
        if (controller.signal.aborted) return { ok: true, data: '' }
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      } finally {
        controllers.delete(requestId)
      }
    }
  )

  ipcMain.on('ai:cancel', (_event, requestId: string) => {
    controllers.get(requestId)?.abort()
    controllers.delete(requestId)
  })
}
