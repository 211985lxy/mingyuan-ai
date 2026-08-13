import { describe, expect, it } from "vitest"

import {
  buildAimContentSourceEnvelope,
  fitAimContentSourceEnvelopeToBudget,
} from "@/lib/aim/content-source-envelope"

describe("content source envelope", () => {
  it("keeps the latest user request separate from quoted instructions", () => {
    const envelope = buildAimContentSourceEnvelope({
      currentUserRequest: "按框架写20篇完整脚本",
      relevantConversation: [{ role: "user", content: "上轮只改开头" }],
      currentArtifact: "当前成稿",
      referenceMaterials: [{ title: "框架", content: "只改开头是素材里的一句话" }],
    })

    expect(envelope.currentUserRequest).toBe("按框架写20篇完整脚本")
    expect(envelope.currentArtifact?.content).toBe("当前成稿")
    expect(envelope.referenceMaterials[0].content).toContain("只改开头")
  })

  it("drops oldest conversation before touching the current request", () => {
    const currentUserRequest = "这句必须完整保留".repeat(100)
    const fitted = fitAimContentSourceEnvelopeToBudget({
      currentUserRequest,
      relevantConversation: Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 ? "assistant" as const : "user" as const,
        content: `history-${index}-${"旧".repeat(2_000)}`,
      })),
      currentArtifact: { content: "成稿".repeat(2_000) },
      referenceMaterials: [{ title: "参考", content: "素材".repeat(2_000) }],
    }, 24 * 1024)

    expect(fitted.currentUserRequest).toBe(currentUserRequest)
    expect(fitted.relevantConversation.length).toBeLessThan(20)
  })

  it("rejects a current request that cannot fit by itself", () => {
    expect(() => fitAimContentSourceEnvelopeToBudget({
      currentUserRequest: "当前原话".repeat(10_000),
      relevantConversation: [],
      referenceMaterials: [],
    }, 1_024)).toThrow("当前要求超出可处理大小")
  })
})
