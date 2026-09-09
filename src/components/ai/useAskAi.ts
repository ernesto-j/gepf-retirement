import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useResults } from '../../store/useResults'
import { askStream, AskAiError } from '../../ai/client'
import { buildAiContext, SUGGESTED_QUESTIONS } from '../../ai/shared'
import type { AiChatMessage, AppPage } from '../../engine/types'
import { summariseResults } from './summariseResults'

export interface UseAskAiOptions {
  /** Defaults to the store's current page. Pass an explicit page for a page-scoped panel. */
  page?: AppPage
  /** Extra page-specific context (selected fund ids, chart settings, etc). */
  pageContext?: Record<string, unknown>
}

export interface UseAskAi {
  chat: AiChatMessage[]
  send: (text: string) => Promise<void>
  stop: () => void
  loading: boolean
  error: string | null
  clearChat: () => void
  suggestedQuestions: string[]
  page: AppPage
}

/** Wires the chat store + AI client into a single hook shared by the drawer and the Ask page. */
export function useAskAi(options: UseAskAiOptions = {}): UseAskAi {
  const chat = useAppStore((s) => s.chat)
  const pushChat = useAppStore((s) => s.pushChat)
  const updateLastAssistant = useAppStore((s) => s.updateLastAssistant)
  const clearChatStore = useAppStore((s) => s.clearChat)
  const ai = useAppStore((s) => s.ai)
  const profile = useAppStore((s) => s.profile)
  const storePage = useAppStore((s) => s.page)
  const { core } = useResults()
  const page = options.page ?? storePage

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const send = useCallback(
    async (text: string) => {
      const question = text.trim()
      if (!question || loading) return
      setError(null)
      const history = [...chat, { role: 'user' as const, content: question }]
      pushChat({ role: 'user', content: question })
      pushChat({ role: 'assistant', content: '' })
      setLoading(true)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const scenarios = await summariseResults(core)
        const context = buildAiContext(page, profile, scenarios, options.pageContext)
        await askStream(history, context, ai, (fullText) => updateLastAssistant(fullText), controller.signal)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          // User cancelled - leave whatever text streamed in so far.
        } else {
          const message = err instanceof AskAiError ? err.message : 'Something went wrong talking to the AI.'
          setError(message)
          updateLastAssistant(message)
        }
      } finally {
        setLoading(false)
        abortRef.current = null
      }
    },
    [ai, chat, core, loading, options.pageContext, page, profile, pushChat, updateLastAssistant],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    chat,
    send,
    stop,
    loading,
    error,
    clearChat: clearChatStore,
    suggestedQuestions: SUGGESTED_QUESTIONS[page],
    page,
  }
}
