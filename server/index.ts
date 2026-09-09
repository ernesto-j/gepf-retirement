/**
 * Express API for the AI layer: streaming chat (`/api/ask`), GEPF statement extraction
 * (`/api/extract-statement`) and a health check (`/api/health`). Serves `dist/` statically in
 * production. See docs/SPEC.md "AI layer" for the contract.
 */
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type Request, type Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { buildMessages, buildSystemPrompt, parseStatementExtraction, STATEMENT_PROMPT, STATEMENT_SCHEMA } from '../src/ai/shared'
import type { AiChatMessage, AiContext } from '../src/engine/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = Number(process.env.PORT) || 8787
const MODEL = process.env.AI_MODEL || 'claude-opus-5'
const API_KEY = process.env.ANTHROPIC_API_KEY || ''

const client = API_KEY ? new Anthropic({ apiKey: API_KEY }) : null

const NO_KEY_RESPONSE = {
  error: 'no_api_key',
  message:
    'The server has no ANTHROPIC_API_KEY configured. Switch to "browser" mode in AI settings and use your own key, or ask the site operator to set one.',
}

/** Maps a thrown value (typed Anthropic SDK errors preferred) to an HTTP status + short message. */
function classifyError(err: unknown): { status: number; type: string; message: string } {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 401, type: 'authentication_error', message: 'The configured Anthropic API key was rejected.' }
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 403, type: 'permission_error', message: err.message }
  }
  if (err instanceof Anthropic.NotFoundError) {
    return { status: 404, type: 'not_found_error', message: err.message }
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, type: 'rate_limit_error', message: 'Rate limited by Anthropic. Please try again shortly.' }
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, type: 'invalid_request_error', message: err.message }
  }
  // APIConnectionError is a subclass of APIError in the TS SDK - check it first.
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, type: 'connection_error', message: 'Could not reach the Anthropic API.' }
  }
  if (err instanceof Anthropic.APIError) {
    return { status: err.status ?? 500, type: err.type ?? 'api_error', message: err.message }
  }
  return { status: 500, type: 'unknown_error', message: err instanceof Error ? err.message : 'Unknown error.' }
}

const app = express()
app.use(express.json({ limit: '25mb' }))

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, hasKey: Boolean(client), model: MODEL })
})

app.post('/api/ask', async (req: Request, res: Response) => {
  if (!client) {
    res.status(503).json(NO_KEY_RESPONSE)
    return
  }

  const body = req.body as { messages?: AiChatMessage[]; context?: AiContext }
  const messages = Array.isArray(body.messages) ? body.messages : []
  const context = body.context
  if (!context || typeof context !== 'object') {
    res.status(400).json({ error: 'invalid_request', message: 'Missing "context" in request body.' })
    return
  }
  if (messages.length === 0) {
    res.status(400).json({ error: 'invalid_request', message: '"messages" must be a non-empty array.' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (payload: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }

  let stream: ReturnType<Anthropic['messages']['stream']> | undefined
  try {
    stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } }],
      messages: buildMessages(messages, context),
    })
  } catch (err) {
    const { message } = classifyError(err)
    send({ done: true, error: message })
    res.end()
    return
  }

  req.on('close', () => stream?.abort())
  stream.on('text', (delta) => send({ delta }))

  try {
    const final = await stream.finalMessage()
    send({ done: true, usage: final.usage })
  } catch (err) {
    const { message } = classifyError(err)
    send({ done: true, error: message })
  } finally {
    res.end()
  }
})

app.post('/api/extract-statement', async (req: Request, res: Response) => {
  if (!client) {
    res.status(503).json(NO_KEY_RESPONSE)
    return
  }

  const body = req.body as { pdfBase64?: string; imageBase64?: string; mediaType?: string }
  const { pdfBase64, imageBase64, mediaType } = body
  if ((!pdfBase64 && !imageBase64) || (pdfBase64 && imageBase64)) {
    res.status(400).json({ error: 'invalid_request', message: 'Provide exactly one of "pdfBase64" or "imageBase64".' })
    return
  }
  if (!mediaType) {
    res.status(400).json({ error: 'invalid_request', message: 'Missing "mediaType".' })
    return
  }

  const contentBlock: Record<string, unknown> = pdfBase64
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system:
        'You extract structured data from GEPF (Government Employees Pension Fund) benefit statements. Follow the given schema exactly and never invent a figure that is not on the statement.',
      output_config: { format: { type: 'json_schema', schema: STATEMENT_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [contentBlock, { type: 'text', text: STATEMENT_PROMPT }],
        },
      ],
    })

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) {
      res.status(502).json({ error: 'extraction_failed', message: 'The model did not return a structured result.' })
      return
    }

    try {
      res.json(parseStatementExtraction(textBlock.text))
    } catch {
      res.status(502).json({ error: 'extraction_failed', message: 'The model returned unparseable JSON.' })
    }
  } catch (err) {
    const { status, type, message } = classifyError(err)
    res.status(status).json({ error: type, message })
  }
})

if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, '../dist')
  app.use(express.static(distDir))
  app.use((req: Request, res: Response, next: () => void) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next()
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`AI server listening on http://localhost:${PORT} (model=${MODEL}, hasKey=${Boolean(client)})`)
})

export default app
