import { z } from "zod"
import { aimGenerateBodyObjectSchema } from "@/features/aim/contracts/api"
import { inspirationEventBodySchema } from "@/features/knowledge/contracts/api"

const id = z.string().trim().min(1).max(80)

export const agentAimGenerateBodySchema = aimGenerateBodyObjectSchema.pick({
  rawInput: true,
  projectId: true,
  agentId: true,
  targetFormats: true,
  topicTitle: true,
  topicRationale: true,
}).extend({
  // 登录账号只有一个绑定项目；不传时由路由从账号绑定上下文补齐。
  projectId: id.optional(),
  agentId: id,
  instruction: z.string().max(20_000).optional(),
}).strict()

export const agentWechatImportBodySchema = z.object({
  // 登录账号只有一个绑定项目；不传时由路由从账号绑定上下文补齐。
  projectId: id.optional(),
  rawText: z.string().trim().min(1).max(50_000),
}).strict()

const confirmedEntrySchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50_000),
  category: z.enum([
    "boss_experience",
    "product_usp",
    "customer_pain",
    "project_case",
    "customer_qa",
    "daily_inspiration",
    "benchmark_reference",
    "user_insight",
    "hot_topic",
    "positioning_material",
    "private_domain_material",
    "writing_style_profile",
  ], { message: "知识分类不合法" }),
  tags: z.array(z.string().trim().min(1).max(80)).max(20),
  valueGrade: z.enum(["S", "A", "B", "C"]).optional(),
  skip: z.boolean().optional(),
}).strict()

export const agentWechatConfirmBodySchema = z.object({
  // 登录账号只有一个绑定项目；不传时由路由从账号绑定上下文补齐。
  projectId: id.optional(),
  entries: z.array(confirmedEntrySchema).min(1).max(50),
}).strict()

/** Agent 渠道事件沿用主事件契约，但项目由账号绑定上下文自动补齐。 */
export const agentInspirationEventBodySchema = inspirationEventBodySchema.extend({
  projectId: id.optional(),
}).strict()
