import { create } from 'zustand'
import type { AppSettings, SidebarSettings, ThemeMode } from '@shared/types'

const DEFAULTS: AppSettings = {
  sidebar: { color: null, noise: 0.15 },
  themeMode: 'dark'
}

interface SettingsState {
  settings: AppSettings
  load: () => Promise<void>
  setSidebar: (patch: Partial<SidebarSettings>) => Promise<void>
  setThemeMode: (mode: ThemeMode) => Promise<void>
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
  },
  setThemeMode: async (themeMode) => {
    const next: AppSettings = { ...get().settings, themeMode }
    set({ settings: next })
    await window.api.settings.set(next).catch(() => undefined)
  }
}))
