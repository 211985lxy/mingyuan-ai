import { z } from "zod"

const id = z.string().trim().min(1).max(80)

export const topicGenerateBodySchema = z.object({
  projectId: id.optional().nullable(),
  recommendationMode: z.enum(["normal", "daily", "weekly"], {
    message: "recommendationMode 必须是 normal、daily 或 weekly",
  }).optional(),
  knowledgeEntryIds: z.array(id).max(12).optional(),
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
