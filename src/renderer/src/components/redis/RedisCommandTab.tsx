import { useState } from 'react'
import { CornerDownLeft } from 'lucide-react'

interface Entry {
  command: string
  output: string
  error: boolean
}

/** Split a command line into arguments, honoring simple single/double quotes. */
function tokenize(line: string): string[] {
  const matches = line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return matches.map((t) => t.replace(/^['"]|['"]$/g, ''))
}

function stringify(value: unknown): string {
  if (value === null) return '(nil)'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export function RedisCommandTab({ sessionId }: { sessionId: string }): React.JSX.Element {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<Entry[]>([])
  const [running, setRunning] = useState(false)

  const run = async (): Promise<void> => {
    const command = input.trim()
    if (!command || running) return
    setRunning(true)
    try {
      const result = await window.api.redis.command(sessionId, tokenize(command))
      setHistory((h) => [...h, { command, output: stringify(result), error: false }])
      setInput('')
    } catch (err) {
      setHistory((h) => [
        ...h,
        { command, output: err instanceof Error ? err.message : String(err), error: true }
      ])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-xs">
        {history.length === 0 && (
          <p className="text-faint">
            Type a Redis command and press Enter — e.g.{' '}
            <span className="text-muted">SET greeting hello</span> or{' '}
            <span className="text-muted">KEYS *</span>
          </p>
        )}
        <div className="flex flex-col gap-3">
          {history.map((entry, i) => (
            <div key={i}>
              <div className="flex items-center gap-1.5 text-accent">
                <CornerDownLeft size={11} /> {entry.command}
              </div>
              <pre
                className={`mt-1 whitespace-pre-wrap break-all ${entry.error ? 'text-danger' : 'text-text'}`}
              >
                {entry.output}
              </pre>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-surface px-3 py-2">
        <span className="font-mono text-accent">›</span>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void run()
          }}
          placeholder="Redis command…"
          className="h-8 flex-1 bg-transparent font-mono text-xs text-text placeholder:text-faint focus:outline-none"
        />
      </div>
    </div>
  )
}
