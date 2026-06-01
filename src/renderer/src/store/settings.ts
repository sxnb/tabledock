import { create } from 'zustand'
import type { AppSettings, SidebarSettings, ThemeMode } from '@shared/types'

const DEFAULTS: AppSettings = {
  sidebar: { color: null, noise: 0.15 },
  themeMode: 'dark',
  showAiButton: true
}

interface SettingsState {
  settings: AppSettings
  /** The theme actually in effect (derived; 'system' resolved against the OS). */
  resolvedTheme: 'light' | 'dark'
  load: () => Promise<void>
  setSidebar: (patch: Partial<SidebarSettings>) => Promise<void>
  setThemeMode: (mode: ThemeMode) => Promise<void>
  setShowAiButton: (show: boolean) => Promise<void>
  setResolvedTheme: (theme: 'light' | 'dark') => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: DEFAULTS,
  resolvedTheme: 'dark',
  setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),
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
  },
  setShowAiButton: async (showAiButton) => {
    const next: AppSettings = { ...get().settings, showAiButton }
    set({ settings: next })
    await window.api.settings.set(next).catch(() => undefined)
  }
}))
