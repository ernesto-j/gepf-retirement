import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AiChatMessage,
  AppPage,
  Assumptions,
  GepfMembership,
  LifestyleInputs,
  PersonProfile,
  Profile,
  ScenarioDefinition,
} from '../engine/types'
import { DEFAULT_PROFILE } from '../data/defaults'

export interface AiSettings {
  /** 'server' uses the Express API (ANTHROPIC_API_KEY on the server); 'browser' calls the API directly with the user's key. */
  mode: 'server' | 'browser'
  apiKey: string
  model: string
}

export interface AppState {
  profile: Profile
  /** User-defined scenarios for the planner (the three core routes are always derived from the profile). */
  scenarios: ScenarioDefinition[]
  /** Scenario ids selected in the planner (A, B). Ids may refer to core routes ('stay', 'preserve', 'cash') or saved scenarios. */
  plannerSelection: [string, string]
  page: AppPage
  ai: AiSettings
  chat: AiChatMessage[]
  drawerOpen: boolean

  setProfile: (patch: Partial<Profile>) => void
  setPerson: (patch: Partial<PersonProfile>) => void
  setGepf: (patch: Partial<GepfMembership>) => void
  setLifestyle: (patch: Partial<LifestyleInputs>) => void
  setAssumptions: (patch: Partial<Assumptions>) => void
  replaceProfile: (profile: Profile) => void
  upsertScenario: (scenario: ScenarioDefinition) => void
  removeScenario: (id: string) => void
  setPlannerSelection: (selection: [string, string]) => void
  setPage: (page: AppPage) => void
  setAi: (patch: Partial<AiSettings>) => void
  pushChat: (message: AiChatMessage) => void
  /** Replace the last assistant message's content (used while streaming). */
  updateLastAssistant: (content: string) => void
  clearChat: () => void
  setDrawerOpen: (open: boolean) => void
  resetAll: () => void
}

export const STORAGE_KEY = 'sa-pension-planner-v1'

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      profile: DEFAULT_PROFILE,
      scenarios: [],
      plannerSelection: ['stay', 'preserve'],
      page: 'profile',
      ai: { mode: 'server', apiKey: '', model: 'claude-opus-5' },
      chat: [],
      drawerOpen: false,

      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setPerson: (patch) => set((s) => ({ profile: { ...s.profile, person: { ...s.profile.person, ...patch } } })),
      setGepf: (patch) => set((s) => ({ profile: { ...s.profile, gepf: { ...s.profile.gepf, ...patch } } })),
      setLifestyle: (patch) =>
        set((s) => ({ profile: { ...s.profile, lifestyle: { ...s.profile.lifestyle, ...patch } } })),
      setAssumptions: (patch) =>
        set((s) => ({ profile: { ...s.profile, assumptions: { ...s.profile.assumptions, ...patch } } })),
      replaceProfile: (profile) => set({ profile }),
      upsertScenario: (scenario) =>
        set((s) => {
          const idx = s.scenarios.findIndex((x) => x.id === scenario.id)
          const next = [...s.scenarios]
          if (idx >= 0) next[idx] = scenario
          else next.push(scenario)
          return { scenarios: next }
        }),
      removeScenario: (id) => set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) })),
      setPlannerSelection: (selection) => set({ plannerSelection: selection }),
      setPage: (page) => set({ page }),
      setAi: (patch) => set((s) => ({ ai: { ...s.ai, ...patch } })),
      pushChat: (message) => set((s) => ({ chat: [...s.chat, message] })),
      updateLastAssistant: (content) =>
        set((s) => {
          const chat = [...s.chat]
          const last = chat[chat.length - 1]
          if (last && last.role === 'assistant') chat[chat.length - 1] = { ...last, content }
          else chat.push({ role: 'assistant', content })
          return { chat }
        }),
      clearChat: () => set({ chat: [] }),
      setDrawerOpen: (open) => set({ drawerOpen: open }),
      resetAll: () =>
        set({
          profile: DEFAULT_PROFILE,
          scenarios: [],
          plannerSelection: ['stay', 'preserve'],
          chat: [],
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (s) => ({
        profile: s.profile,
        scenarios: s.scenarios,
        plannerSelection: s.plannerSelection,
        page: s.page,
        ai: s.ai,
        chat: s.chat,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>
        return {
          ...current,
          ...p,
          // deep-merge the profile so new fields added in later versions get defaults
          profile: p.profile
            ? {
                person: { ...DEFAULT_PROFILE.person, ...p.profile.person },
                gepf: { ...DEFAULT_PROFILE.gepf, ...p.profile.gepf },
                lifestyle: { ...DEFAULT_PROFILE.lifestyle, ...p.profile.lifestyle },
                assumptions: { ...DEFAULT_PROFILE.assumptions, ...p.profile.assumptions },
              }
            : current.profile,
          ai: { ...current.ai, ...(p.ai ?? {}) },
        }
      },
    },
  ),
)
