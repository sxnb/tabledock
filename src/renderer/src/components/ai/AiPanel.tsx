import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, ArrowUp, Square, Copy, Terminal, Eraser } from 'lucide-react'
import type { AiChatMessage, DriverKind } from '@shared/types'
import { useWorkspace } from '@renderer/store/workspace'
import { useAi } from '@renderer/store/ai'
import { toast } from '@renderer/store/toasts'
import { buildSchemaContext } from '@renderer/lib/aiSchema'
import { systemPrompt } from '@renderer/lib/aiPrompt'
import { IconButton } from '@renderer/components/ui/IconButton'
import { Button } from '@renderer/components/ui/Button'
import { Spinner } from '@renderer/components/ui/Spinner'
import { cn } from '@renderer/lib/cn'

const RELATIONAL: DriverKind[] = ['mysql', 'mariadb', 'postgres', 'mssql', 'sqlite']

interface AiPanelProps {
  open: boolean
  onClose: () => void
  onConfigure: () => void
}

export function AiPanel({ open, onClose, onConfigure }: AiPanelProps): React.JSX.Element {
  const activeSessionId = useWorkspace((s) => s.activeSessionId)
  const active = useWorkspace((s) => (activeSessionId ? s.sessions[activeSessionId] : null))
  const openQueryTab = useWorkspace((s) => s.openQueryTab)
  const provider = useAi((s) => s.provider)
  const model = useAi((s) => s.model)
  const configured = useAi((s) => s.configured)

  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const reqIdRef = useRef<string | null>(null)
  const schemaCache = useRef<Record<string, string>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  const relational = active?.status === 'connected' && RELATIONAL.includes(active.config.kind)
  const backendId = active?.sessionId ?? null

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const loadSchema = async (): Promise<string> => {
    const sid = backendId as string
    if (schemaCache.current[sid]) return schemaCache.current[sid]
    const db = active!.config.kind === 'sqlite' ? undefined : active!.selectedDatabase
    const graph = await window.api.db.schemaGraph(sid, db)
    const text = buildSchemaContext(graph)
    schemaCache.current[sid] = text
    return text
  }

  const send = async (): Promise<void> => {
    const text = input.trim()
    if (!text || busy || !active || !relational) return
    const history = [...messages, { role: 'user', content: text } as AiChatMessage]
    setMessages([...history, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)
    const id = crypto.randomUUID()
    reqIdRef.current = id
    try {
      const system = systemPrompt(active.config.kind, await loadSchema())
      await window.api.ai.chat(id, { provider, model, system, messages: history }, (delta) => {
        setMessages((prev) => {
          const copy = [...prev]
          const last = copy[copy.length - 1]
          copy[copy.length - 1] = { ...last, content: last.content + delta }
          return copy
        })
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setMessages((prev) => {
        const copy = [...prev]
        copy[copy.length - 1] = { role: 'assistant', content: `⚠️ ${msg}` }
        return copy
      })
    } finally {
      setBusy(false)
      reqIdRef.current = null
    }
  }

  const stop = (): void => {
    if (reqIdRef.current) window.api.ai.cancel(reqIdRef.current)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const runSql = (sql: string): void => {
    if (!active) return
    openQueryTab(active.id, sql)
    toast.success('Opened in a query tab')
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-full flex-col border-l border-border bg-surface shadow-2xl',
          'transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Sparkles size={15} className="text-accent" />
          <span className="text-sm font-semibold text-text">AI Assistant</span>
          <div className="flex-1" />
          <IconButton
            label="Clear conversation"
            onClick={() => setMessages([])}
            disabled={messages.length === 0 || busy}
          >
            <Eraser size={14} />
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </header>

        {!configured ? (
          <CenteredHint
            title="Set up the AI assistant"
            body="Add an OpenAI or Anthropic API key to start asking questions."
            action={
              <Button variant="primary" size="sm" onClick={onConfigure}>
                Open AI settings
              </Button>
            }
          />
        ) : !relational ? (
          <CenteredHint
            title="Open a SQL connection"
            body="The assistant generates SQL for the active MySQL, PostgreSQL, SQL Server, or SQLite connection."
          />
        ) : (
          <>
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {messages.length === 0 ? (
                <p className="px-1 py-4 text-center text-xs text-faint">
                  Ask for data in plain English — e.g. “the 5 newest users with their post counts”.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {messages.map((m, i) => (
                    <li key={i}>
                      <Message
                        message={m}
                        busy={busy && i === messages.length - 1}
                        onRun={runSql}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-border p-2.5">
              <div className="flex items-end gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-2 focus-within:border-accent">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={1}
                  placeholder={`Ask ${provider}…`}
                  className="max-h-32 min-h-0 flex-1 resize-none bg-transparent text-sm text-text placeholder:text-faint focus:outline-none"
                />
                {busy ? (
                  <IconButton label="Stop" onClick={stop}>
                    <Square size={14} />
                  </IconButton>
                ) : (
                  <IconButton label="Send" onClick={() => void send()} disabled={!input.trim()}>
                    <ArrowUp size={16} />
                  </IconButton>
                )}
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-faint">
                Schema is shared with {provider}. Review generated SQL before running it.
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function CenteredHint({
  title,
  body,
  action
}: {
  title: string
  body: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
      <Sparkles size={26} className="text-faint" />
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      <p className="text-xs leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  )
}

/** Split assistant text into prose and ```sql code blocks. */
function segments(content: string): { type: 'text' | 'sql'; value: string }[] {
  const out: { type: 'text' | 'sql'; value: string }[] = []
  const re = /```(?:sql)?\s*\n?([\s\S]*?)```/gi
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: content.slice(last, m.index) })
    out.push({ type: 'sql', value: m[1].trim() })
    last = m.index + m[0].length
  }
  if (last < content.length) out.push({ type: 'text', value: content.slice(last) })
  return out
}

function Message({
  message,
  busy,
  onRun
}: {
  message: AiChatMessage
  busy: boolean
  onRun: (sql: string) => void
}): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="ml-6 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-text">
        {message.content}
      </div>
    )
  }
  return (
    <div className="mr-2 flex flex-col gap-2 text-[13px] text-text">
      {busy && !message.content && <Spinner size={14} />}
      {segments(message.content).map((seg, i) =>
        seg.type === 'sql' ? (
          <div key={i} className="overflow-hidden rounded-md border border-border bg-surface-2">
            <pre className="overflow-x-auto px-3 py-2 font-mono text-[12px] leading-relaxed text-text">
              {seg.value}
            </pre>
            <div className="flex items-center gap-1 border-t border-border px-1.5 py-1">
              <Button size="sm" variant="ghost" onClick={() => onRun(seg.value)}>
                <Terminal size={12} />
                Open in query tab
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard.writeText(seg.value)
                  toast.success('SQL copied')
                }}
              >
                <Copy size={12} />
                Copy
              </Button>
            </div>
          </div>
        ) : (
          seg.value.trim() && (
            <p key={i} className="whitespace-pre-wrap leading-relaxed">
              {seg.value.trim()}
            </p>
          )
        )
      )}
    </div>
  )
}
