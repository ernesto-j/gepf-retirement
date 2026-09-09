import { useAppStore } from '../store/useAppStore'
import { useResults } from '../store/useResults'
import { Callout, PageHeader, Section } from '../components/ui'
import { ChatPanel } from '../components/ai/ChatPanel'
import { ContextChips } from '../components/ai/ContextChips'
import { AiSettingsPanel } from '../components/ai/AiSettingsPanel'

/** Full-page AI chat: the chat itself, plus what's being shared with it and a privacy note. */
export default function AskPage() {
  const page = useAppStore((s) => s.page)
  const clearChat = useAppStore((s) => s.clearChat)
  const { core } = useResults()

  return (
    <div>
      <PageHeader
        title="Ask AI"
        intro="Chat about your GEPF numbers, the tax on each route, and the trade-offs between staying and leaving. Answers use only what's summarised alongside the chat — never invented figures."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card flex h-[70vh] min-h-[420px] flex-col lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Chat</h2>
          <ChatPanel page={page} className="flex-1" />
        </div>

        <div className="flex flex-col gap-4">
          <Section title="What the AI can see" description="Sent along with every message you send, so answers stay grounded in your real numbers.">
            <ContextChips page={page} scenarioCount={core.length} />
          </Section>

          <AiSettingsPanel onClear={clearChat} />

          <Callout tone="info" title="Privacy">
            Server mode sends your question and the context above to this app's own server, which calls Anthropic
            using a shared key. Browser mode sends them straight from your browser to Anthropic using your own key —
            stored only in this browser's localStorage, never on our server. Nothing here is stored beyond your
            device unless you choose to act on it (e.g. applying an extracted statement to your profile).
          </Callout>
        </div>
      </div>
    </div>
  )
}
