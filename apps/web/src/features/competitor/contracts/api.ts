import { z } from "zod"

const id = z.string().trim().min(1).max(80)
const profileUrl = z.string().trim().min(1).max(2_048)

export const competitorAnalyzeBodySchema = z.object({ url: profileUrl }).strict()
export const competitorDiscoverBodySchema = z.object({ targetUrl: profileUrl }).strict()
export const watchAccountCreateBodySchema = z.object({ url: profileUrl }).strict()
export const watchAccountRefreshBodySchema = z.object({ accountId: id.optional() }).strict()

export const watchRecommendationsBodySchema = z.object({
  projectId: id.optional().nullable(),
  intent: z.string().trim().max(2_000).optional(),
  categories: z.array(z.string().min(1).max(80)).max(20).optional(),
  limit: z.number().int().min(1).max(12).optional(),
}).strict()

export const watchVideoExtractBodySchema = z.object({
  watchAccountId: id,
  videoUrl: z.string().trim().min(1).max(2_048),
}).strict()

export const competitorResearchBodySchema = z.object({
  query: z.string().trim().min(1).max(500),
}).strict()

export const competitorReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  targetUrl: z.string().trim().max(2_048).optional(),
}).strict()
