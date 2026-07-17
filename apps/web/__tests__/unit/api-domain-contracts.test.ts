import { describe, expect, it } from "vitest"

import {
  aimChatBodySchema,
  aimGenerateBodySchema,
} from "@/features/aim/contracts/api"
import {
  knowledgeCreateBodySchema,
  obsidianSyncBodySchema,
} from "@/features/knowledge/contracts/api"
import { topicGenerateBodySchema } from "@/features/topics/contracts/api"
import {
  competitorDiscoverBodySchema,
  watchRecommendationsBodySchema,
} from "@/features/competitor/contracts/api"
import { parseGenerateBody } from "@/lib/aim-generate-validate"
import {
  isKnowledgeCategory,
  isKnowledgeSourceType,
  KNOWLEDGE_CATEGORIES,
} from "@/lib/knowledge-categories"

describe("domain API contracts", () => {
  it("rejects unknown AIM fields and excessive chat history", () => {
    expect(aimChatBodySchema.safeParse({
      messages: [{ role: "user", content: "写一条文案" }],
      injected: true,
    }).success).toBe(false)

    expect(aimChatBodySchema.safeParse({
      messages: Array.from({ length: 51 }, () => ({ role: "user", content: "继续" })),
    }).success).toBe(false)
  })

  it("keeps every content format exposed by the AIM client", () => {
    const body = {
      rawInput: "把这版拆成口播和小红书",
      targetFormats: ["koubo_script", "xiaohongshu_post"],
    }
    expect(aimGenerateBodySchema.safeParse(body).success).toBe(true)
    expect(parseGenerateBody(body).targetFormats).toEqual([
      "koubo_script",
      "xiaohongshu_post",
    ])
  })

  it("bounds knowledge content, tags, and import batches", () => {
    expect(knowledgeCreateBodySchema.safeParse({
      category: "customer_pain",
      title: "客户问题",
      content: "真实问题",
      tags: Array.from({ length: 21 }, (_, index) => `tag-${index}`),
    }).success).toBe(false)

    expect(obsidianSyncBodySchema.safeParse({ entries: [] }).success).toBe(false)
  })

  it("accepts every canonical knowledge category for Obsidian sync", () => {
    for (const category of KNOWLEDGE_CATEGORIES) {
      expect(obsidianSyncBodySchema.safeParse({
        entries: [{
          id: `entry-${category}`,
          title: "知识条目",
          content: "真实内容",
          category,
          tags: [],
        }],
      }).success).toBe(true)
    }

    expect(obsidianSyncBodySchema.safeParse({
      entries: [{
        id: "entry-invalid",
        title: "知识条目",
        content: "真实内容",
        category: "not_a_category",
        tags: [],
      }],
    }).success).toBe(false)
  })

  it("rejects non-string values in canonical knowledge type guards", () => {
    expect(isKnowledgeCategory(undefined)).toBe(false)
    expect(isKnowledgeCategory({ category: "customer_pain" })).toBe(false)
    expect(isKnowledgeSourceType(null)).toBe(false)
  })

  it("bounds topic sources and competitor inputs", () => {
    expect(topicGenerateBodySchema.safeParse({
      knowledgeEntryIds: Array.from({ length: 13 }, (_, index) => `entry-${index}`),
    }).success).toBe(false)
    expect(competitorDiscoverBodySchema.safeParse({ targetUrl: "x".repeat(2_049) }).success).toBe(false)
    expect(watchRecommendationsBodySchema.safeParse({ limit: 13 }).success).toBe(false)
  })
})
