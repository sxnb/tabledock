import type { AiChatRequest } from '../db/types'

/**
 * Streams a chat completion from the configured provider, invoking `onDelta`
 * with each text chunk and resolving with the full assembled text. Runs in the
 * main process (the renderer CSP forbids external fetches and we keep the key
 * out of the renderer). Uses the global `fetch` (Electron / Node 22).
 */
export async function streamChat(
  req: AiChatRequest,
  key: string,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<string> {
  return req.provider === 'anthropic'
    ? streamAnthropic(req, key, onDelta, signal)
    : streamOpenAI(req, key, onDelta, signal)
}

/** Yield each `data:` payload from a Server-Sent Events response body. */
async function* sseData(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line.startsWith('data:')) yield line.slice(5).trim()
    }
  }
}

async function streamOpenAI(
  req: AiChatRequest,
  key: string,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: req.model,
      stream: true,
      messages: [{ role: 'system', content: req.system }, ...req.messages]
    }),
    signal
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)

  let full = ''
  for await (const data of sseData(res)) {
    if (data === '[DONE]') break
    try {
      const delta = JSON.parse(data)?.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) {
        full += delta
        onDelta(delta)
      }
    } catch {
      /* ignore keepalive / non-JSON lines */
    }
  }
  return full
}

async function streamAnthropic(
  req: AiChatRequest,
  key: string,
  onDelta: (text: string) => void,
  signal: AbortSignal
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 4096,
      stream: true,
      system: req.system,
      messages: req.messages
    }),
    signal
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)

  let full = ''
  for await (const data of sseData(res)) {
    try {
      const event = JSON.parse(data)
      if (event?.type === 'content_block_delta' && typeof event.delta?.text === 'string') {
        full += event.delta.text
        onDelta(event.delta.text)
      }
    } catch {
      /* ignore */
    }
  }
  return full
}
