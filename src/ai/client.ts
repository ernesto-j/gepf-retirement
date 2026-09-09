/**
 * Browser-side AI client: routes to the Express server (`mode: 'server'`) or calls the Anthropic
 * SDK directly with the user's own key (`mode: 'browser'`, `dangerouslyAllowBrowser: true`). See
 * docs/SPEC.md "AI layer".
 */
import Anthropic from '@anthropic-ai/sdk'
import type { AiChatMessage, AiContext, GepfStatementValues } from '../engine/types'
import type { AiSettings } from '../store/useAppStore'
import { buildMessages, buildSystemPrompt, parseStatementExtraction, STATEMENT_PROMPT, STATEMENT_SCHEMA } from './shared'

/** Thrown by `askStream` / `extractStatement` with a message safe to show the user directly. */
export class AskAiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AskAiError'
    this.status = status
  }
}

const IMAGE_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_FILE_BYTES = 18 * 1024 * 1024 // keeps base64 (~1.37x) comfortably under the server's 25 MB body limit

// ---------------------------------------------------------------------------
// Incremental SSE parsing (robust to the fetch stream splitting chunks anywhere,
// including mid-line or mid-JSON) — exported for unit testing.
// ---------------------------------------------------------------------------

export class SseParser {
  private buffer = ''

  /** Feed the next chunk of raw text; returns any complete `data:` events it completes. */
  push(chunk: string): unknown[] {
    this.buffer += chunk
    const events: unknown[] = []
    let boundary: number
    while ((boundary = this.buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = this.buffer.slice(0, boundary)
      this.buffer = this.buffer.slice(boundary + 2)
      const dataLines = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
      if (dataLines.length === 0) continue
      try {
        events.push(JSON.parse(dataLines.join('\n')))
      } catch {
        // Malformed event - ignore rather than crash the stream.
      }
    }
    return events
  }
}

interface AskDoneEvent {
  done: true
  usage?: unknown
  error?: string
}
interface AskDeltaEvent {
  delta: string
}
function isAskDone(e: unknown): e is AskDoneEvent {
  return Boolean(e) && typeof e === 'object' && (e as AskDoneEvent).done === true
}
function isAskDelta(e: unknown): e is AskDeltaEvent {
  return Boolean(e) && typeof e === 'object' && typeof (e as AskDeltaEvent).delta === 'string'
}

export interface AskStreamResult {
  usage?: unknown
}

/** Maps a caught error (ideally a typed Anthropic SDK error) to a short, user-facing message. */
function friendlyAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'That API key was rejected. Check it in AI settings.'
  if (err instanceof Anthropic.PermissionDeniedError) return 'That API key is not permitted to do this.'
  if (err instanceof Anthropic.NotFoundError) return `Model not found: ${err.message}`
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by Anthropic. Please try again shortly.'
  if (err instanceof Anthropic.BadRequestError) return `Request rejected: ${err.message}`
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API from your browser.'
  if (err instanceof Anthropic.APIError) return err.message
  if (err instanceof Error) return err.message
  return 'Unknown error talking to the AI.'
}

function browserClient(settings: AiSettings): Anthropic {
  if (!settings.apiKey.trim()) {
    throw new AskAiError('No API key set. Add your Anthropic API key in AI settings, or switch to server mode.')
  }
  return new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true })
}

/**
 * Streams an assistant reply for `messages` (chat history including the new user turn) given
 * `context`. Calls `onDelta` with the ACCUMULATED text so far after every chunk (matching
 * `useAppStore.updateLastAssistant`, which replaces the whole message content). Resolves with
 * usage once the stream ends; rejects with `AskAiError` on any failure (no key, no server,
 * network error, or a typed API error).
 */
export async function askStream(
  messages: AiChatMessage[],
  context: AiContext,
  settings: AiSettings,
  onDelta: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<AskStreamResult> {
  if (settings.mode === 'browser') {
    return askStreamBrowser(messages, context, settings, onDelta, signal)
  }
  return askStreamServer(messages, context, onDelta, signal)
}

async function askStreamServer(
  messages: AiChatMessage[],
  context: AiContext,
  onDelta: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<AskStreamResult> {
  let response: Response
  try {
    response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new AskAiError('Could not reach the AI server. Is it running (`npm run server` or `npm run dev`)?')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new AskAiError(body?.message || `AI server returned ${response.status}.`, response.status)
  }
  if (!response.body) throw new AskAiError('The AI server response had no body.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  let text = ''
  let result: AskStreamResult = {}

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    for (const event of parser.push(decoder.decode(value, { stream: true }))) {
      if (isAskDelta(event)) {
        text += event.delta
        onDelta(text)
      } else if (isAskDone(event)) {
        if (event.error) throw new AskAiError(event.error)
        result = { usage: event.usage }
      }
    }
  }
  return result
}

async function askStreamBrowser(
  messages: AiChatMessage[],
  context: AiContext,
  settings: AiSettings,
  onDelta: (fullText: string) => void,
  signal?: AbortSignal,
): Promise<AskStreamResult> {
  const client = browserClient(settings)
  const model = settings.model?.trim() || 'claude-opus-5'

  const stream = client.messages.stream({
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } }],
    messages: buildMessages(messages, context),
  })

  const onAbort = () => stream.abort()
  signal?.addEventListener('abort', onAbort)

  let text = ''
  stream.on('text', (delta) => {
    text += delta
    onDelta(text)
  })

  try {
    const final = await stream.finalMessage()
    return { usage: final.usage }
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) throw err
    throw new AskAiError(friendlyAnthropicError(err))
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

// ---------------------------------------------------------------------------
// Statement extraction
// ---------------------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new AskAiError('Could not read the file.'))
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

function validateStatementFile(file: File): { kind: 'pdf' | 'image'; mediaType: string } {
  if (file.size > MAX_FILE_BYTES) {
    throw new AskAiError(`File is too large (${Math.round(file.size / 1024 / 1024)} MB). Please use a file under ${MAX_FILE_BYTES / 1024 / 1024} MB.`)
  }
  if (file.type === 'application/pdf') return { kind: 'pdf', mediaType: file.type }
  if (IMAGE_MEDIA_TYPES.has(file.type)) return { kind: 'image', mediaType: file.type }
  throw new AskAiError('Unsupported file type. Upload a PDF, PNG, JPEG, GIF or WEBP of your GEPF statement.')
}

/** Extracts `GepfStatementValues` from a PDF or image of a GEPF benefit statement. */
export async function extractStatement(file: File, settings: AiSettings): Promise<GepfStatementValues> {
  const { kind, mediaType } = validateStatementFile(file)
  const base64 = await fileToBase64(file)

  if (settings.mode === 'browser') {
    const client = browserClient(settings)
    const model = settings.model?.trim() || 'claude-opus-5'
    const contentBlock =
      kind === 'pdf'
        ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } }
        : {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
          }
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system:
          'You extract structured data from GEPF (Government Employees Pension Fund) benefit statements. Follow the given schema exactly and never invent a figure that is not on the statement.',
        output_config: { format: { type: 'json_schema', schema: STATEMENT_SCHEMA } },
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: STATEMENT_PROMPT }] }],
      })
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
      if (!textBlock) throw new AskAiError('The model did not return a structured result.')
      return parseStatementExtraction(textBlock.text)
    } catch (err) {
      if (err instanceof AskAiError) throw err
      throw new AskAiError(friendlyAnthropicError(err))
    }
  }

  let response: Response
  try {
    response = await fetch('/api/extract-statement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kind === 'pdf' ? { pdfBase64: base64, mediaType } : { imageBase64: base64, mediaType }),
    })
  } catch {
    throw new AskAiError('Could not reach the AI server. Is it running (`npm run server` or `npm run dev`)?')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new AskAiError(body?.message || `AI server returned ${response.status}.`, response.status)
  }
  return body as GepfStatementValues
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface ServerHealth {
  ok: boolean
  hasKey: boolean
  model: string
}

/** Returns the server's health, or `null` if it could not be reached (e.g. not running). */
export async function checkServerHealth(): Promise<ServerHealth | null> {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return null
    return (await response.json()) as ServerHealth
  } catch {
    return null
  }
}
