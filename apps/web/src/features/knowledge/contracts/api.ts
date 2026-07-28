import { z } from "zod"
import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories"

const id = z.string().trim().min(1).max(80)
const category = z.string().trim().min(1).max(80)
const tags = z.array(z.string().trim().min(1).max(80)).max(20)

export const knowledgeCreateBodySchema = z.object({
  category,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50_000),
  tags: tags.optional(),
  sourceType: z.string().trim().min(1).max(80).optional(),
  projectId: id.optional().nullable(),
  valueGrade: z.enum(["S", "A", "B", "C"]).optional().nullable(),
}).strict()

export const knowledgeUpdateBodySchema = z.object({
  category: category.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(50_000).optional(),
  tags: tags.optional(),
  /** 允许改归属项目；null 表示改为全局资料 */
  projectId: id.optional().nullable(),
}).strict().refine((value) => Object.keys(value).length > 0, "至少提供一个更新字段")

export const obsidianSyncEntrySchema = z.object({
  id,
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50_000),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  tags,
}).strict()

export const obsidianSyncBodySchema = z.object({
  projectId: id.optional(),
  entries: z.array(obsidianSyncEntrySchema).min(1).max(100),
}).strict()

export const inspirationWebhookBodySchema = z.object({
  content: z.string().trim().min(1).max(10_000),
  source: z.enum(["feishu", "wechat", "text"]).optional(),
}).strict()

export const inspirationEventBodySchema = z.object({
  platform: z.enum(["feishu", "workbuddy_wechat", "wecom", "webhook"]),
  externalMessageId: z.string().trim().min(1).max(191).optional(),
  externalChatId: z.string().trim().min(1).max(191),
  externalAccountId: z.string().trim().min(1).max(191).optional(),
  externalSenderId: z.string().trim().min(1).max(191).optional(),
  projectId: id,
  content: z.string().trim().min(1).max(10_000),
  occurredAt: z.string().datetime().optional(),
  conversationType: z.enum(["direct", "group"]).default("group").optional(),
  messageType: z.enum(["text", "share", "file"]).default("text").optional(),
  mentionsBot: z.boolean().optional(),
}).strict()

export const knowledgeListQuerySchema = z.object({
  category: category.optional(),
  status: z.enum(["active", "archived"]).default("active"),
  projectId: id.optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
}).strict()
