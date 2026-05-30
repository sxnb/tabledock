import { create } from 'zustand'
import type { AppSettings, SidebarSettings } from '@shared/types'

const DEFAULTS: AppSettings = {
  sidebar: { color: null, noise: 0.15 }
}

interface SettingsState {
  settings: AppSettings
  load: () => Promise<void>
  setSidebar: (patch: Partial<SidebarSettings>) => Promise<void>
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  load: async () => {
    try {
      set({ settings: await window.api.settings.get() })
    } catch {
      // keep defaults
    }
  },
  setSidebar: async (patch) => {
    const next: AppSettings = {
      ...get().settings,
      sidebar: { ...get().settings.sidebar, ...patch }
    }
    set({ settings: next })
    await window.api.settings.set(next).catch(() => undefined)
  }
}))
