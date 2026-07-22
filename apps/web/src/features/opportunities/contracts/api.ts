import { z } from "zod"

// ─── Search API Contract ─────────────────────────────────

export const searchBodySchema = z.object({
  keyword: z.string().min(1).max(200),
  searchType: z.enum(["video", "topic", "account"]).default("video"),
  platforms: z
    .array(z.enum(["douyin", "wechat_channels"]))
    .min(1)
    .default(["douyin", "wechat_channels"]),
  projectId: z.string().optional(),
  count: z.number().int().min(5).max(50).default(20),
  cursor: z.string().optional(),
  filters: z
    .object({
      timeRange: z.enum(["24h", "7d", "30d", "all"]).optional(),
      sortOrder: z.enum(["comprehensive", "latest", "popular"]).optional(),
      durationMin: z.number().int().min(0).optional(),
      durationMax: z.number().int().min(0).optional(),
      followerMin: z.number().int().min(0).optional(),
      followerMax: z.number().int().min(0).optional(),
      viewsMin: z.number().int().min(0).optional(),
      likesMin: z.number().int().min(0).optional(),
      commentsMin: z.number().int().min(0).optional(),
      lowFollowerViral: z.boolean().optional(),
      highEngagement: z.boolean().optional(),
      watchedAccountsOnly: z.boolean().optional(),
    })
    .optional(),
})

export type SearchBody = z.infer<typeof searchBodySchema>

// ─── Collection API Contract ─────────────────────────────

export const createCollectionBodySchema = z.object({
  name: z.string().max(200).optional(),
  projectId: z.string().optional(),
  searchRunId: z.string().optional(),
  items: z
    .array(
      z.object({
        platform: z.enum(["douyin", "wechat_channels"]),
        sourceId: z.string(),
        sourceUrl: z.string(),
        title: z.string(),
        authorName: z.string(),
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
        scoreConfidence: z.enum(["high", "medium", "low"]).default("medium"),
      }),
    )
    .min(1)
    .max(10),
})

export type CreateCollectionBody = z.infer<typeof createCollectionBodySchema>

export const createTopicBodySchema = z.object({
  topicIndex: z.number().int().min(0),
  ipProfileId: z.string(),
})

export type CreateTopicBody = z.infer<typeof createTopicBodySchema>
