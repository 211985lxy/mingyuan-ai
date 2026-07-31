import { describe, expect, it } from "vitest"

import {
  formatHistoryTitle,
  groupHistoryByAgent,
  isExpertSectionExpanded,
  normalizeSidebarAgentId,
  parseExpandedAgentsSnapshot,
  resolveHistoryNavAgentId,
  type AimHistoryListItem,
} from "@/lib/aim-sidebar-history"
import type { AimAgentId } from "@/lib/aim-ui-config"

const agents: AimAgentId[] = [
  "business_system_diagnosis",
  "business_diagnosis",
  "content_producer",
  "work_editor",
  "content_retro",
]

function item(partial: Partial<AimHistoryListItem> & Pick<AimHistoryListItem, "id" | "agentId">): AimHistoryListItem {
  return {
    rawInput: "用户：测试主题内容足够长",
    topicTitle: null,
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:00.000Z",
    videoScript: null,
    rawCopy: null,
    wechatArticle: null,
    momentsPost: null,
    communityMessage: null,
    ...partial,
  }
}

describe("aim-sidebar-history", () => {
  it("normalizes legacy agent aliases", () => {
    expect(normalizeSidebarAgentId("ip_video")).toBe("content_producer")
    expect(normalizeSidebarAgentId("deep_copywriter")).toBe("work_editor")
    expect(normalizeSidebarAgentId("content_producer")).toBe("content_producer")
    expect(normalizeSidebarAgentId(null)).toBeNull()
    expect(normalizeSidebarAgentId("not_an_agent")).toBeNull()
  })

  it("groups history under each expert without cross-agent bleed", () => {
    const history = [
      item({ id: "1", agentId: "content_producer", topicTitle: "口播A", videoScript: "稿", updatedAt: "2026-07-31T12:00:00.000Z" }),
      item({ id: "2", agentId: "ip_video", topicTitle: "口播B", videoScript: "稿", updatedAt: "2026-07-31T11:00:00.000Z" }),
      item({ id: "3", agentId: "work_editor", topicTitle: "润色", rawCopy: "稿", updatedAt: "2026-07-31T10:30:00.000Z" }),
      item({ id: "4", agentId: null, topicTitle: "孤儿", rawCopy: "稿", updatedAt: "2026-07-31T13:00:00.000Z" }),
      item({ id: "5", agentId: "business_diagnosis", topicTitle: "选题", rawCopy: "稿", updatedAt: "2026-07-31T09:00:00.000Z" }),
    ]

    const grouped = groupHistoryByAgent(history, agents, 8)

    expect(grouped.get("content_producer")?.map((row) => row.id)).toEqual(["1", "2"])
    expect(grouped.get("work_editor")?.map((row) => row.id)).toEqual(["3"])
    expect(grouped.get("business_diagnosis")?.map((row) => row.id)).toEqual(["5"])
    expect(grouped.get("content_retro")).toEqual([])
    // 无 agentId 不进任何桶
    expect([...grouped.values()].flat().some((row) => row.id === "4")).toBe(false)
  })

  it("caps items per agent", () => {
    const history = Array.from({ length: 5 }, (_, index) =>
      item({
        id: `c-${index}`,
        agentId: "content_producer",
        topicTitle: `T${index}`,
        videoScript: "稿",
        updatedAt: `2026-07-31T1${index}:00:00.000Z`,
      }),
    )
    const grouped = groupHistoryByAgent(history, agents, 2)
    expect(grouped.get("content_producer")).toHaveLength(2)
    expect(grouped.get("content_producer")?.map((row) => row.id)).toEqual(["c-4", "c-3"])
  })

  it("expands only the active expert by default", () => {
    expect(isExpertSectionExpanded("content_producer", "content_producer", {})).toBe(true)
    expect(isExpertSectionExpanded("work_editor", "content_producer", {})).toBe(false)
    expect(isExpertSectionExpanded("work_editor", "content_producer", { work_editor: true })).toBe(true)
    expect(isExpertSectionExpanded("content_producer", "content_producer", { content_producer: false })).toBe(false)
  })

  it("formats titles with format label", () => {
    expect(formatHistoryTitle(item({
      id: "t1",
      agentId: "content_producer",
      topicTitle: "AI提升认知的三心法",
      videoScript: "正文",
    }))).toContain("口播｜")
  })

  it("resolves nav agent with safe fallback", () => {
    expect(resolveHistoryNavAgentId("ip_video", "work_editor")).toBe("content_producer")
    expect(resolveHistoryNavAgentId(null, "work_editor")).toBe("work_editor")
    expect(resolveHistoryNavAgentId(null, null)).toBe("content_producer")
  })

  it("parses expanded snapshot safely", () => {
    expect(parseExpandedAgentsSnapshot('{"content_producer":true}')).toEqual({
      content_producer: true,
    })
    expect(parseExpandedAgentsSnapshot("not-json")).toEqual({})
    expect(parseExpandedAgentsSnapshot("[]")).toEqual({})
  })
})
