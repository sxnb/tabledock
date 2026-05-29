import { create } from 'zustand'
import type { ConnectionConfig } from '@shared/types'

interface ConnectionsState {
  connections: ConnectionConfig[]
  loaded: boolean
  load: () => Promise<void>
  save: (config: ConnectionConfig) => Promise<ConnectionConfig>
  remove: (id: string) => Promise<void>
}

export const useConnections = create<ConnectionsState>((set) => ({
  connections: [],
  loaded: false,
  load: async () => {
    const connections = await window.api.store.list()
    set({ connections, loaded: true })
  },
  save: async (config) => {
    const saved = await window.api.store.save(config)
    set((state) => {
      const idx = state.connections.findIndex((c) => c.id === saved.id)
      const connections = [...state.connections]
      if (idx >= 0) connections[idx] = saved
      else connections.push(saved)
      return { connections }
    })
    return saved
  },
  remove: async (id) => {
    await window.api.store.delete(id)
    set((state) => ({ connections: state.connections.filter((c) => c.id !== id) }))
  }
}))
