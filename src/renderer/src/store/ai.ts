import { create } from 'zustand'
import type { AiProvider } from '@shared/types'

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest'
}

interface AiState {
  provider: AiProvider
  model: string
  /** Whether the current provider has a stored API key. */
  configured: boolean
  loaded: boolean
  load: () => Promise<void>
  setConfig: (provider: AiProvider, model: string) => Promise<void>
  saveKey: (provider: AiProvider, key: string) => Promise<void>
}

export const useAi = create<AiState>((set, get) => ({
  provider: 'openai',
  model: DEFAULT_MODEL.openai,
  configured: false,
  loaded: false,
  load: async () => {
    try {
      const cfg = await window.api.ai.getConfig()
      set({ provider: cfg.provider, model: cfg.model, configured: cfg.hasKey, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  setConfig: async (provider, model) => {
    await window.api.ai.setConfig({ provider, model })
    const configured = await window.api.ai.hasKey(provider)
    set({ provider, model, configured })
  },
  saveKey: async (provider, key) => {
    await window.api.ai.setKey(provider, key)
    if (provider === get().provider) set({ configured: await window.api.ai.hasKey(provider) })
  }
}))
