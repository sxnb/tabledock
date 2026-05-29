import { create } from 'zustand'
import type { ConnectionConfig } from '@shared/types'

export type TabKind = 'table' | 'query' | 'relations' | 'redis-cmd'

export interface Tab {
  id: string
  kind: TabKind
  title: string
  /** Table name for table tabs. */
  table?: string
}

export interface Session {
  /** Equals the saved connection's id — one live session per connection. */
  id: string
  config: ConnectionConfig
  /** Backend session handle from db:connect, set once connected. */
  sessionId: string | null
  status: 'connecting' | 'connected' | 'error'
  error?: string
  tabs: Tab[]
  activeTabId: string | null
  /** Currently selected database (relational, non-SQLite). */
  selectedDatabase?: string
}

interface WorkspaceState {
  sessions: Record<string, Session>
  order: string[]
  activeSessionId: string | null

  openConnection: (config: ConnectionConfig) => Promise<void>
  closeConnection: (id: string) => Promise<void>
  setActiveSession: (id: string) => void

  setSelectedDatabase: (id: string, database: string) => void
  openTableTab: (id: string, table: string) => void
  openQueryTab: (id: string) => void
  openRelationsTab: (id: string) => void
  setActiveTab: (id: string, tabId: string) => void
  closeTab: (id: string, tabId: string) => void
}

const uid = (): string => crypto.randomUUID()

function patchSession(
  set: (fn: (s: WorkspaceState) => Partial<WorkspaceState>) => void,
  id: string,
  patch: (session: Session) => Session
): void {
  set((state) => {
    const session = state.sessions[id]
    if (!session) return {}
    return { sessions: { ...state.sessions, [id]: patch(session) } }
  })
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  sessions: {},
  order: [],
  activeSessionId: null,

  openConnection: async (config) => {
    const existing = get().sessions[config.id]
    if (existing && existing.status !== 'error') {
      set({ activeSessionId: config.id })
      return
    }

    set((state) => ({
      activeSessionId: config.id,
      order: state.order.includes(config.id) ? state.order : [...state.order, config.id],
      sessions: {
        ...state.sessions,
        [config.id]: {
          id: config.id,
          config,
          sessionId: null,
          status: 'connecting',
          tabs: [],
          activeTabId: null
        }
      }
    }))

    try {
      const sessionId = await window.api.db.connect(config)
      patchSession(set, config.id, (s) => ({ ...s, sessionId, status: 'connected' }))
    } catch (err) {
      patchSession(set, config.id, (s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : String(err)
      }))
    }
  },

  closeConnection: async (id) => {
    const session = get().sessions[id]
    if (session?.sessionId) {
      await window.api.db.disconnect(session.sessionId).catch(() => undefined)
    }
    set((state) => {
      const sessions = { ...state.sessions }
      delete sessions[id]
      const order = state.order.filter((sid) => sid !== id)
      const activeSessionId =
        state.activeSessionId === id ? (order[order.length - 1] ?? null) : state.activeSessionId
      return { sessions, order, activeSessionId }
    })
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  setSelectedDatabase: (id, database) =>
    patchSession(set, id, (s) => ({ ...s, selectedDatabase: database })),

  openTableTab: (id, table) =>
    patchSession(set, id, (s) => {
      const existing = s.tabs.find((t) => t.kind === 'table' && t.table === table)
      if (existing) return { ...s, activeTabId: existing.id }
      const tab: Tab = { id: uid(), kind: 'table', title: table, table }
      return { ...s, tabs: [...s.tabs, tab], activeTabId: tab.id }
    }),

  openQueryTab: (id) =>
    patchSession(set, id, (s) => {
      const count = s.tabs.filter((t) => t.kind === 'query').length
      const tab: Tab = {
        id: uid(),
        kind: 'query',
        title: count === 0 ? 'Query' : `Query ${count + 1}`
      }
      return { ...s, tabs: [...s.tabs, tab], activeTabId: tab.id }
    }),

  openRelationsTab: (id) =>
    patchSession(set, id, (s) => {
      const existing = s.tabs.find((t) => t.kind === 'relations')
      if (existing) return { ...s, activeTabId: existing.id }
      const tab: Tab = { id: uid(), kind: 'relations', title: 'Relations' }
      return { ...s, tabs: [...s.tabs, tab], activeTabId: tab.id }
    }),

  setActiveTab: (id, tabId) => patchSession(set, id, (s) => ({ ...s, activeTabId: tabId })),

  closeTab: (id, tabId) =>
    patchSession(set, id, (s) => {
      const idx = s.tabs.findIndex((t) => t.id === tabId)
      if (idx < 0) return s
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      let activeTabId = s.activeTabId
      if (s.activeTabId === tabId) {
        const next = tabs[idx] ?? tabs[idx - 1] ?? null
        activeTabId = next?.id ?? null
      }
      return { ...s, tabs, activeTabId }
    })
}))
