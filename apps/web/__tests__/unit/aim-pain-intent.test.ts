import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock("@/lib/llm/client", () => ({
  LLMClient: {
    shared: () => ({ complete: mocks.complete }),
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeEntry: {
      findMany: mocks.findMany,
    },
  },
}))

import {
  enrichKnowledgeQueryWithPainIntent,
  extractExplicitPainIds,
  mergePainIntentIntoKnowledgeContext,
  resolvePainPointIntent,
} from "@/lib/aim-pain-intent"

describe("aim-pain-intent", () => {
  beforeEach(() => {
    mocks.complete.mockReset()
    mocks.findMany.mockReset()
    mocks.findMany.mockResolvedValue([
      {
        id: "ke-p001",
        title: "P001｜已经养了团队没线索",
        content: "客户口语触发词：养了团队、投了没线索\n痛点：团队投入高但没有稳定线索",
        category: "customer_pain",
        tags: ["口语触发"],
        valueGrade: "A",
      },
      {
        id: "ke-p005",
        title: "P005｜买了很多AI用不起来",
        content: "客户口语触发词：买了很多AI、AI用不起来\n痛点：工具买了接不进流程",
        category: "customer_pain",
        tags: ["口语触发"],
        valueGrade: "A",
      },
    ])
  })

  it("extracts explicit pain ids from user text", () => {
    expect(extractExplicitPainIds("按 P001 和 p005 写一条")).toEqual(["P001", "P005"])
  })

  it("uses explicit ids without calling LLM", async () => {
    const intent = await resolvePainPointIntent({
      projectId: "proj-1",
      userText: "用 P001 写口播",
    })

    expect(mocks.complete).not.toHaveBeenCalled()
    expect(intent?.painIds).toEqual(["P001"])
    expect(intent?.intentBlock).toContain("锚定痛点：P001")
    expect(intent?.pinnedEntries[0]?.id).toBe("ke-p001")
  })

  it("uses LLM classification for colloquial input", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        painIds: ["P005"],
        confidence: 0.86,
        reason: "用户说买了很多AI用不起来",
        matchedTriggers: ["买了很多AI", "AI用不起来"],
      }),
    })

    const intent = await resolvePainPointIntent({
      projectId: "proj-1",
      userText: "我们公司开了一堆 AI 会员，但内容流程完全接不上",
    })

    expect(mocks.complete).toHaveBeenCalledOnce()
    expect(intent?.painIds).toEqual(["P005"])
    expect(intent?.matchedTriggers).toContain("AI用不起来")
    expect(intent?.intentBlock).toContain("痛点意图识别（LLM）")
  })

  it("does not pin when confidence is too low", async () => {
    mocks.complete.mockResolvedValue({
      content: JSON.stringify({
        painIds: ["P001"],
        confidence: 0.2,
        reason: "不太确定",
        matchedTriggers: [],
      }),
    })

    const intent = await resolvePainPointIntent({
      projectId: "proj-1",
      userText: "随便聊聊天气",
    })

    expect(intent?.painIds).toEqual([])
    expect(intent?.intentBlock).toBe("")
  })

  it("merges intent block and pinned entries to the front", () => {
    const merged = mergePainIntentIntoKnowledgeContext({
      knowledgeBlock: "=== 企业知识库 ===\n旧内容",
      entries: [
        {
          id: "other",
          title: "其他",
          content: "x",
          category: "user_insight",
          tags: [],
          valueGrade: "B",
          score: 0.5,
        },
      ],
      intent: {
        painIds: ["P001"],
        confidence: 0.9,
        reason: "命中",
        matchedTriggers: ["养了团队"],
        intentBlock: "=== 痛点意图识别（LLM）===\n锚定痛点：P001",
        pinnedEntries: [
          {
            id: "ke-p001",
            title: "P001｜已经养了团队没线索",
            content: "痛点",
            category: "customer_pain",
            tags: [],
            valueGrade: "A",
            score: 1.5,
          },
        ],
      },
    })

    expect(merged.knowledgeBlock.startsWith("=== 痛点意图识别（LLM）===")).toBe(true)
    expect(merged.entries.map((entry) => entry.id)).toEqual(["ke-p001", "other"])
  })

  it("enriches retrieval query with anchored pain ids", () => {
    const query = enrichKnowledgeQueryWithPainIntent("写一条口播", {
      painIds: ["P001"],
      confidence: 0.9,
      reason: "团队没线索",
      matchedTriggers: ["养了团队"],
      intentBlock: "",
      pinnedEntries: [],
    })

    expect(query).toContain("锚定痛点：P001")
    expect(query).toContain("养了团队")
  })
})
