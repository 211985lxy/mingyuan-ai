import { z } from "zod"

// ─── Search ────────────────────────────────────────────────

export const searchBodySchema = z.object({
  keyword: z.string().min(1).max(100),
  platforms: z.array(z.enum(["douyin", "wechat_channels"])).min(1).max(2),
  count: z.number().int().min(5).max(50).optional().default(20),
  filters: z.object({
    sortOrder: z.enum(["comprehensive", "latest", "popular"]).optional(),
    timeRange: z.string().optional(),
    minLikes: z.number().int().min(0).optional(),
    minComments: z.number().int().min(0).optional(),
    maxDurationSeconds: z.number().int().min(0).optional(),
    minDurationSeconds: z.number().int().min(0).optional(),
    lowFollowerViral: z.boolean().optional(),
  }).optional(),
  projectId: z.string().optional(),
})

export type SearchBody = z.infer<typeof searchBodySchema>

// ─── Collections ───────────────────────────────────────────

const collectionItemSchema = z.object({
  platform: z.enum(["douyin", "wechat_channels"]),
  sourceId: z.string().min(1),
  sourceUrl: z.string().url(),
  title: z.string().max(500),
  authorName: z.string().max(100),
  authorId: z.string().optional(),
  followerCount: z.number().int().optional(),
  publishedAt: z.string().optional(),
  durationSeconds: z.number().int().optional(),
  views: z.number().int().optional(),
  likes: z.number().int().optional(),
  comments: z.number().int().optional(),
  shares: z.number().int().optional(),
  collects: z.number().int().optional(),
  opportunityScore: z.number().optional(),
  scoreConfidence: z.string().optional(),
})

export const createCollectionBodySchema = z.object({
  name: z.string().min(1).max(200),
  projectId: z.string().optional(),
  items: z.array(collectionItemSchema).min(1).max(10),
})

export type CreateCollectionBody = z.infer<typeof createCollectionBodySchema>

// ─── Create Topic ──────────────────────────────────────────

export const createTopicBodySchema = z.object({
  topicTitle: z.string().min(1).max(200),
  angle: z.string().optional(),
  rationale: z.string().optional(),
})

export type CreateTopicBody = z.infer<typeof createTopicBodySchema>
