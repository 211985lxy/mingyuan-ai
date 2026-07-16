import { z } from "zod"
import { aimGenerateBodySchema } from "@/features/aim/contracts/api"

const id = z.string().trim().min(1).max(80)

export const agentAimGenerateBodySchema = aimGenerateBodySchema.pick({
  rawInput: true,
  projectId: true,
  agentId: true,
  targetFormats: true,
  topicTitle: true,
  topicRationale: true,
}).extend({
  projectId: id,
  agentId: id,
  instruction: z.string().max(20_000).optional(),
}).strict()

export const agentWechatImportBodySchema = z.object({
  projectId: id,
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
  projectId: id,
  entries: z.array(confirmedEntrySchema).min(1).max(50),
}).strict()
