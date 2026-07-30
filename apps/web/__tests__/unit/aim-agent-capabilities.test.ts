import { describe, expect, it } from "vitest"

import {
  AIM_AGENT_CAPABILITIES,
  agentAllowsPublishCheck,
  getAimAgentCapabilities,
} from "@/lib/aim/agent-capabilities"
import { AIM_AGENT_IDS, type AimAgentId } from "@/lib/aim-harness/contracts"
import {
  assemblePasteUsageInput,
  createPastedCopyAttachment,
  getAllowedPasteUsages,
  resolveInitialPasteUsage,
} from "@/lib/aim/paste-copy-attachment"
import { resolveContentProducerVideoUrl } from "@/lib/aim/video-copy-input"

describe("AIM agent capability matrix", () => {
  it("covers every AimAgentId and defaults to deny-unknown", () => {
    for (const id of AIM_AGENT_IDS) {
      expect(AIM_AGENT_CAPABILITIES[id]).toBeDefined()
      expect(getAimAgentCapabilities(id)).toEqual(AIM_AGENT_CAPABILITIES[id])
    }
    expect(getAimAgentCapabilities("not_a_real_agent").videoCopyExtraction).toBe(false)
  })

  it("lets content_producer use video / benchmark / style / content mode", () => {
    const caps = getAimAgentCapabilities("content_producer")
    expect(caps).toMatchObject({
      pasteMode: "creative",
      videoCopyExtraction: true,
      benchmarkReference: true,
      styleSample: true,
      contentModeSelector: true,
    })
  })

  it("keeps content_review as review-only without creative side doors", () => {
    const caps = getAimAgentCapabilities("content_review")
    expect(caps.pasteMode).toBe("review")
    expect(caps.videoCopyExtraction).toBe(false)
    expect(caps.benchmarkReference).toBe(false)
    expect(caps.styleSample).toBe(false)
    expect(caps.contentModeSelector).toBe(false)
    expect(getAllowedPasteUsages(caps)).toEqual(["review"])
    expect(resolveInitialPasteUsage({
      pasteMode: "review",
      allowedUsages: getAllowedPasteUsages(caps),
    })).toBe("review")
    const assembled = assemblePasteUsageInput({
      instruction: "",
      attachment: createPastedCopyAttachment("待检查文案", "review"),
    })
    expect(assembled).toContain("【待质检原文】")
    expect(assembled).toContain("不要整篇重写")
  })

  it("auto-marks work_editor long paste as edit and skips creative buttons", () => {
    const caps = getAimAgentCapabilities("work_editor")
    expect(caps.pasteMode).toBe("edit")
    expect(getAllowedPasteUsages(caps)).toEqual(["edit"])
  })

  it("does not let review agent intercept video links as creative input", () => {
    const shareText = "复制打开抖音 https://v.douyin.com/example/ 看看这个视频"
    expect(resolveContentProducerVideoUrl("content_review", shareText)).toBeNull()
    expect(resolveContentProducerVideoUrl("content_producer", shareText)).toBe("https://v.douyin.com/example/")
    expect(resolveContentProducerVideoUrl("content_producer", "参考资料 https://example.com/article")).toBeNull()
  })

  it("allows publishCheck only on the four agents that previously had the action", () => {
    const allowed: AimAgentId[] = [
      "content_producer",
      "free_copywriter",
      "work_editor",
      "content_review",
    ]
    for (const id of allowed) {
      expect(AIM_AGENT_CAPABILITIES[id].publishCheck).toBe(true)
      expect(agentAllowsPublishCheck(id)).toBe(true)
    }
    for (const id of AIM_AGENT_IDS) {
      if (allowed.includes(id)) continue
      expect(AIM_AGENT_CAPABILITIES[id].publishCheck).toBe(false)
      expect(agentAllowsPublishCheck(id)).toBe(false)
    }
  })

  it("denies publishCheck for unknown agent ids via DENY_ALL", () => {
    expect(getAimAgentCapabilities("not_a_real_agent").publishCheck).toBe(false)
    expect(agentAllowsPublishCheck("not_a_real_agent")).toBe(false)
    expect(agentAllowsPublishCheck("totally_fake")).toBe(false)
  })

  it("resolves legacy aliases to the same publishCheck as canonical ids", () => {
    expect(agentAllowsPublishCheck("deep_copywriter")).toBe(true)
    expect(agentAllowsPublishCheck("ip_video")).toBe(true)
    expect(getAimAgentCapabilities("deep_copywriter").publishCheck).toBe(
      AIM_AGENT_CAPABILITIES.work_editor.publishCheck,
    )
    expect(getAimAgentCapabilities("ip_video").publishCheck).toBe(
      AIM_AGENT_CAPABILITIES.content_producer.publishCheck,
    )
  })
})
