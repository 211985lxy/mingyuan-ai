import { describe, expect, it } from "vitest"
import { evaluateIngressPolicy } from "@/lib/ingress-policy"

describe("evaluateIngressPolicy", () => {
  const baseInput = {
    triggerMode: "mention_or_keyword" as const,
    triggerKeywords: ["收选题", "选题"],
    content: "请大家看看这个视频",
  }

  describe("rejects direct messages", () => {
    it("returns DIRECT_MESSAGE_NOT_SUPPORTED for direct conversations", () => {
      const result = evaluateIngressPolicy({ ...baseInput, conversationType: "direct" })
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("DIRECT_MESSAGE_NOT_SUPPORTED")
    })
  })

  describe("rejects file messages", () => {
    it("returns UNSUPPORTED_MESSAGE_TYPE for file type", () => {
      const result = evaluateIngressPolicy({ ...baseInput, messageType: "file" })
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("UNSUPPORTED_MESSAGE_TYPE")
    })
  })

  describe("all trigger mode", () => {
    it("allows all group text messages in all mode", () => {
      const result = evaluateIngressPolicy({
        ...baseInput,
        triggerMode: "all",
        content: "random message",
      })
      expect(result.allowed).toBe(true)
      expect(result.reason).toBe("")
    })

    it("allows all messages even without mentionsBot or keywords", () => {
      const result = evaluateIngressPolicy({
        triggerMode: "all",
        triggerKeywords: [],
        content: "hello world",
      })
      expect(result.allowed).toBe(true)
    })
  })

  describe("mention_or_keyword mode", () => {
    it("allows when mentionsBot is true", () => {
      const result = evaluateIngressPolicy({ ...baseInput, mentionsBot: true })
      expect(result.allowed).toBe(true)
      expect(result.reason).toBe("")
    })

    it("allows when content contains a keyword", () => {
      const result = evaluateIngressPolicy({ ...baseInput, content: "请大家收选题这个视频" })
      expect(result.allowed).toBe(true)
    })

    it("allows when content contains another keyword", () => {
      const result = evaluateIngressPolicy({ ...baseInput, content: "这个选题不错" })
      expect(result.allowed).toBe(true)
    })

    it("rejects when neither mentionsBot nor keyword matches", () => {
      const result = evaluateIngressPolicy({
        ...baseInput,
        mentionsBot: false,
        content: "random message about nothing",
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("TRIGGER_NOT_MATCHED")
    })

    it("rejects when no mentionsBot and no keywords provided", () => {
      const result = evaluateIngressPolicy({
        triggerMode: "mention_or_keyword",
        triggerKeywords: [],
        content: "random message",
      })
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe("TRIGGER_NOT_MATCHED")
    })
  })

  describe("edge cases", () => {
    it("allows group text when no conversationType specified (defaults to group)", () => {
      const result = evaluateIngressPolicy({ ...baseInput, mentionsBot: true })
      expect(result.allowed).toBe(true)
    })

    it("allows share message type", () => {
      const result = evaluateIngressPolicy({ ...baseInput, messageType: "share", mentionsBot: true })
      expect(result.allowed).toBe(true)
    })

    it("allows text message type", () => {
      const result = evaluateIngressPolicy({ ...baseInput, messageType: "text", mentionsBot: true })
      expect(result.allowed).toBe(true)
    })

    it("handles empty triggerKeywords gracefully", () => {
      const result = evaluateIngressPolicy({
        triggerMode: "mention_or_keyword",
        triggerKeywords: [],
        mentionsBot: false,
        content: "收选题",
      })
      expect(result.allowed).toBe(false)
    })

    it("filters non-string keywords", () => {
      const result = evaluateIngressPolicy({
        triggerMode: "mention_or_keyword",
        triggerKeywords: ["收选题", 123, null, undefined] as unknown as string[],
        content: "收选题",
      })
      expect(result.allowed).toBe(true)
    })
  })
})
