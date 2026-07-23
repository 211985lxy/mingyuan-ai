import { describe, expect, it } from "vitest"

import {
  aimChatBodySchema,
  aimGenerateBodySchema,
} from "@/features/aim/contracts/api"
import {
  knowledgeCreateBodySchema,
  obsidianSyncBodySchema,
} from "@/features/knowledge/contracts/api"
import {
  TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS,
  capTopicKnowledgeEntryIds,
  topicGenerateBodySchema,
} from "@/features/topics/contracts/api"
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

  it("normalizes the legacy spoken-script format to the canonical format", () => {
    const body = {
      rawInput: "把这版拆成口播和小红书",
      targetFormats: ["koubo_script", "xiaohongshu_post"],
    }
    expect(aimGenerateBodySchema.safeParse(body).success).toBe(true)
    expect(parseGenerateBody(body).targetFormats).toEqual([
      "video_script",
      "xiaohongshu_post",
    ])
    expect(parseGenerateBody({
      rawInput: "写口播",
      targetFormats: ["video_script", "koubo_script"],
    }).targetFormats).toEqual(["video_script"])
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
    const withinLimit = Array.from(
      { length: TOPIC_GENERATE_MAX_KNOWLEDGE_ENTRY_IDS },
      (_, index) => `entry-${index}`,
    )
    const overLimit = [...withinLimit, "entry-overflow"]

    expect(topicGenerateBodySchema.safeParse({ knowledgeEntryIds: withinLimit }).success).toBe(true)
    expect(topicGenerateBodySchema.safeParse({ knowledgeEntryIds: overLimit }).success).toBe(false)
    expect(capTopicKnowledgeEntryIds(overLimit)).toEqual(withinLimit)
    expect(capTopicKnowledgeEntryIds([])).toBeUndefined()
    expect(competitorDiscoverBodySchema.safeParse({ targetUrl: "x".repeat(2_049) }).success).toBe(false)
    expect(watchRecommendationsBodySchema.safeParse({ limit: 13 }).success).toBe(false)
  })
})
