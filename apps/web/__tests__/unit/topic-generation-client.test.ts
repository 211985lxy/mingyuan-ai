import { expect, it } from "vitest"
import { TOPIC_GENERATE_TIMEOUT_MS } from "@/lib/api/client"
import {
  TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS,
  capTopicKnowledgeEntryIds,
} from "@/features/topics/contracts/api"

it("keeps the daily topic request alive through provider fallback", () => {
  expect(TOPIC_GENERATE_TIMEOUT_MS).toBe(180000)
})

it("caps knowledge entry ids before topic generate requests", () => {
  const ids = Array.from({ length: TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS + 5 }, (_, i) => `k-${i}`)
  const capped = capTopicKnowledgeEntryIds(ids)
  expect(capped).toHaveLength(TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS)
  expect(capped?.[0]).toBe("k-0")
  expect(capped?.at(-1)).toBe(`k-${TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS - 1}`)
})
