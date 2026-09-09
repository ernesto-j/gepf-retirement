import { useEffect, useRef, useState } from 'react'
import { useAskAi } from './useAskAi'
import type { AppPage } from '../../engine/types'

/**
 * The chat itself: message list, suggested questions (before the first message), composer, and
 * the "not financial advice" note. Self-contained (wires its own `useAskAi`) so both
 * `AskAiDrawer` and `AskPage` can mount it directly.
 */
export function ChatPanel({
  page,
  pageContext,
  className = '',
}: {
  page?: AppPage
  pageContext?: Record<string, unknown>
  className?: string
}) {
  const { chat, send, stop, loading, error, suggestedQuestions } = useAskAi({ page, pageContext })
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat])

  function submit(question?: string) {
    const value = (question ?? text).trim()
    if (!value || loading) return
    setText('')
    void send(value)
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {chat.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Ask about your numbers on this page — try a suggestion below, or type your own question.
          </div>
        )}
        {chat.map((message, i) => {
          const isLastAssistant = message.role === 'assistant' && i === chat.length - 1
          return (
            <div
              key={i}
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                message.role === 'user' ? 'ml-auto bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'
              }`}
            >
              {message.content || (isLastAssistant && loading ? '…' : '')}
            </div>
          )
        })}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>}
      </div>

      {chat.length === 0 && suggestedQuestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              type="button"
              className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-left text-xs text-brand-800 hover:bg-brand-100"
              onClick={() => submit(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <textarea
          className="input min-h-[2.5rem] flex-1 resize-none"
          rows={2}
          placeholder="Ask about your GEPF numbers, tax, or the trade-offs…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {loading ? (
          <button type="button" className="btn-secondary" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" className="btn-primary" disabled={!text.trim()}>
            Send
          </button>
        )}
      </form>

      <p className="mt-2 text-xs text-slate-500">
        Not financial advice — this assistant explains the numbers in this app. Speak to a licensed financial adviser
        or the GEPF before making a decision.
      </p>
    </div>
  )
}
