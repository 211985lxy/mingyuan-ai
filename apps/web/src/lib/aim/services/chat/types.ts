/**
 * Shared types for the AIM chat context sub-modules.
 *
 * Avoids circular imports: each sub-module imports what it needs from its own
 * dependency tree; this file only gathers the cross-cutting contracts.
 */
import type { AimContextSource } from "@/lib/aim-harness/types"
import type { AimEditorContext } from "@/lib/aim-editor"
import type { AimTraceRecorder } from "@/lib/aim-observability"
import type { AimMemoryMessage } from "@/lib/aim-memory"

// ─── Request ─────────────────────────────────────────────

/** Parsed fields from the raw POST body of /api/aim/chat. */
export type AimChatRequestBody = {
  messages: unknown[]
  agentId: string
  projectId: string
  toolAction: string
  resultId: string
  shouldStream: boolean
  editorContext?: AimEditorContext
}

// ─── Context blocks ─────────────────────────────────────

/** All context blocks retrieved by the loader pipeline. */
export type RetrievedChatContextBlocks = {
  knowledgeBlock: string
  knowledgeContext: { entries: Array<{ id: string; content: string }>; source: string }
  styleBlock: string
  competitorWatchBlock: string
  editorBlock: string
  memoryBlock: string
}

// ─── Assembled context ──────────────────────────────────

/** Full assembled context passed to execution preparation. */
export type AssembledAimChatContext = {
  runtimeTask: string
  conversationIntent: {
    mode: string
    reason: string
    confidence: number
    useKnowledge: boolean
    useMethodology: boolean
    useLongTermMemory: boolean
    useStyleProfile: boolean
  }
  knowledgeBlock: string
  contextManifest: AimContextSource[]
  normalizedMessages: AimMemoryMessage[]
  query: string
  knowledgeEntries: number
  knowledgeSource: string
}
