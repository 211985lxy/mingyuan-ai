import { z } from "zod"

const id = z.string().trim().min(1).max(80)

/** Max knowledge entries accepted by /api/topics/generate (matches Prisma take). */
export const TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS = 12

/**
 * Cap knowledge entry IDs to the generate API contract.
 * Callers may hold more than 12 pool entries after restoring the topic workbench.
 */
export function capTopicKnowledgeEntryIds(ids: string[] | undefined | null): string[] | undefined {
  if (!ids?.length) return undefined
  return ids.slice(0, TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS)
}

export const topicGenerateBodySchema = z.object({
  projectId: id.optional().nullable(),
  recommendationMode: z.enum(["normal", "daily", "weekly"], {
    message: "recommendationMode 必须是 normal、daily 或 weekly",
  }).optional(),
  knowledgeEntryIds: z.array(id).max(TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS).optional(),
  elementCodes: z.array(z.string().min(1).max(80)).max(3).optional(),
  refreshCount: z.number().int().min(0).max(20).optional(),
}).strict()

export const topicChatBodySchema = z.object({
  projectId: id,
  content: z.string().trim().min(2).max(10_000),
}).strict()

export const topicSelectBodySchema = z.object({
  selectedIndex: z.number().int().min(0).max(3),
}).strict()
